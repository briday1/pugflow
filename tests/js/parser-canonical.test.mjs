import test from "node:test";
import assert from "node:assert/strict";
import { parseDiagram } from "../../src/pugflow/web/parser.mjs";

const SOURCE = [
  "@node service",
  "  .shape pill",
  "  .fill #245886",
  "@flow warning",
  "  .color #ef4444",
  "  .stroke-style dashed",
  "@annotation note",
  "  .color #f59e0b",
  "#canvas",
  "  .background #ffffff",
  "  .defaults",
  "    .node",
  "      .outline #111111",
  "    .flow",
  "      .width 2",
  "    .annotation",
  "      .font-style italic",
  "  graph",
  "    .id main",
  "    .layer 2",
  "    .service",
  "      .id root",
  "      .label Root",
  "      .annotation",
  "        .above Note",
  "          .note",
  "    .node",
  "      .id left",
  "      .label Left",
  "    .node",
  "      .id right",
  "      .label Right",
  "    .node",
  "      .id result",
  "      .label Result",
  "    .flow",
  "      .from root",
  "      .to left",
  "      .warning",
  "      .label request",
  "      .from-direction down",
  "      .to-direction down",
  "      .ports distributed",
  "    .flow",
  "      .from root",
  "      .to right",
  "    .flow",
  "      .from left",
  "      .to result",
  "    .flow",
  "      .from right",
  "      .to result",
].join("\n");

test("parses canonical flat graphs, direct nodes, and explicit flows", () => {
  const result = parseDiagram(SOURCE);
  assert.deepEqual(result.errors, []);
  assert.equal(result.nodes.length, 4);
  assert.deepEqual(result.edges.map(({ from, to }) => [from, to]), [
    ["root", "left"], ["root", "right"], ["left", "result"], ["right", "result"],
  ]);
  assert.equal(result.nodes.find((node) => node.id === "result")?.kind, "merge");
  assert.equal(result.edges.filter((edge) => edge.to === "result").every((edge) => edge.kind === "merge"), true);
  assert.deepEqual(result.groups[0].nodeIds, ["root", "left", "right", "result"]);
  assert.equal(result.groups[0].layer, 2);
});

test("applies @node, @flow, @annotation, and .defaults > .flow styles", () => {
  const result = parseDiagram(SOURCE);
  assert.deepEqual(result.errors, []);
  const root = result.nodes.find((node) => node.id === "root");
  const warning = result.edges.find((edge) => edge.from === "root" && edge.to === "left");
  assert.equal(root.style.shape, "pill");
  assert.equal(root.style.outline, "#111111");
  assert.equal(root.annotations[0].color, "#f59e0b");
  assert.equal(root.annotations[0].fontStyle, "italic");
  assert.equal(warning.color, "#ef4444");
  assert.equal(warning.style, "dashed");
  assert.equal(warning.width, 2);
  assert.equal(warning.label, "request");
  assert.equal(warning.portDistribution, "distributed");
});

test("resolves flow endpoints declared after the flow", () => {
  const result = parseDiagram("#canvas\n  graph\n    .flow\n      .from first\n      .to second\n    .node\n      .id first\n      .label First\n    .node\n      .id second\n      .label Second");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.edges.map(({ from, to }) => [from, to]), [["first", "second"]]);
});

test("supports canvas-level cross-graph flows", () => {
  const result = parseDiagram("#canvas\n  graph\n    .id first-graph\n    .node\n      .id first\n      .label First\n  graph\n    .id second-graph\n    .node\n      .id second\n      .label Second\n  .flow\n    .from first\n    .to second\n    .source-face bottom\n    .target-face left\n    .arrow-style both\n    .roundness 0");
  assert.deepEqual(result.errors, []);
  assert.equal(result.edges[0].sourceFace, "bottom");
  assert.equal(result.edges[0].targetFace, "left");
  assert.equal(result.edges[0].direction, "both");
  assert.equal(result.edges[0].roundness, 0);
});

test("retains offsets, annotations, visibility, and empty labels", () => {
  const result = parseDiagram("#canvas\n  graph\n    .hidden\n    .node\n      .id root\n      .offset (12.5, -8)\n      .label-offset (3, 4)\n      .label\n      .annotation\n        .above Note\n          .offset (-4, 6)");
  assert.deepEqual(result.errors, []);
  assert.equal(result.nodes[0].label, "");
  assert.deepEqual([result.nodes[0].offsetX, result.nodes[0].offsetY], [12.5, -8]);
  assert.deepEqual([result.nodes[0].labelOffsetX, result.nodes[0].labelOffsetY], [3, 4]);
  assert.deepEqual([result.nodes[0].annotations[0].offsetX, result.nodes[0].annotations[0].offsetY], [-4, 6]);
  assert.equal(result.nodes[0].hidden, true);
});

test("parses integer node layers and retains source order for layer ties", () => {
  const result = parseDiagram("#canvas\n  graph\n    .node\n      .id back\n      .layer -1\n      .label Back\n    .node\n      .id front\n      .layer 3\n      .label Front");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.nodes.map(({ id, layer, sourceIndex }) => [id, layer, sourceIndex]), [
    ["back", -1, 0],
    ["front", 3, 1],
  ]);
});

test("infers initial node layers from declaration order without requiring source fields", () => {
  const source = "#canvas\n  graph\n    .node\n      .id back\n      .label Back\n    .node\n      .id middle\n      .label Middle\n    .node\n      .id front\n      .label Front";
  const result = parseDiagram(source);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.nodes.map(({ id, layer, explicitLayer }) => [id, layer, explicitLayer]), [
    ["back", 0, false],
    ["middle", 1, false],
    ["front", 2, false],
  ]);
  assert.doesNotMatch(source, /\.layer/);
});

test("rejects non-integer node layers", () => {
  const result = parseDiagram("#canvas\n  graph\n    .node\n      .layer 1.5\n      .label Invalid");
  assert.match(result.errors.join("\n"), /node\.layer must be an integer/);
});

test("rejects removed legacy structure with actionable errors", () => {
  const cases = [
    ["#canvas\n  graph\n    .node\n      .label Parent\n      .node\n        .label Child", /nodes cannot contain nodes or flows/],
    ["#canvas\n  graph\n    .node\n      .label Root\n    .merge", /\.merge has been removed/],
    ["#canvas\n  graph\n    .members one two", /\.members has been removed/],
    ["#canvas\n  graph\n    .node\n      .id a\n      .label A\n    .node\n      .id b\n      .label B\n    .flow\n      .from a\n      .to b\n      .line\n        .color red", /not valid inside \.flow/],
  ];
  for (const [source, expected] of cases) assert.match(parseDiagram(source).errors.join("\n"), expected);
});

test("enforces flow scope and validates malformed fields", () => {
  const crossGraph = parseDiagram("#canvas\n  graph\n    .id one\n    .node\n      .id a\n      .label A\n  graph\n    .id two\n    .node\n      .id b\n      .label B\n    .flow\n      .from a\n      .to b");
  assert.match(crossGraph.errors.join("\n"), /place cross-graph flows directly under #canvas/);
  const missing = parseDiagram("#canvas\n  graph\n    .node\n      .id a\n      .label A\n    .flow\n      .from a\n      .to missing");
  assert.match(missing.errors.join("\n"), /flow target "missing" is not defined/);
  const offset = parseDiagram("#canvas\n  graph\n    .node\n      .offset 12, -8\n      .label Root");
  assert.match(offset.errors.join("\n"), /must be a tuple/);
});
