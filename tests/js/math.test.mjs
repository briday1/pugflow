import test from "node:test";
import assert from "node:assert/strict";
import { formatMath } from "../../src/pugflow/web/pugflow.mjs";

test("formats portable inline TeX as Unicode SVG text", () => {
  assert.equal(formatMath("Area $x^2 + y_1$"), "Area x² + y₁");
  assert.equal(formatMath("$\\alpha \\rightarrow \\sqrt{x}$"), "α → √(x)");
  assert.equal(formatMath("$\\frac{a}{b} \\leq 1$"), "(a)/(b) ≤ 1");
});
