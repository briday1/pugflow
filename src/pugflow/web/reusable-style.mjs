const FIELD_MAPS = {
  node: [
    ["shape", "shape"], ["fill", "fill"], ["color", "color"], ["outline", "outline"],
    ["outline-style", "outlineStyle"], ["outline-width", "outlineWidth"], ["width", "width"],
    ["height", "height"], ["align", "align"], ["shadow-color", "shadowColor"],
    ["shadow-offset-x", "shadowOffsetX"], ["shadow-offset-y", "shadowOffsetY"],
    ["shadow-blur", "shadowBlur"], ["shadow-opacity", "shadowOpacity"], ["image", "image"],
    ["image-width", "imageWidth"], ["image-height", "imageHeight"], ["image-fit", "imageFit"],
    ["image-opacity", "imageOpacity"], ["image-padding", "imagePadding"],
    ["font-family", "fontFamily"], ["font-size", "fontSize"], ["font-weight", "fontWeight"],
    ["font-style", "fontStyle"], ["text-decoration", "textDecoration"],
  ],
  line: [
    ["color", "color"], ["width", "width"], ["roundness", "roundness"],
    ["stroke-style", "style"], ["arrow-style", "direction"], ["label-position", "labelPosition"],
    ["font-family", "fontFamily"], ["font-size", "fontSize"], ["font-weight", "fontWeight"],
    ["font-style", "fontStyle"], ["text-decoration", "textDecoration"],
  ],
  annotation: [
    ["color", "color"], ["font-family", "fontFamily"], ["font-size", "fontSize"],
    ["font-weight", "fontWeight"], ["font-style", "fontStyle"], ["text-decoration", "textDecoration"],
  ],
};

/** Return CSS declarations that reproduce an element's current rendered appearance. */
export function reusableStyleDeclarations(kind, model = {}) {
  const fields = FIELD_MAPS[kind];
  if (!fields) throw new Error(`Unknown reusable style kind: ${kind}`);
  const declarations = fields.flatMap(([property, key]) => {
    const value = model[key];
    return value === null || value === undefined || value === "" ? [] : [[property, String(value)]];
  });
  if (kind === "annotation" && (model.offsetX || model.offsetY)) {
    declarations.push(["offset", `(${model.offsetX ?? 0}, ${model.offsetY ?? 0})`]);
  }
  return declarations;
}

/** Append a reusable style rule to a CSS document. */
export function appendReusableStyle(source, kind, name, declarations) {
  if (!FIELD_MAPS[kind]) throw new Error(`Unknown reusable style kind: ${kind}`);
  if (!/^[a-zA-Z][\w-]*$/.test(name)) throw new Error("Type name must start with a letter and contain only letters, numbers, underscores, or hyphens.");
  if (new RegExp(`^@(node|line|annotation)\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "m").test(source)) {
    throw new Error(`A reusable type named ${name} already exists.`);
  }
  const body = declarations.map(([property, value]) => `  ${property}: ${value};`).join("\n");
  const rule = `@${kind} ${name} {\n${body}\n}`;
  return `${String(source).trimEnd()}${String(source).trim() ? "\n\n" : ""}${rule}\n`;
}
