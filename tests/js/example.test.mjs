import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDiagram } from "../../src/pugflow/web/parser.mjs";
import { layoutDiagram } from "../../src/pugflow/web/layout.mjs";
import { pugDefinitionsToStyleSheet } from "../../src/pugflow/web/style-sheet.mjs";

test("the built-in feature tour remains valid", () => {
  const app = readFileSync(new URL("../../src/pugflow/web/app.mjs", import.meta.url), "utf8");
  const document = app.match(/const EXAMPLE_DOCUMENT = `([\s\S]*?)`;/)?.[1];
  assert.ok(document, "could not locate the built-in example");
  const start = document.indexOf("#canvas");
  const result = parseDiagram(document.slice(start), pugDefinitionsToStyleSheet(document.slice(0, start)));
  assert.deepEqual(result.errors, []);
  assert.ok(result.nodes.length >= 8);
  assert.ok(result.edges.some((edge) => edge.kind === "merge"));
  const feedback = result.edges.find((edge) => edge.from === "archived" && edge.to === "styled-text");
  assert.equal(feedback?.kind, "connection");
  assert.equal(feedback?.layoutDirection, "up");
  assert.equal(feedback?.targetLayoutDirection, "left");
  assert.equal(feedback?.direction, "forward");
  assert.ok(result.edges.filter((edge) => edge.kind === "merge").every((edge) => edge.portDistribution === "shared"));
  const parsed = new Map(result.nodes.map((node) => [node.id, node]));
  assert.deepEqual([parsed.get("three").offsetX, parsed.get("three").offsetY], [-416.6, -96]);
  assert.deepEqual([parsed.get("archived").offsetX, parsed.get("archived").offsetY], [-85.2, 0]);
  const placed = new Map(layoutDiagram(result.nodes, result.edges).nodes.map((node) => [node.id, node]));
  assert.equal(placed.get("three").rank, placed.get("two").rank);
  assert.ok(placed.get("three").y > placed.get("two").y);
  assert.equal(placed.get("one").rank, placed.get("two").rank);
});

test("source saving uses browser downloads instead of a restricted directory picker", () => {
  const app = readFileSync(new URL("../../src/pugflow/web/app.mjs", import.meta.url), "utf8");
  const html = readFileSync(new URL("../../src/pugflow/web/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(app, /showDirectoryPicker/);
  assert.match(app, /anchor\.download = sourceFilename\(extension\)/);
  assert.match(html, />Download open files<\/button>/);
});

test("editor exposes source files, collapsible source, nesting, and connection controls", () => {
  const app = readFileSync(new URL("../../src/pugflow/web/app.mjs", import.meta.url), "utf8");
  const html = readFileSync(new URL("../../src/pugflow/web/index.html", import.meta.url), "utf8");
  assert.match(html, /id="new-pug"/);
  assert.match(html, /id="new-css"/);
  assert.match(html, /id="toggle-source"/);
  assert.match(app, /data-graph-parent/);
  assert.match(app, /data-connected-field="source-face"/);
  assert.match(app, /data-connected-field="target-face"/);
  assert.match(app, /data-connected-field="arrow-style"/);
  assert.match(app, /data-connected-field="width"/);
  assert.doesNotMatch(app, /<summary>Typography<\/summary>/);
});
