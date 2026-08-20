import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDiagram } from "../../src/pugflow/web/parser.mjs";
import { layoutDiagram } from "../../src/pugflow/web/layout.mjs";

test("the built-in feature tour remains valid", () => {
  const app = readFileSync(new URL("../../src/pugflow/web/app.mjs", import.meta.url), "utf8");
  const source = app.match(/const EXAMPLE = `([\s\S]*?)`;/)?.[1];
  assert.ok(source, "could not locate the built-in example");
  const result = parseDiagram(source);
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
  assert.deepEqual([parsed.get("three").offsetX, parsed.get("three").offsetY], [-363.1, -110.5]);
  assert.deepEqual([parsed.get("archived").offsetX, parsed.get("archived").offsetY], [-177.8, 0]);
  const placed = new Map(layoutDiagram(result.nodes, result.edges).nodes.map((node) => [node.id, node]));
  assert.equal(placed.get("three").rank, placed.get("two").rank);
  assert.ok(placed.get("three").y > placed.get("two").y);
  assert.equal(placed.get("one").rank, placed.get("two").rank);
});
