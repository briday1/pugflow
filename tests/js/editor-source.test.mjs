import test from "node:test";
import assert from "node:assert/strict";
import { appendDiagramNode, appendFlowNode, appendMergeNode, indentSourceSelection, removeNodeReferences, removeNodeField, setAnnotationOffsetField, setNodeField, setNodeImageGeometry, setNodeLineType, setNodeOffsetField, setNodeType, setStructuralField, setStructuralLineType, setStructuralOffsetField } from "../../src/pugflow/web/editor-source.mjs";
import { parseDiagram } from "../../src/pugflow/web/parser.mjs";

test("edits inspector-backed node and connector properties", () => {
  const source = "#diagram\n  .node\n    .id root\n    .offset (2, 3)\n    .label\n      | Old\n      | label\n  .connect\n    .from root\n    .to root";
  let edited = setNodeField(source, 5, "label", "New label");
  edited = setNodeField(edited, 5, "fill", "#123456");
  edited = setNodeType(edited, 6, "custom_node");
  edited = removeNodeField(edited, 5, "offset");
  edited = setStructuralField(edited, 5, "line.width", "3");
  assert.match(edited, /\.custom_node\n    \.id root\n    \.label New label/);
  assert.doesNotMatch(edited, /\.fill #123456/);
  assert.doesNotMatch(edited, /\.offset/);
  assert.match(edited, /\.connect\n    \.line\.width 3/);
});

test("inserts and updates persistent node offsets beside the label", () => {
  const source = [
    "#diagram",
    "  node.id root",
    "  node.label Root",
    "  .flow",
    "    .entry",
    "      node.label Child",
  ].join("\n");
  const inserted = setNodeOffsetField(source, 3, "offset", 12.26, -4.04);
  assert.match(inserted, /node\.offset \(12\.3, -4\)\n  node\.label Root/);

  const updated = setNodeOffsetField(inserted, 4, "offset", 20, 8);
  assert.equal((updated.match(/node\.offset/g) ?? []).length, 1);
  assert.match(updated, /node\.offset \(20, 8\)/);
});

test("writes offsets into annotation and connection declarations", () => {
  const annotation = "#diagram\n  node.annotation.above Note\n  node.label Root";
  assert.match(setAnnotationOffsetField(annotation, 2, 3, -2), /\.offset \(3, -2\)/);
  const source = "#diagram\n  node.label Root\n  .flow\n    .entry\n      .line.label request\n      .line.label-offset (1, 2)\n      node.label Child";
  assert.match(setStructuralOffsetField(source, 4, 5, 6), /\.line\.label-offset \(5, 6\)/);
});

test("preserves a custom node type when adding offsets", () => {
  const source = "@node my_node\n  node.fill #123456\n#diagram\n  my_node.label Root";
  const updated = setNodeOffsetField(source, 4, "offset", 2, 3);
  assert.match(updated, /my_node\.offset \(2, 3\)\n  my_node\.label Root/);
  assert.equal(
    setAnnotationOffsetField("#diagram\n  my_node.annotation.above Note\n  my_node.label Root", 2, 4, 5),
    "#diagram\n  my_node.annotation.above Note\n    .offset (4, 5)\n  my_node.label Root",
  );
});

test("writes an independently draggable image offset", () => {
  const source = "#diagram\n  .node\n    .image photo.png\n    .label Root";
  const updated = setNodeOffsetField(source, 4, "image-offset", 7.25, -3.04);
  assert.match(updated, /    \.image-offset \(7\.3, -3\)\n    \.label Root/);
});

test("writes image handle resizing as one stable geometry edit", () => {
  const source = "#diagram\n  .node\n    .image photo.png\n    .image-width 40\n    .label Root";
  const updated = setNodeImageGeometry(source, 5, 72, 55, 8.25, -4.04);
  assert.match(updated, /    \.image-height 55\n    \.image-offset \(8\.3, -4\)\n    \.image photo\.png\n    \.image-width 72/);
  assert.equal((updated.match(/\.image-width/g) ?? []).length, 1);
});

test("preserves fully nested syntax when writing offsets", () => {
  const source = [
    "#diagram",
    "  .node",
    "    .label Root",
    "  .flow",
    "    .node",
    "      .line",
    "        .label request",
    "      .label Child",
  ].join("\n");
  const nodeMoved = setNodeOffsetField(source, 3, "offset", 4, 5);
  assert.match(nodeMoved, /  \.node\n    \.offset \(4, 5\)\n    \.label Root/);
  const lineMoved = setStructuralOffsetField(nodeMoved, 6, 6, 7);
  assert.match(lineMoved, /      \.line\n        \.label-offset \(6, 7\)\n        \.label request/);
});

test("writes label offsets into a reusable line group", () => {
  const source = [
    "#diagram",
    "  .node",
    "    .label Root",
    "    .node",
    "      .warning_line",
    "        .label request",
    "      .label Child",
  ].join("\n");
  const moved = setStructuralOffsetField(source, 4, 8, -3);
  assert.match(moved, /      \.warning_line\n        \.label-offset \(8, -3\)\n        \.label request/);
});

test("switches reusable line types while clearing appearance overrides", () => {
  const source = "#diagram\n  .node\n    .id root\n    .label Root\n    .flow\n      .warning_line\n        .color red\n        .label request\n      .line.width 5\n      .node\n        .quiet_line\n          .stroke-style dotted\n          .label response\n        .label Child";
  const structural = setStructuralLineType(source, 5, "success_line", ["warning_line", "quiet_line", "success_line"]);
  assert.match(structural, /    \.flow\n      \.success_line\n        \.label request/);
  assert.doesNotMatch(structural, /\.color red|\.line\.width 5/);
  const incoming = setNodeLineType(structural, 12, "success_line", ["warning_line", "quiet_line", "success_line"]);
  assert.match(incoming, /      \.node\n        \.success_line\n          \.label response\n        \.label Child/);
  assert.doesNotMatch(incoming, /\.stroke-style dotted/);
});

test("builds a typed flow node inside the selected parent", () => {
  const source = "#diagram\n  .node\n    .id root\n    .label Root";
  const updated = appendFlowNode(source, 4, { direction: "down", ports: "distributed", nodeType: "card", lineType: "warning", id: "child", label: "Child" });
  assert.match(updated, /    \.flow\n      \.direction down\n      \.ports distributed\n      \.warning\n      \.card\n        \.id child\n        \.label Child/);
  const plain = appendFlowNode(source, 4, { id: "child", label: "Child" });
  assert.deepEqual(parseDiagram(plain).errors, []);
  assert.equal(parseDiagram(plain).nodes.length, 2);
});

test("builds a standalone connected-diagram component", () => {
  const source = "#diagram\n  .node\n    .id root\n    .label Root";
  const updated = appendDiagramNode(source, { nodeType: "node", id: "free", label: "Standalone", diagramId: "free-graph", diagramLabel: "Free graph" });
  assert.match(updated, /  graph\n    \.id free-graph\n    \.label Free graph\n    \.node\n      \.id free\n      \.label Standalone/);
  const graph = parseDiagram(updated);
  assert.deepEqual(graph.errors, []);
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.groups[1].rootId, "free");
});

test("inserts a nested graph only inside the selected graph", () => {
  const source = "#canvas\n  graph\n    .id outer\n    .node\n      .id root\n      .label Root";
  const updated = appendDiagramNode(source, { parentGraphLineNumber: 2, diagramId: "inner", id: "child", label: "Child" });
  assert.match(updated, /  graph\n    \.id outer[\s\S]*    graph\n      \.id inner\n      \.node\n        \.id child/);
  const parsed = parseDiagram(updated);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.groups.length, 2);
});

test("appends sibling graphs after blank lines at the canvas level", () => {
  const source = "#canvas\n  graph\n    .node\n      .id root\n      .label Root\n\n    .flow\n      .node\n        .id child\n        .label Child";
  const updated = appendDiagramNode(source, { diagramId: "second", id: "other", label: "Other" });
  assert.match(updated, /        \.label Child\n  graph\n    \.id second/);
  const parsed = parseDiagram(updated);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.groups.length, 2);
  assert.equal(parsed.edges.some((edge) => edge.from === "root" && edge.to === "other"), false);
});

test("builds a merge target from existing source IDs", () => {
  const source = "#diagram\n  .node\n    .id root\n    .label Root\n    .flow\n      .node\n        .id left\n        .label Left\n      .node\n        .id right\n        .label Right";
  const updated = appendMergeNode(source, 4, { sources: ["left", "right"], direction: "up", nodeType: "result", id: "combined", label: "Combined" });
  assert.match(updated, /    \.merge\n      \.direction up\n      \.ports shared\n      \.source\n        \.ref left\n      \.source\n        \.ref right\n      \.result\n        \.id combined\n        \.label Combined/);
  const plain = appendMergeNode(source, 4, { sources: ["left", "right"], id: "combined", label: "Combined" });
  assert.deepEqual(parseDiagram(plain).errors, []);
  assert.equal(parseDiagram(plain).edges.filter((edge) => edge.kind === "merge").length, 2);
});

test("indents and unindents complete selected lines", () => {
  const source = ".node\n  .label Root\n.flow";
  const indented = indentSourceSelection(source, 0, source.indexOf(".flow"), false);
  assert.equal(indented.value, "  .node\n    .label Root\n.flow");
  assert.equal(indentSourceSelection(indented.value, indented.start, indented.end, true).value, source);
});

test("removes merge and connection references before deleting a node", () => {
  const source = "#canvas\n  graph\n    .node\n      .id one\n      .label One\n      .node\n        .id two\n        .label Two\n      .node\n        .id three\n        .label Three\n    .merge\n      .source\n        .ref one\n      .source\n        .ref two\n      .source\n        .ref three\n      .node\n        .id combined\n        .label Combined\n    .connect\n      .from two\n      .to one";
  const cleaned = removeNodeReferences(source, "two");
  assert.doesNotMatch(cleaned, /\.ref two|\.from two|\.to two/);
  assert.deepEqual(parseDiagram(cleaned).errors, []);
});
