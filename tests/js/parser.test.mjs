import test from "node:test";
import assert from "node:assert/strict";
import { parseDiagram } from "../../src/pugflow/web/parser.mjs";

const PUG = [
  "#diagram",
  "  node.annotation.above",
  "    | System",
  "    | boundary",
  "  node.id root",
  "  node.shape pill",
  "  node.fill #123456",
  "  node.label Root",
  "  .flow",
  "    .ports distributed",
  "    .line.arrow-style forward",
  "    .line.label request",
  "    .entry",
  "      .line.color #00ff00",
  "      node.id a",
  "      node.width 180",
  "      node.label",
  "        | Alpha",
  "        | service",
  "    .entry",
  "      .line.arrow-style both",
  "      .line.stroke-style dashed",
  "      node.annotation.below Important",
  "      node.id b",
  "      node.shape diamond",
  "      node.label Beta",
  "  .merge",
  "    .ports shared",
  "    .line.label-position below",
  "    .source",
  "      .ref a",
  "      .line.label $x_1$",
  "    .source",
  "      .ref b",
  "    .entry",
  "      node.id result",
  "      node.shape hexagon",
  "      node.label Result",
].join("\n");

test("parses Pug flows, block styles, and annotations", () => {
  const result = parseDiagram(PUG);
  assert.deepEqual(result.errors, []);
  assert.equal(result.format, "pug");
  assert.equal(result.nodes.length, 4);
  assert.equal(result.nodes[0].style.shape, "pill");
  assert.equal(result.nodes[0].annotations[0].text, "System\nboundary");
  assert.equal(result.nodes[1].label, "Alpha\nservice");
  assert.equal(result.nodes[2].annotations[0].position, "below");
  assert.equal(result.edges[0].label, "request");
  assert.equal(result.edges[0].color, "#00ff00");
  assert.equal(result.edges[1].direction, "both");
  assert.equal(result.edges[1].style, "dashed");
  assert.equal(result.edges[0].portDistribution, "distributed");
  assert.equal(result.edges[2].portDistribution, "shared");
});

test("defines reusable custom node types before the diagram", () => {
  const result = parseDiagram([
    "@node my_node",
    "  node.shape pill",
    "  node.fill #245886",
    "  node.color #ffffff",
    "  node.shadow-color #000000",
    "  node.shadow-offset-x 3",
    "  node.shadow-offset-y 5",
    "  node.shadow-blur 7",
    "  node.shadow-opacity 0.4",
    "  node.image badge.png",
    "  node.image-width 48",
    "  node.image-height 32",
    "  node.image-fit cover",
    "  node.image-opacity 0.8",
    "",
    "#diagram",
    "  .node.fill #eeeeee",
    "  .node.outline #111111",
    "  my_node.id root",
    "  my_node.image-offset (6, -4)",
    "  my_node.label Styled root",
    "  .flow",
    "    .entry",
    "      node.label Plain child",
  ].join("\n"));

  assert.deepEqual(result.errors, []);
  assert.equal(result.nodes[0].style.shape, "pill");
  assert.equal(result.nodes[0].style.fill, "#245886");
  assert.equal(result.nodes[0].style.color, "#ffffff");
  assert.equal(result.nodes[0].style.outline, "#111111");
  assert.deepEqual([result.nodes[0].style.shadowColor, result.nodes[0].style.shadowOffsetX, result.nodes[0].style.shadowOffsetY, result.nodes[0].style.shadowBlur, result.nodes[0].style.shadowOpacity], ["#000000", 3, 5, 7, 0.4]);
  assert.deepEqual([result.nodes[0].style.image, result.nodes[0].style.imageWidth, result.nodes[0].style.imageHeight, result.nodes[0].style.imageFit, result.nodes[0].style.imageOpacity], ["badge.png", 48, 32, "cover", 0.8]);
  assert.deepEqual([result.nodes[0].imageOffsetX, result.nodes[0].imageOffsetY], [6, -4]);
  assert.equal(result.nodes[1].style.fill, "#eeeeee");
});

test("supports nested nodes and reusable line and annotation classes", () => {
  const result = parseDiagram([
    "@node primary_node",
    "  .shape pill",
    "  .fill #245886",
    "@line warning_line",
    "  .color #ef4444",
    "  .stroke-style dashed",
    "@annotation warning_note",
    "  .color #f59e0b",
    "#diagram",
    "  .primary_node",
    "    .id root",
    "    .label Root",
    "    .annotation",
    "      .above",
    "        .warning_note",
    "        | Watch this",
    "  .flow",
    "    .node",
    "      .warning_line",
    "        .label alert",
    "      .label Child",
  ].join("\n"));

  assert.deepEqual(result.errors, []);
  assert.equal(result.nodes[0].style.shape, "pill");
  assert.equal(result.nodes[0].annotations[0].color, "#f59e0b");
  assert.equal(result.nodes[0].annotations[0].text, "Watch this");
  assert.equal(result.edges[0].color, "#ef4444");
  assert.equal(result.edges[0].lineType, "warning_line");
  assert.equal(result.edges[0].style, "dashed");
  assert.equal(result.edges[0].label, "alert");
});

test("supports fully nested diagram defaults", () => {
  const result = parseDiagram([
    "#diagram",
    "  .background #ffffff",
    "  .defaults",
    "    .node",
    "      .color #111827",
    "    .line",
    "      .color #222222",
    "    .annotation",
    "      .color #333333",
    "  .node",
    "    .label Root",
  ].join("\n"));

  assert.deepEqual(result.errors, []);
  assert.equal(result.figure.background, "#ffffff");
  assert.equal(result.figure.text, "#111827");
  assert.equal(result.figure.label, "#222222");
  assert.equal(result.figure.annotation, "#333333");
  assert.equal(result.figure.merge, null);
});

test("treats directly nested nodes as children", () => {
  const result = parseDiagram([
    "#diagram",
    "  .node",
    "    .id root",
    "    .label Root",
    "    .node",
    "      .id first",
    "      .label First",
    "    .node",
    "      .id second",
    "      .label Second",
  ].join("\n"));

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.edges.map((edge) => [edge.from, edge.to]), [["root", "first"], ["root", "second"]]);
});

test("chains sibling nodes inside a flow", () => {
  const result = parseDiagram([
    "#diagram",
    "  .node",
    "    .id one",
    "    .label One",
    "    .flow",
    "      .node",
    "        .id two",
    "        .label Two",
    "      .node",
    "        .id three",
    "        .label Three",
    "      .node",
    "        .id four",
    "        .label Four",
  ].join("\n"));

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.edges.map((edge) => [edge.from, edge.to]), [["one", "two"], ["two", "three"], ["three", "four"]]);
});

test("reports undefined custom node types", () => {
  const result = parseDiagram("#diagram\n  missing_node.label Root");
  assert.match(result.errors.join("\n"), /unknown node type "missing_node"/);
});

test("parses explicit merge sources and per-line labels", () => {
  const mergeEdges = parseDiagram(PUG).edges.filter((edge) => edge.kind === "merge");
  assert.equal(mergeEdges.length, 2);
  assert.deepEqual(mergeEdges.map((edge) => edge.from), ["a", "b"]);
  assert.equal(mergeEdges[0].label, "$x_1$");
  assert.equal(mergeEdges[0].to, "result");
});

test("supports merge from shorthand", () => {
  const result = parseDiagram([
    "#diagram",
    "  node.label Root",
    "  .flow",
    "    .entry",
    "      node.id a",
    "      node.label A",
    "    .entry",
    "      node.id b",
    "      node.label B",
    "  .merge",
    "    .from a b",
    "    .entry",
    "      node.label Result",
  ].join("\n"));
  assert.deepEqual(result.errors, []);
  assert.equal(result.edges.filter((edge) => edge.kind === "merge").length, 2);
});

test("reports malformed Pug and missing merge sources", () => {
  const missing = parseDiagram([
    "#diagram",
    "  node.label Root",
    "  .merge",
    "    .from a b",
    "    .entry",
    "      node.label Result",
  ].join("\n"));
  const malformed = parseDiagram("#diagram\n node.label Root");
  assert.match(missing.errors[0], /has not been defined/);
  assert.match(malformed.errors[0], /two spaces/);
});

test("rejects legacy wrapper and span syntax", () => {
  const wrapper = parseDiagram("#wrapper\n  node.label Root");
  const span = parseDiagram("#diagram\n  span.label Root");
  const labelAttributes = parseDiagram('#diagram\n  node.label(id="root") Root');
  assert.ok(wrapper.errors.length);
  assert.ok(span.errors.length);
  assert.match(labelAttributes.errors[0], /does not accept attributes/);
});

test("rejects the old inline diagram and connection settings", () => {
  const result = parseDiagram([
    '#diagram(background="#fff")',
    "  node.label Root",
    '  .flow(direction="none")',
    "    .entry",
    "      node.label Child",
  ].join("\n"));

  assert.match(result.errors.join("\n"), /does not accept inline attributes/);
});

test("rejects removed branch syntax", () => {
  const result = parseDiagram("#diagram\n  node.label Root\n  .branch\n    .node\n      .label Child");
  assert.match(result.errors.join("\n"), /\.branch has been removed/);
});

test("connects existing nodes with independent endpoint directions", () => {
  const result = parseDiagram([
    "#diagram",
    "  .node",
    "    .id root",
    "    .label Root",
    "    .node",
    "      .id source",
    "      .label Source",
    "    .node",
    "      .id target",
    "      .label Target",
    "    .connect",
    "      .from source",
    "      .from-direction left",
    "      .to target",
    "      .to-direction down",
  ].join("\n"));
  assert.deepEqual(result.errors, []);
  const connection = result.edges.find((edge) => edge.kind === "connection");
  assert.equal(connection.layoutDirection, "left");
  assert.equal(connection.targetLayoutDirection, "down");
});

test("applies figure defaults and retains per-block overrides", () => {
  const source = [
    "#diagram",
    "  .background #fffaf0",
    "  .font Arial",
    "  .node.color #202020",
    "  .node.shape pill",
    "  .node.fill #eeeeee",
    "  .node.outline-width 3",
    "  .node.align left",
    "  .line.color #303030",
    "  .annotation.color #606060",
    "  node.id root",
    "  node.label Root",
    "  .flow",
    "    .entry",
    "      node.id child",
    "      node.shape square",
    "      node.color #abcdef",
    "      node.label Child",
  ].join("\n");
  const result = parseDiagram(source);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.figure, {
    background: "#fffaf0",
    label: "#303030",
    text: "#202020",
    merge: null,
    annotation: "#606060",
    font: "Arial",
  });
  assert.equal(result.nodes[0].style.shape, "pill");
  assert.equal(result.nodes[0].style.fill, "#eeeeee");
  assert.equal(result.nodes[0].style.outlineWidth, 3);
  assert.equal(result.nodes[0].style.align, "left");
  assert.equal(result.nodes[1].style.shape, "square");
  assert.equal(result.nodes[1].style.color, "#abcdef");
  assert.equal(result.edges[0].color, "#303030");
});

test("marks hidden entries without removing them or their connections from layout data", () => {
  const source = [
    "#diagram",
    "  node.id root",
    "  node.label Root",
    "  .flow",
    "    .entry",
    "      .line.label hidden edge",
    "      node.annotation.above Hidden annotation",
    "      node.id hidden",
    "      node.hidden",
    "      node.label Hidden block",
    "      .flow",
    "        .entry",
    "          node.id after",
    "          node.label After",
  ].join("\n");
  const result = parseDiagram(source);

  assert.deepEqual(result.errors, []);
  assert.equal(result.nodes.length, 3);
  assert.equal(result.edges.length, 2);
  assert.equal(result.nodes.find((node) => node.id === "hidden").hidden, true);
  assert.equal(result.nodes.find((node) => node.id === "after").hidden, false);
});

test("parses persistent node, annotation, and connection-label offsets", () => {
  const source = [
    "#diagram",
    "  node.annotation.above Note",
    "    .offset (-4, 6)",
    "  node.offset (12.5, -8)",
    "  node.label-offset (3, 4)",
    "  node.label Root",
    "  .flow",
    "    .entry",
    "      .line.label moved",
    "      .line.label-offset (7, -2)",
    "      node.label Child",
  ].join("\n");
  const result = parseDiagram(source);

  assert.deepEqual(result.errors, []);
  assert.equal(result.nodes[0].offsetX, 12.5);
  assert.equal(result.nodes[0].offsetY, -8);
  assert.equal(result.nodes[0].labelOffsetX, 3);
  assert.equal(result.nodes[0].labelOffsetY, 4);
  assert.equal(result.nodes[0].annotations[0].offsetX, -4);
  assert.equal(result.nodes[0].annotations[0].offsetY, 6);
  assert.equal(result.edges[0].labelOffsetX, 7);
  assert.equal(result.edges[0].labelOffsetY, -2);
});

test("rejects non-tuple offsets", () => {
  const result = parseDiagram([
    "#diagram",
    "  node.offset 12, -8",
    "  node.label Root",
  ].join("\n"));

  assert.match(result.errors[0], /must be a tuple/);
});

test("allows an intentionally empty node label", () => {
  const result = parseDiagram("#diagram\n  .node\n    .id blank\n    .label");
  assert.deepEqual(result.errors, []);
  assert.equal(result.nodes[0].label, "");
  assert.equal(result.nodes[0].id, "blank");
});
