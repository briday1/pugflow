import test from "node:test";
import assert from "node:assert/strict";
import { removeNodeField, setAnnotationOffsetField, setNodeField, setNodeImageGeometry, setNodeLineType, setNodeOffsetField, setNodeType, setStructuralField, setStructuralLineType, setStructuralOffsetField } from "../../src/pugflow/web/editor-source.mjs";

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
