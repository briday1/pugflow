import test from "node:test";
import assert from "node:assert/strict";
import { appendDiagramNode, appendFlowNode, appendFlowReference, appendMergeNode, appendNodeAnnotation, groupNodesAsGraph, indentSourceSelection, removeNodeAnnotation, removeNodeDeclaration, removeNodeReferences, removeNodeField, renameNodeReferences, setAnnotationOffsetField, setAnnotationPosition, setAnnotationText, setNodeAnnotationField, setNodeAnnotationText, setNodeField, setNodeImageGeometry, setNodeLineType, setNodeOffsetField, setNodeType, setStructuralField, setStructuralLineType, setStructuralOffsetField } from "../../src/pugflow/web/editor-source.mjs";
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

test("renames node references when an optional ID changes", () => {
  const source = "#diagram\n  .node\n    .id old-id\n    .label Root\n  .connect\n    .from old-id\n    .to old-id\n  .merge\n    .source\n      .ref old-id";
  const renamed = renameNodeReferences(source, "old-id", "new-id");
  assert.match(renamed, /\.from new-id\n    \.to new-id/);
  assert.match(renamed, /\.ref new-id/);
  assert.doesNotMatch(renamed, /(?:\.from|\.to|\.ref) old-id/);
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

test("updates inline and multiline annotation text without losing its styles", () => {
  const inline = "#canvas\n  graph\n    .node\n      .label Root\n      .annotation\n        .above Old\n          .color #123456";
  const multiline = setAnnotationText(inline, 6, "First\nSecond");
  assert.match(multiline, /\.above\n          \| First\n          \| Second\n          \.color #123456/);
  const compact = setAnnotationText(multiline, 6, "Replacement");
  assert.match(compact, /\.above Replacement\n          \.color #123456/);
  assert.doesNotMatch(compact, /\| First|\| Second/);
});

test("creates missing above and below annotations from node properties", () => {
  const source = "#canvas\n  graph\n    .node\n      .id root\n      .label Root";
  const above = setNodeAnnotationText(source, 5, "above", "New above");
  assert.match(above, /\.annotation\n        \.above New above/);
  const below = setNodeAnnotationField(above, parseDiagram(above).nodes[0].lineNumber, "below", "font-style", "italic");
  assert.match(below, /\.below\n          \.font-style italic/);
  assert.deepEqual(parseDiagram(below).errors, []);
  assert.equal(parseDiagram(below).nodes[0].annotations.find((item) => item.position === "above").text, "New above");
});

test("adds, repositions, and independently removes repeated node annotations", () => {
  const source = "#canvas\n  graph\n    .node\n      .label Root";
  const first = appendNodeAnnotation(source, 4, { position: "above", text: "First" });
  const repeated = appendNodeAnnotation(first, parseDiagram(first).nodes[0].lineNumber, { position: "above", text: "Second" });
  const parsed = parseDiagram(repeated);
  assert.deepEqual(parsed.nodes[0].annotations.map(({ position, text }) => ({ position, text })), [
    { position: "above", text: "First" },
    { position: "above", text: "Second" },
  ]);
  const moved = setAnnotationPosition(repeated, parsed.nodes[0].annotations[1].lineNumber, "below");
  assert.deepEqual(parseDiagram(moved).nodes[0].annotations.map((annotation) => annotation.position), ["above", "below"]);
  const afterOneRemoval = removeNodeAnnotation(moved, parseDiagram(moved).nodes[0].annotations[0].lineNumber);
  assert.match(afterOneRemoval, /\.annotation\n        \.below Second/);
  const last = parseDiagram(afterOneRemoval).nodes[0].annotations[0];
  assert.doesNotMatch(removeNodeAnnotation(afterOneRemoval, last.lineNumber), /\.annotation/);
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

test("updates connector faces inside an existing nested node line block", () => {
  const source = "#canvas\n  graph\n    .node\n      .id root\n      .label Root\n      .flow\n        .node\n          .line\n            .source-face right\n            .target-face left\n          .id child\n          .offset (-174.7, -69.5)\n          .label Child";
  const parsed = parseDiagram(source);
  const child = parsed.nodes.find((node) => node.id === "child");
  let updated = setNodeField(source, child.lineNumber, "line.source-face", "bottom");
  const shifted = parseDiagram(updated).nodes.find((node) => node.id === "child");
  updated = setNodeField(updated, shifted.lineNumber, "line.target-face", "top");
  const result = parseDiagram(updated);
  assert.deepEqual(result.errors, []);
  assert.equal(result.edges[0].sourceFace, "bottom");
  assert.equal(result.edges[0].targetFace, "top");
  assert.equal(updated.match(/\.source-face/g)?.length, 1);
  assert.equal(updated.match(/\.target-face/g)?.length, 1);
});

test("builds a typed flow node inside the selected parent", () => {
  const source = "#diagram\n  .node\n    .id root\n    .label Root";
  const updated = appendFlowNode(source, 4, { direction: "down", ports: "distributed", nodeType: "card", lineType: "warning", id: "child", label: "Child" });
  assert.match(updated, /    \.flow\n      \.from-direction down\n      \.to-direction down\n      \.ports distributed\n      \.warning\n      \.card\n        \.id child\n        \.label Child/);
  const plain = appendFlowNode(source, 4, { id: "child", label: "Child" });
  assert.deepEqual(parseDiagram(plain).errors, []);
  assert.equal(parseDiagram(plain).nodes.length, 2);
});

test("writes an ID-based flow to an existing or later node", () => {
  const source = "#canvas\n  graph\n    .node\n      .id one\n      .label One\n      .node\n        .id two\n        .label Two";
  const updated = appendFlowReference(source, 4, { from: "two", to: "one", direction: "left" });
  assert.match(updated, /\.flow\n        \.from two\n        \.to one\n        \.from-direction left\n        \.to-direction left/);
  const parsed = parseDiagram(updated);
  assert.deepEqual(parsed.errors, []);
  assert.ok(parsed.edges.some((edge) => edge.from === "two" && edge.to === "one" && edge.explicitFlow));
});

test("groups selected nodes as a canvas-level member graph", () => {
  const source = "#canvas\n  graph\n    .id outer\n    .node\n      .id one\n      .label One\n      .node\n        .id two\n        .label Two";
  const grouped = groupNodesAsGraph(source, ["one", "two"], { graphId: "grouped" });
  assert.match(grouped, /\n  graph\n    \.id grouped\n    \.members one two/);
  const parsed = parseDiagram(grouped);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.groups.find((group) => group.id === "grouped")?.nodeIds, ["one", "two"]);
});

test("regrouping nodes reassigns them from existing member graphs", () => {
  const source = "#canvas\n  graph\n    .node\n      .id one\n      .label One\n      .node\n        .id two\n        .label Two\n      .node\n        .id three\n        .label Three\n  graph\n    .id old-group\n    .members one two";
  const regrouped = groupNodesAsGraph(source, ["one", "three"], { graphId: "new-group" });
  assert.match(regrouped, /\.id old-group\n    \.members two/);
  assert.match(regrouped, /\.id new-group\n    \.members one three/);
  assert.deepEqual(parseDiagram(regrouped).errors, []);
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

test("new graphs are always canvas-level siblings", () => {
  const source = "#canvas\n  graph\n    .id outer\n    .node\n      .id root\n      .label Root";
  const updated = appendDiagramNode(source, { diagramId: "second", id: "child", label: "Child" });
  assert.match(updated, /\n  graph\n    \.id second\n    \.node\n      \.id child/);
  const parsed = parseDiagram(updated);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.groups.length, 2);
});

test("renames and removes exact graph member references", () => {
  const source = "#canvas\n  graph\n    .id source\n    .node\n      .id one\n      .label One\n      .node\n        .id someone\n        .label Someone\n  graph\n    .id selected\n    .members one someone";
  const renamed = renameNodeReferences(source, "one", "first");
  assert.match(renamed, /\.members first someone/);
  assert.doesNotMatch(renamed, /\.members first somefirst/);
  const removed = removeNodeReferences(renamed, "first");
  assert.match(removed, /\.members someone/);
  const empty = removeNodeReferences(removed, "someone");
  assert.doesNotMatch(empty, /\.id selected/);
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

test("removes empty nested flow wrappers when deleting their last node", () => {
  const source = "#canvas\n  graph\n    .node\n      .id root\n      .label Root\n      .flow\n        .direction right\n        .node\n          .id middle\n          .label Middle\n          .flow\n            .direction down\n            .ports shared\n            .node\n              .id last\n              .label Last";
  const updated = removeNodeDeclaration(removeNodeReferences(source, "last"), 16);
  assert.doesNotMatch(updated, /\.id last|^          \.flow$/m);
  assert.match(updated, /\.id middle/);
  assert.deepEqual(parseDiagram(updated).errors, []);
});
