import test from "node:test";
import assert from "node:assert/strict";
import {
  appendDiagramNode,
  appendFlowReference,
  appendGraphNode,
  appendNodeAnnotation,
  indentSourceSelection,
  removeConnectionLabel,
  removeNodeAnnotation,
  removeNodeDeclaration,
  removeNodeReferences,
  removeNodeField,
  renameNodeReferences,
  setAnnotationOffsetField,
  setAnnotationPosition,
  setAnnotationText,
  setNodeAnnotationField,
  setNodeAnnotationText,
  setNodeField,
  setNodeImageGeometry,
  setNodeOffsetField,
  setNodeType,
  setStructuralField,
  setStructuralLineType,
  setStructuralOffsetField,
} from "../../src/pugflow/web/editor-source.mjs";
import { parseDiagram } from "../../src/pugflow/web/parser.mjs";

const FLAT_GRAPH = "#canvas\n  graph\n    .id main\n    .node\n      .id root\n      .label Root\n    .node\n      .id child\n      .label Child\n    .flow\n      .from root\n      .to child\n      .label request";

test("edits inspector-backed node properties", () => {
  let edited = setNodeField(FLAT_GRAPH, 6, "fill", "#123456");
  edited = setNodeOffsetField(edited, parseDiagram(edited).nodes[0].lineNumber, "offset", 12.26, -4.04);
  edited = removeNodeField(edited, parseDiagram(edited).nodes[0].lineNumber, "fill");
  edited = setNodeType(edited, parseDiagram(edited).nodes[0].lineNumber, "custom_node");
  assert.match(edited, /    \.custom_node\n      \.id root\n      \.offset \(12\.3, -4\)\n      \.label Root/);
  assert.doesNotMatch(edited, /\.fill #123456/);
});

test("renames node IDs in explicit flow endpoints", () => {
  const renamed = renameNodeReferences(FLAT_GRAPH, "root", "start");
  assert.match(renamed, /\.from start/);
  assert.doesNotMatch(renamed, /\.from root/);
});

test("writes direct flow fields and label offsets", () => {
  let updated = setStructuralField(FLAT_GRAPH, 10, "width", "3");
  updated = setStructuralOffsetField(updated, 10, 5, 6);
  assert.match(updated, /    \.flow\n      \.label-offset \(5, 6\)\n      \.width 3\n      \.from root/);
  assert.deepEqual(parseDiagram(updated).errors, []);
});

test("switches reusable flow types while clearing local appearance overrides", () => {
  const source = "@flow warning\n  .color red\n@flow success\n  .color green\n" + FLAT_GRAPH.replace("      .from root", "      .warning\n      .color blue\n      .from root");
  const parsed = parseDiagram(source);
  assert.deepEqual(parsed.errors, []);
  const updated = setStructuralLineType(source, parsed.edges[0].lineNumber, "success", ["warning", "success"]);
  assert.match(updated, /    \.flow\n      \.success\n      \.from root/);
  assert.doesNotMatch(updated, /      \.warning|      \.color blue/);
});

test("removes a direct flow label", () => {
  const parsed = parseDiagram(FLAT_GRAPH);
  const updated = removeConnectionLabel(FLAT_GRAPH, parsed.edges[0].lineNumber);
  assert.doesNotMatch(updated, /\.label request/);
  assert.equal(parseDiagram(updated).edges[0].label, "");
});

test("adds independent nodes and explicit flows to a graph", () => {
  const graphLine = 2;
  const withNode = appendGraphNode(FLAT_GRAPH, graphLine, { nodeType: "node", id: "third", label: "Third" });
  const withFlow = appendFlowReference(withNode, graphLine, { from: "child", to: "third", direction: "down", lineType: "warning" });
  assert.match(withFlow, /    \.node\n      \.id third\n      \.label Third\n    \.flow\n      \.from child\n      \.to third\n      \.from-direction down\n      \.to-direction down\n      \.ports shared\n      \.warning/);
});

test("adds a standalone sibling graph", () => {
  const updated = appendDiagramNode(FLAT_GRAPH, { diagramId: "second", id: "other", label: "Other" });
  const parsed = parseDiagram(updated);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.groups.map((group) => group.id), ["main", "second"]);
});

test("removes every flow touching a deleted node", () => {
  const withoutReferences = removeNodeReferences(FLAT_GRAPH, "child");
  const child = parseDiagram(withoutReferences).nodes.find((node) => node.id === "child");
  const updated = removeNodeDeclaration(withoutReferences, child.lineNumber);
  const parsed = parseDiagram(updated);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.nodes.map((node) => node.id), ["root"]);
  assert.equal(parsed.edges.length, 0);
});

test("edits repeated node annotations independently", () => {
  const first = appendNodeAnnotation(FLAT_GRAPH, 6, { position: "above", text: "First" });
  const node = parseDiagram(first).nodes.find((item) => item.id === "root");
  const second = appendNodeAnnotation(first, node.lineNumber, { position: "above", text: "Second" });
  const annotations = parseDiagram(second).nodes.find((item) => item.id === "root").annotations;
  let updated = setAnnotationText(second, annotations[1].lineNumber, "Changed");
  updated = setAnnotationPosition(updated, parseDiagram(updated).nodes[0].annotations[1].lineNumber, "below");
  updated = setAnnotationOffsetField(updated, parseDiagram(updated).nodes[0].annotations[1].lineNumber, 3, -2);
  const result = parseDiagram(updated).nodes[0].annotations;
  assert.deepEqual(result.map(({ position, text }) => ({ position, text })), [
    { position: "above", text: "First" },
    { position: "below", text: "Changed" },
  ]);
  assert.deepEqual([result[1].offsetX, result[1].offsetY], [3, -2]);
  const removed = removeNodeAnnotation(updated, result[0].lineNumber);
  assert.deepEqual(parseDiagram(removed).nodes[0].annotations.map((item) => item.text), ["Changed"]);
});

test("creates missing annotation text and style fields", () => {
  let updated = setNodeAnnotationText(FLAT_GRAPH, 6, "above", "New note");
  updated = setNodeAnnotationField(updated, parseDiagram(updated).nodes[0].lineNumber, "above", "font-style", "italic");
  const annotation = parseDiagram(updated).nodes[0].annotations[0];
  assert.equal(annotation.text, "New note");
  assert.equal(annotation.fontStyle, "italic");
});

test("writes node image geometry as one stable edit", () => {
  const source = FLAT_GRAPH.replace("      .label Root", "      .image photo.png\n      .image-width 40\n      .label Root");
  const root = parseDiagram(source).nodes.find((node) => node.id === "root");
  const updated = setNodeImageGeometry(source, root.lineNumber, 72, 55, 8.25, -4.04);
  assert.match(updated, /\.image-width 72/);
  assert.match(updated, /\.image-height 55/);
  assert.match(updated, /\.image-offset \(8\.3, -4\)/);
  assert.equal((updated.match(/\.image-width/g) ?? []).length, 1);
});

test("indents and outdents selected source lines", () => {
  const indented = indentSourceSelection("one\ntwo", 0, 7);
  assert.equal(indented.value, "  one\n  two");
  assert.equal(indentSourceSelection(indented.value, 0, indented.value.length, true).value, "one\ntwo");
});
