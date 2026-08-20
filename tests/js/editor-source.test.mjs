import test from "node:test";
import assert from "node:assert/strict";
import { removeNodeField, setAnnotationOffsetField, setNodeField, setNodeOffsetField, setNodeType, setStructuralField, setStructuralOffsetField } from "../../src/pugflow/web/editor-source.mjs";

test("edits inspector-backed node and connector properties", () => {
  const source = "#diagram\n  .node\n    .id root\n    .offset (2, 3)\n    .label\n      | Old\n      | label\n  .connect\n    .from root\n    .to root";
  let edited = setNodeField(source, 5, "label", "New label");
  edited = setNodeField(edited, 5, "fill", "#123456");
  edited = setNodeType(edited, 6, "custom_node");
  edited = removeNodeField(edited, 6, "offset");
  edited = setStructuralField(edited, 6, "line.width", "3");
  assert.match(edited, /\.custom_node\n    \.fill #123456\n    \.id root\n    \.label New label/);
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
