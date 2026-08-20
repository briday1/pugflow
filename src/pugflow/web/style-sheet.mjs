const KINDS = new Set(["node", "line", "annotation"]);
const NAME = /^[a-zA-Z][\w-]*$/;

/** Compile CSS-shaped reusable definitions into the diagram parser's definition prelude. */
export function compileStyleSheet(source = "") {
  const clean = String(source).replace(/\/\*[\s\S]*?\*\//g, "");
  const definitions = [];
  const errors = [];
  const consumed = [];
  const rule = /@(node|line|annotation)\s+([^\s{]+)\s*\{([\s\S]*?)\}/g;
  let match;
  while ((match = rule.exec(clean))) {
    consumed.push([match.index, rule.lastIndex]);
    const [, kind, name, body] = match;
    const line = clean.slice(0, match.index).split("\n").length;
    if (!KINDS.has(kind) || !NAME.test(name)) {
      errors.push(`CSS line ${line}: invalid @${kind} definition name "${name}".`);
      continue;
    }
    const fields = [];
    for (const declaration of body.split(";")) {
      const text = declaration.trim();
      if (!text) continue;
      const separator = text.indexOf(":");
      if (separator < 1) {
        errors.push(`CSS line ${line}: expected property: value; inside @${kind} ${name}.`);
        continue;
      }
      const property = text.slice(0, separator).trim();
      const value = text.slice(separator + 1).trim();
      if (!/^[a-z][\w-]*$/.test(property) || !value) {
        errors.push(`CSS line ${line}: invalid declaration "${text}".`);
        continue;
      }
      fields.push(`  .${property} ${value}`);
    }
    definitions.push(`@${kind} ${name}\n${fields.join("\n")}`);
  }
  let remainder = clean;
  for (const [start, end] of consumed.reverse()) remainder = remainder.slice(0, start) + remainder.slice(end);
  if (remainder.trim()) errors.push(`CSS line ${clean.slice(0, clean.indexOf(remainder.trim())).split("\n").length}: expected an @node, @line, or @annotation rule.`);
  return { source: definitions.join("\n\n"), errors };
}
