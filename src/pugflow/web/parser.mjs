import { compileStyleSheet } from "./style-sheet.mjs";

const ID_PATTERN = /^[a-zA-Z][\w-]*$/;
const SHAPES = new Set(["square", "round", "rounded", "pill", "diamond", "hexagon"]);
const DIRECTIONS = new Set(["forward", "backward", "both", "none"]);
const FLOW_DIRECTIONS = new Set(["right", "left", "up", "down"]);
const PORT_DISTRIBUTIONS = new Set(["shared", "distributed"]);
const LINE_STYLES = new Set(["solid", "dashed", "dotted"]);
const LINE_FIELDS = new Set([
  "line.arrow-style", "line.color", "line.stroke-style", "line.width",
  "line.source-face", "line.target-face", "line.roundness",
  "line.label", "line.label-position", "line.label-offset", "line.label-hidden",
  "line.annotation-above", "line.annotation-below", "line.annotation-above-hidden", "line.annotation-below-hidden",
  "line.use", "line.hidden",
  "line.font-family", "line.font-size", "line.font-weight", "line.font-style", "line.text-decoration",
]);
const LINE_DEFINITION_FIELDS = new Map([
  ["arrow-style", "line.arrow-style"],
  ["source-face", "line.source-face"],
  ["target-face", "line.target-face"],
  ["roundness", "line.roundness"],
  ["color", "line.color"],
  ["stroke-style", "line.stroke-style"],
  ["width", "line.width"],
  ["label-position", "line.label-position"],
  ["label-offset", "line.label-offset"],
  ["label-hidden", "line.label-hidden"],
  ["annotation-above", "line.annotation-above"], ["annotation-below", "line.annotation-below"],
  ["annotation-above-hidden", "line.annotation-above-hidden"], ["annotation-below-hidden", "line.annotation-below-hidden"],
  ["hidden", "line.hidden"],
  ["font-family", "line.font-family"], ["font-size", "line.font-size"],
  ["font-weight", "line.font-weight"], ["font-style", "line.font-style"],
  ["text-decoration", "line.text-decoration"],
]);
const BLOCK_PROPERTIES = new Set([
  "id", "shape", "fill", "color", "outline", "outline-style", "outline-width",
  "width", "height", "align", "hidden", "offset", "label-offset",
  "shadow-color", "shadow-offset-x", "shadow-offset-y", "shadow-blur", "shadow-opacity",
  "image", "image-width", "image-height", "image-fit", "image-opacity", "image-offset", "image-padding",
  "font-family", "font-size", "font-weight", "font-style", "text-decoration",
]);
const BLOCK_STYLE_PROPERTIES = new Set([
  "shape", "fill", "color", "outline", "outline-style", "outline-width",
  "width", "height", "align",
  "shadow-color", "shadow-offset-x", "shadow-offset-y", "shadow-blur", "shadow-opacity",
  "image", "image-width", "image-height", "image-fit", "image-opacity", "image-padding",
  "font-family", "font-size", "font-weight", "font-style", "text-decoration",
]);

function indentationWidth(whitespace) {
  return [...whitespace].reduce((width, character) => width + (character === "\t" ? 2 : 1), 0);
}

function parseAttributes(raw, lineNumber, errors) {
  const attributes = {};
  if (!raw?.trim()) return attributes;
  const pattern = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+)))?/g;
  let match;
  let consumed = "";
  while ((match = pattern.exec(raw))) {
    attributes[match[1]] = match[2] ?? match[3] ?? match[4] ?? true;
    consumed += match[0];
  }
  if (raw.replace(/[\s,]+/g, "") !== consumed.replace(/[\s,]+/g, "")) {
    errors.push(`Line ${lineNumber}: could not parse all attributes.`);
  }
  return attributes;
}

function parseMarkupLine(body, lineNumber, errors) {
  if (body.startsWith("|")) {
    return { type: "text", classes: [], attrs: {}, text: body.slice(1).replace(/^ /, ""), children: [], lineNumber };
  }
  const styleDefinition = body.match(/^@(node|line|annotation)\s+([a-zA-Z][\w-]*)$/);
  if (styleDefinition) return { type: styleDefinition[1] + "-definition", name: styleDefinition[2], classes: [], attrs: {}, text: "", children: [], lineNumber };
  const diagram = body.match(/^#(?:canvas|diagram)(?:\((.*)\))?$/);
  if (diagram) return { type: "diagram", classes: [], attrs: parseAttributes(diagram[1], lineNumber, errors), text: "", children: [], lineNumber };
  if (body === "graph") return { type: "graph", classes: [], attrs: {}, text: "", children: [], lineNumber };
  if (/^[a-zA-Z][\w-]*$/.test(body)) return { type: "node-group", tag: body, classes: [], attrs: {}, text: "", children: [], lineNumber };

  const element = body.match(/^([a-zA-Z][\w-]*)?((?:\.[\w-]+)+)(?:\((.*)\))?(?:\s+(.*))?$/);
  if (!element) {
    errors.push(`Line ${lineNumber}: expected @node, #canvas, a structural declaration, or a node field.`);
    return null;
  }
  const classes = [...element[2].matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
  if (!element[1] && classes.length > 1 && !["line", "node", "annotation", "merge"].includes(classes[0])) {
    errors.push(`Line ${lineNumber}: structural declarations do not accept extra classes.`);
  }
  return {
    type: element[1] ? "field" : classes.join("."),
    tag: element[1] ?? null,
    classes,
    attrs: parseAttributes(element[3], lineNumber, errors),
    text: element[4] ?? "",
    children: [],
    lineNumber,
  };
}

function normalizeGroups(item, errors, nodeTypeNames, lineTypeNames) {
  item.children.forEach((child) => normalizeGroups(child, errors, nodeTypeNames, lineTypeNames));

  const expanded = [];
  let directChildBranch = null;
  const itemIsNode = item.type === "node-group" || item.type === "node" || nodeTypeNames.has(item.type);
  for (const child of item.children) {
    if (child.type === "defaults" && item.type === "diagram") {
      if (child.text || Object.keys(child.attrs).length) errors.push(`Line ${child.lineNumber}: .defaults is a group; put its fields on indented lines.`);
      expanded.push(...child.children);
      continue;
    }
    if (item.type === "defaults" && ["node", "line", "annotation"].includes(child.type)) {
      if (child.text || Object.keys(child.attrs).length) errors.push(`Line ${child.lineNumber}: .${child.type} is a defaults group; put its fields on indented lines.`);
      for (const field of child.children) expanded.push({ ...field, type: `${child.type}.${field.type}`, classes: [child.type, field.type] });
      continue;
    }
    if (child.type === "line") {
      if (child.text || Object.keys(child.attrs).length) errors.push(`Line ${child.lineNumber}: .line is a group; put its fields on indented lines.`);
      for (const field of child.children) {
        expanded.push({ ...field, type: `line.${field.type}`, classes: ["line", field.type] });
      }
      continue;
    }
    if (lineTypeNames.has(child.type) && child.children.length) {
      expanded.push({ ...child, children: [] });
      for (const field of child.children) {
        expanded.push({ ...field, type: `line.${field.type}`, classes: ["line", field.type] });
      }
      continue;
    }
    if (child.type === "node-group" || child.type === "node" || nodeTypeNames.has(child.type)) {
      if (child.text || Object.keys(child.attrs).length) errors.push(`Line ${child.lineNumber}: node is a group; put its fields on indented lines.`);
      const nodeChildren = [];
      for (const field of child.children) {
        if (field.type === "annotation") {
          for (const annotation of field.children) {
            if (!["above", "below"].includes(annotation.type)) {
              errors.push(`Line ${annotation.lineNumber}: .annotation accepts .above and .below entries.`);
              continue;
            }
            nodeChildren.push({ ...annotation, type: "field", tag: "node", classes: ["annotation", annotation.type] });
          }
        } else if (field.type === "label" || BLOCK_PROPERTIES.has(field.type)) {
          nodeChildren.push({ ...field, type: "field", tag: child.tag ?? (child.type === "node" ? "node" : child.type), classes: [field.type] });
        } else {
          nodeChildren.push(field);
        }
      }
      const entry = { type: "entry", classes: ["entry"], attrs: {}, text: "", children: nodeChildren, lineNumber: child.lineNumber, synthetic: true };
      if (["branch", "merge", "flow", "graph"].includes(item.type)) {
        expanded.push(entry);
      } else if (itemIsNode) {
        if (!directChildBranch) {
          directChildBranch = { type: "branch", classes: ["branch"], attrs: {}, text: "", children: [], lineNumber: child.lineNumber, synthetic: true };
          expanded.push(directChildBranch);
        }
        directChildBranch.children.push(entry);
      } else {
        expanded.push(...nodeChildren);
      }
      continue;
    }
    if (itemIsNode && ["branch", "merge"].includes(child.type)) directChildBranch = null;
    expanded.push(child);
  }
  item.children = expanded;
}

function textFor(element, errors, allowedChildren = []) {
  const unexpected = element.children.filter((child) => child.type !== "text" && !allowedChildren.includes(child.type));
  if (unexpected.length) errors.push(`Line ${unexpected[0].lineNumber}: text fields accept indented | lines only.`);
  const lines = [];
  if (element.text) lines.push(element.text);
  lines.push(...element.children.filter((child) => child.type === "text").map((child) => child.text));
  return lines.join("\n");
}

function parseMarkupTree(source) {
  const roots = [];
  const stack = [];
  const errors = [];
  source.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    if (!rawLine.trim() || rawLine.trimStart().startsWith("//")) return;
    const whitespace = rawLine.match(/^[\t ]*/)?.[0] ?? "";
    const width = indentationWidth(whitespace);
    if (width % 2) return errors.push(`Line ${lineNumber}: use two spaces (or one tab) per level.`);
    const depth = width / 2;
    if (depth > stack.length) return errors.push(`Line ${lineNumber}: indentation skipped a level.`);
    const item = parseMarkupLine(rawLine.trim(), lineNumber, errors);
    if (!item) return;
    if (depth === 0) roots.push(item);
    else stack[depth - 1].children.push(item);
    stack.length = depth;
    stack.push(item);
  });
  return { roots, errors };
}

function numberAttribute(value, fallback, minimum, name, lineNumber, errors) {
  if (value === undefined || value === "auto") return value ?? fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) {
    errors.push(`Line ${lineNumber}: ${name} must be "auto" or at least ${minimum}.`);
    return fallback;
  }
  return number;
}

function offsetTuple(value, name, lineNumber, errors) {
  if (value === undefined) return { x: 0, y: 0 };
  const match = String(value).match(/^\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)$/);
  if (!match) {
    errors.push(`Line ${lineNumber}: ${name} must be a tuple such as (12, -8).`);
    return { x: 0, y: 0 };
  }
  return { x: Number(match[1]), y: Number(match[2]) };
}

function blockStyle(attrs, lineNumber, errors, defaults = {}) {
  const shape = attrs.shape ?? defaults.shape ?? "round";
  const outlineStyle = attrs["outline-style"] ?? defaults.outlineStyle ?? "solid";
  if (!SHAPES.has(shape)) errors.push(`Line ${lineNumber}: unknown block shape "${shape}".`);
  if (!LINE_STYLES.has(outlineStyle)) errors.push(`Line ${lineNumber}: unknown outline style "${outlineStyle}".`);
  return {
    shape: SHAPES.has(shape) ? shape : "round",
    fill: attrs.fill ?? defaults.fill ?? "transparent",
    color: attrs.color ?? defaults.color ?? null,
    outline: attrs.outline ?? defaults.outline ?? null,
    outlineStyle: LINE_STYLES.has(outlineStyle) ? outlineStyle : "solid",
    outlineWidth: numberAttribute(attrs["outline-width"], defaults.outlineWidth ?? 2, 0, "outline-width", lineNumber, errors),
    width: numberAttribute(attrs.width, defaults.width ?? "auto", 48, "width", lineNumber, errors),
    height: numberAttribute(attrs.height, defaults.height ?? "auto", 28, "height", lineNumber, errors),
    align: ["left", "center", "right"].includes(attrs.align) ? attrs.align : defaults.align ?? "center",
    shadowColor: attrs["shadow-color"] ?? defaults.shadowColor ?? null,
    shadowOffsetX: numberAttribute(attrs["shadow-offset-x"], defaults.shadowOffsetX ?? 4, -100, "shadow-offset-x", lineNumber, errors),
    shadowOffsetY: numberAttribute(attrs["shadow-offset-y"], defaults.shadowOffsetY ?? 5, -100, "shadow-offset-y", lineNumber, errors),
    shadowBlur: numberAttribute(attrs["shadow-blur"], defaults.shadowBlur ?? 6, 0, "shadow-blur", lineNumber, errors),
    shadowOpacity: numberAttribute(attrs["shadow-opacity"], defaults.shadowOpacity ?? 0.3, 0, "shadow-opacity", lineNumber, errors),
    image: attrs.image ?? defaults.image ?? null,
    imageWidth: numberAttribute(attrs["image-width"], defaults.imageWidth ?? 64, 1, "image-width", lineNumber, errors),
    imageHeight: numberAttribute(attrs["image-height"], defaults.imageHeight ?? 64, 1, "image-height", lineNumber, errors),
    imageFit: ["contain", "cover", "fill"].includes(attrs["image-fit"]) ? attrs["image-fit"] : defaults.imageFit ?? "contain",
    imageOpacity: numberAttribute(attrs["image-opacity"], defaults.imageOpacity ?? 1, 0, "image-opacity", lineNumber, errors),
    imagePadding: numberAttribute(attrs["image-padding"], defaults.imagePadding ?? 0, 0, "image-padding", lineNumber, errors),
    fontFamily: attrs["font-family"] ?? defaults.fontFamily ?? null,
    fontSize: numberAttribute(attrs["font-size"], defaults.fontSize ?? 16, 1, "font-size", lineNumber, errors),
    fontWeight: attrs["font-weight"] ?? defaults.fontWeight ?? "normal",
    fontStyle: attrs["font-style"] ?? defaults.fontStyle ?? "normal",
    textDecoration: attrs["text-decoration"] ?? defaults.textDecoration ?? "none",
  };
}

function hiddenElement(...elements) {
  return elements.some((element) => {
    if (!element) return false;
    const hidden = element.attrs?.hidden;
    return hidden !== undefined && ![false, "false", "no", "0"].includes(hidden);
  });
}

function figureStyle(attrs, lineColor = null, textColor = null) {
  return {
    background: attrs.background ?? null,
    label: lineColor,
    text: textColor,
    merge: null,
    annotation: attrs["annotation.color"] ?? null,
    font: attrs.font ?? null,
  };
}

function diagramSettingsFor(diagram, errors) {
  const settings = {};
  const block = {};
  if (Object.keys(diagram.attrs).length) {
    errors.push(`Line ${diagram.lineNumber}: #canvas does not accept inline attributes; use indented default fields.`);
  }
  for (const child of diagram.children) {
    const blockProperty = child.type.startsWith("node.") ? child.type.slice(5) : null;
    const isFigureField = ["background", "font", "annotation.color"].includes(child.type);
    if (!isFigureField && !(blockProperty && BLOCK_STYLE_PROPERTIES.has(blockProperty))) continue;
    if (Object.keys(child.attrs).length || child.children.length) errors.push(`Line ${child.lineNumber}: .${child.type} must contain one plain-text value.`);
    const value = child.text.trim();
    if (!value) errors.push(`Line ${child.lineNumber}: .${child.type} needs a value.`);
    if (blockProperty) block[blockProperty] = value;
    else settings[child.type] = value;
  }
  return { settings, block };
}

function edgeStyle(attrs, defaults, lineNumber, errors, lineStyles = new Map()) {
  const presetName = attrs["line.use"] ?? defaults.lineType ?? null;
  const preset = presetName ? lineStyles.get(presetName) : null;
  if (presetName && !preset) errors.push(`Line ${attrs.__lines?.["line.use"] ?? lineNumber}: unknown line style "${presetName}".`);
  const effective = { ...(preset?.attributes ?? {}), ...attrs };
  const style = effective["line.stroke-style"] ?? defaults.style ?? "solid";
  const resolvedDirection = effective["line.arrow-style"] ?? defaults.direction ?? "forward";
  if (!DIRECTIONS.has(resolvedDirection)) errors.push(`Line ${lineNumber}: unknown arrow direction "${resolvedDirection}".`);
  if (!LINE_STYLES.has(style)) errors.push(`Line ${lineNumber}: unknown line style "${style}".`);
  const layoutDirection = attrs.direction ?? defaults.layoutDirection ?? "right";
  if (!FLOW_DIRECTIONS.has(layoutDirection)) errors.push(`Line ${lineNumber}: direction must be right, left, up, or down.`);
  const faces = new Set(["top", "right", "bottom", "left"]);
  const sourceFace = effective["line.source-face"] ?? defaults.sourceFace ?? null;
  const targetFace = effective["line.target-face"] ?? defaults.targetFace ?? null;
  if (sourceFace && !faces.has(sourceFace)) errors.push(`Line ${lineNumber}: line.source-face must be top, right, bottom, or left.`);
  if (targetFace && !faces.has(targetFace)) errors.push(`Line ${lineNumber}: line.target-face must be top, right, bottom, or left.`);
  const sourceDirections = { top: "up", right: "right", bottom: "down", left: "left" };
  const targetDirections = { top: "down", right: "left", bottom: "up", left: "right" };
  const portDistribution = attrs.ports ?? defaults.portDistribution ?? "shared";
  if (!PORT_DISTRIBUTIONS.has(portDistribution)) errors.push(`Line ${lineNumber}: ports must be shared or distributed.`);
  const labelOffset = effective["line.label-offset"] !== undefined
    ? offsetTuple(effective["line.label-offset"], "line.label-offset", lineNumber, errors)
    : { x: defaults.labelOffsetX ?? 0, y: defaults.labelOffsetY ?? 0 };
  return {
    lineType: presetName,
    direction: DIRECTIONS.has(resolvedDirection) ? resolvedDirection : "forward",
    color: effective["line.color"] ?? defaults.color ?? null,
    style: LINE_STYLES.has(style) ? style : "solid",
    width: numberAttribute(effective["line.width"], defaults.width ?? 2, 0.5, "line.width", lineNumber, errors),
    roundness: numberAttribute(effective["line.roundness"], defaults.roundness ?? 9, 0, "line.roundness", lineNumber, errors),
    label: effective["line.label"] ?? defaults.label ?? "",
    labelPosition: effective["line.label-position"] ?? defaults.labelPosition ?? "above",
    lineNumber,
    labelLineNumber: attrs["line.label"] !== undefined
      ? attrs.__lines?.["line.label"] ?? lineNumber
      : defaults.labelLineNumber ?? lineNumber,
    labelOffsetX: labelOffset.x,
    labelOffsetY: labelOffset.y,
    labelHidden: effective["line.label-hidden"] !== undefined && ![false, "false", "no", "0"].includes(effective["line.label-hidden"]),
    annotationAbove: effective["line.annotation-above"] ?? (effective["line.label-position"] !== "below" ? effective["line.label"] ?? "" : ""),
    annotationBelow: effective["line.annotation-below"] ?? (effective["line.label-position"] === "below" ? effective["line.label"] ?? "" : ""),
    annotationAboveLineNumber: attrs.__lines?.["line.annotation-above"] ?? attrs.__lines?.["line.label"] ?? lineNumber,
    annotationBelowLineNumber: attrs.__lines?.["line.annotation-below"] ?? attrs.__lines?.["line.label"] ?? lineNumber,
    annotationAboveHidden: effective["line.annotation-above-hidden"] !== undefined
      ? ![false, "false", "no", "0"].includes(effective["line.annotation-above-hidden"])
      : effective["line.annotation-above"] === undefined && effective["line.label-hidden"] !== undefined,
    annotationBelowHidden: effective["line.annotation-below-hidden"] !== undefined
      ? ![false, "false", "no", "0"].includes(effective["line.annotation-below-hidden"])
      : effective["line.annotation-below"] === undefined && effective["line.label-hidden"] !== undefined,
    layoutDirection: FLOW_DIRECTIONS.has(layoutDirection) ? layoutDirection : "right",
    sourceDirection: sourceDirections[sourceFace] ?? (FLOW_DIRECTIONS.has(layoutDirection) ? layoutDirection : "right"),
    targetLayoutDirection: targetDirections[targetFace] ?? defaults.targetLayoutDirection ?? null,
    sourceFace: faces.has(sourceFace) ? sourceFace : null,
    targetFace: faces.has(targetFace) ? targetFace : null,
    portDistribution: PORT_DISTRIBUTIONS.has(portDistribution) ? portDistribution : "shared",
    hidden: effective["line.hidden"] !== undefined && ![false, "false", "no", "0"].includes(effective["line.hidden"]),
    fontFamily: effective["line.font-family"] ?? defaults.fontFamily ?? null,
    fontSize: numberAttribute(effective["line.font-size"], defaults.fontSize ?? 12, 1, "line.font-size", lineNumber, errors),
    fontWeight: effective["line.font-weight"] ?? defaults.fontWeight ?? "normal",
    fontStyle: effective["line.font-style"] ?? defaults.fontStyle ?? "normal",
    textDecoration: effective["line.text-decoration"] ?? defaults.textDecoration ?? "none",
  };
}

function connectionAttributesFor(container, errors, extras = [], rejectInline = true, lineStyles = new Map(), knownStyles = new Set(lineStyles.keys())) {
  const allowed = new Set([...LINE_FIELDS, ...extras]);
  const nested = {
    diagram: new Set(["graph", "branch", "merge", "flow", "connect", "background", "font", "annotation.color"]),
    graph: new Set(["graph", "branch", "merge", "flow", "connect"]),
    branch: new Set(["entry"]),
    entry: new Set(["graph", "branch", "merge", "flow", "connect"]),
    flow: new Set(["entry"]),
    merge: new Set(["source", "entry"]),
    source: new Set(),
  }[container.type] ?? new Set();
  const attributes = {};
  const lines = {};
  if (rejectInline && Object.keys(container.attrs).length) {
    errors.push(`Line ${container.lineNumber}: .${container.type} does not accept inline attributes; use indented fields.`);
  }
  for (const child of container.children.filter((item) => item.type.startsWith("line.") && !allowed.has(item.type))) {
    errors.push(`Line ${child.lineNumber}: unknown line field ".${child.type}".`);
  }
  for (const child of container.children.filter((item) =>
    item.type !== "field"
    && item.type !== "text"
    && !item.type.startsWith("line.")
    && !allowed.has(item.type)
    && !nested.has(item.type)
    && !knownStyles.has(item.type)
    && !(container.type === "diagram" && item.type.startsWith("node.")))) {
    if (["diagram", "graph"].includes(container.type) && /^[a-zA-Z][\w-]*$/.test(child.type)) {
      errors.push(`Line ${child.lineNumber}: unknown node style ".${child.type}". Open the companion CSS file that defines it, or add an @node ${child.type} definition.`);
    } else errors.push(`Line ${child.lineNumber}: ".${child.type}" is not valid inside .${container.type}.`);
  }
  const presetChildren = container.children.filter((item) => lineStyles.has(item.type));
  if (presetChildren.length > 1) errors.push(`Line ${presetChildren[1].lineNumber}: only one reusable line class may be applied here.`);
  if (presetChildren[0]) {
    attributes["line.use"] = presetChildren[0].type;
    lines["line.use"] = presetChildren[0].lineNumber;
  }
  for (const child of container.children.filter((item) => allowed.has(item.type))) {
    if (Object.keys(child.attrs).length) errors.push(`Line ${child.lineNumber}: .${child.type} takes plain text, not attributes.`);
    if (attributes[child.type] !== undefined) errors.push(`Line ${child.lineNumber}: duplicate .${child.type} field.`);
    attributes[child.type] = ["line.label", "line.annotation-above", "line.annotation-below"].includes(child.type) ? textFor(child, errors) : child.text.trim();
    lines[child.type] = child.lineNumber;
    if (!["line.label", "line.annotation-above", "line.annotation-below"].includes(child.type) && child.children.length) errors.push(`Line ${child.lineNumber}: .${child.type} must stay on one line.`);
  }
  Object.defineProperty(attributes, "__lines", { value: lines });
  return attributes;
}

function annotationsFor(container, errors, annotationStyles) {
  return container.children
    .filter((child) => child.type === "field" && child.classes.includes("annotation"))
    .map((child) => {
      if (Object.keys(child.attrs).length) errors.push(`Line ${child.lineNumber}: annotations do not accept inline attributes; use indented .color and .offset fields.`);
      const presetFields = child.children.filter((item) => annotationStyles.has(item.type));
      if (presetFields.length > 1) errors.push(`Line ${presetFields[1].lineNumber}: only one reusable annotation class may be applied here.`);
      const preset = annotationStyles.get(presetFields[0]?.type) ?? {};
      const colorFields = child.children.filter((item) => item.type === "color");
      const offsetFields = child.children.filter((item) => item.type === "offset");
      const hiddenFields = child.children.filter((item) => item.type === "hidden");
      const textFields = Object.fromEntries(["font-family", "font-size", "font-weight", "font-style", "text-decoration"].map((name) => [name, child.children.find((item) => item.type === name)]));
      if (colorFields.length > 1) errors.push(`Line ${colorFields[1].lineNumber}: duplicate .color field.`);
      if (offsetFields.length > 1) errors.push(`Line ${offsetFields[1].lineNumber}: duplicate .offset field.`);
      for (const field of [...colorFields, ...offsetFields, ...hiddenFields]) {
        if (Object.keys(field.attrs).length || field.children.length) errors.push(`Line ${field.lineNumber}: .${field.type} must contain one plain-text value.`);
      }
      const colorField = colorFields[0];
      const offsetField = offsetFields[0];
      const offset = offsetField ? offsetTuple(offsetField.text.trim(), "offset", offsetField.lineNumber, errors) : preset.offset ?? { x: 0, y: 0 };
      return {
        text: textFor(child, errors, ["color", "offset", "hidden", ...Object.keys(textFields), ...annotationStyles.keys()]),
        position: child.classes.includes("below") ? "below" : "above",
        color: colorField?.text.trim() ?? preset.color ?? null,
        lineNumber: child.lineNumber,
        offsetX: offset.x,
        offsetY: offset.y,
        hidden: Boolean(hiddenFields.length && !["false", "no", "0"].includes(hiddenFields[0].text.trim())),
        fontFamily: textFields["font-family"]?.text.trim() ?? preset.fontFamily ?? null,
        fontSize: numberAttribute(textFields["font-size"]?.text.trim(), preset.fontSize ?? 12, 1, "font-size", child.lineNumber, errors),
        fontWeight: textFields["font-weight"]?.text.trim() ?? preset.fontWeight ?? "normal",
        fontStyle: textFields["font-style"]?.text.trim() ?? preset.fontStyle ?? "normal",
        textDecoration: textFields["text-decoration"]?.text.trim() ?? preset.textDecoration ?? "none",
      };
    });
}

function blockAttributesFor(container, labelElement, errors) {
  const attributes = {};
  if (Object.keys(labelElement.attrs).length) {
    errors.push(`Line ${labelElement.lineNumber}: node.label does not accept attributes; use separate node property lines.`);
  }
  container.children
    .filter((child) => child.type === "field" && child !== labelElement && !child.classes.includes("annotation"))
    .forEach((child) => {
      const property = child.classes.find((name) => BLOCK_PROPERTIES.has(name));
      if (!property) {
        errors.push(`Line ${child.lineNumber}: unknown node property "${child.classes.join(".")}".`);
        return;
      }
      if (Object.keys(child.attrs).length) {
        errors.push(`Line ${child.lineNumber}: node.${property} takes its value as text, not attributes.`);
      }
      if (child.children.length) errors.push(`Line ${child.lineNumber}: node.${property} must stay on one line.`);
      const textValue = child.text.trim();
      attributes[property] = child.attrs.value ?? (textValue || true);
    });
  return attributes;
}

function customNodeStyles(tree, blockDefaults, errors) {
  const definitions = new Map();
  for (const definition of tree.roots.filter((root) => root.type === "node-definition")) {
    if (definitions.has(definition.name) || definition.name === "node") {
      errors.push(`Line ${definition.lineNumber}: node type "${definition.name}" is already defined.`);
      continue;
    }
    const attributes = {};
    for (const child of definition.children) {
      const property = child.type === "field" && child.tag === "node" ? child.classes[0] : child.type;
      if (!BLOCK_STYLE_PROPERTIES.has(property)) {
        errors.push(`Line ${child.lineNumber}: @node definitions accept .shape, .fill, .color, and other node styling fields only.`);
        continue;
      }
      if (Object.keys(child.attrs).length) errors.push(`Line ${child.lineNumber}: .${property} takes its value as text, not attributes.`);
      if (child.children.length) errors.push(`Line ${child.lineNumber}: reusable style fields must stay on one line.`);
      attributes[property] = child.text.trim() || true;
    }
    definitions.set(definition.name, blockStyle(attributes, definition.lineNumber, errors, blockDefaults));
  }
  return definitions;
}

function customLineStyles(tree, errors) {
  const definitions = new Map();
  for (const definition of tree.roots.filter((root) => root.type === "line-definition")) {
    const attributes = {};
    const lines = {};
    for (const child of definition.children) {
      const field = LINE_DEFINITION_FIELDS.get(child.type);
      if (!field) {
        errors.push(`Line ${child.lineNumber}: unknown @line style field .${child.type}.`);
        continue;
      }
      if (Object.keys(child.attrs).length || child.children.length) errors.push(`Line ${child.lineNumber}: .${child.type} must contain one plain-text value.`);
      attributes[field] = child.text.trim();
      lines[field] = child.lineNumber;
    }
    Object.defineProperty(attributes, "__lines", { value: lines });
    definitions.set(definition.name, { attributes, lineNumber: definition.lineNumber });
    edgeStyle(attributes, {}, definition.lineNumber, errors);
  }
  return definitions;
}

function customAnnotationStyles(tree, errors) {
  const definitions = new Map();
  for (const definition of tree.roots.filter((root) => root.type === "annotation-definition")) {
    const style = {};
    for (const child of definition.children) {
      if (!["color", "offset", "font-family", "font-size", "font-weight", "font-style", "text-decoration"].includes(child.type)) {
        errors.push(`Line ${child.lineNumber}: unknown @annotation style field .${child.type}.`);
        continue;
      }
      if (Object.keys(child.attrs).length || child.children.length) errors.push(`Line ${child.lineNumber}: .${child.type} must contain one plain-text value.`);
      if (child.type === "color") style.color = child.text.trim();
      else if (child.type === "offset") style.offset = offsetTuple(child.text.trim(), "offset", child.lineNumber, errors);
      else if (child.type === "font-size") style.fontSize = numberAttribute(child.text.trim(), 12, 1, "font-size", child.lineNumber, errors);
      else style[child.type.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = child.text.trim();
    }
    definitions.set(definition.name, style);
  }
  return definitions;
}

function validateStyleNames(...definitionMaps) {
  const errors = [];
  const used = new Set();
  for (const definitions of definitionMaps) {
    for (const [name, definition] of definitions) {
      if (used.has(name)) errors.push(`Line ${definition.lineNumber ?? 1}: reusable class ".${name}" is already defined by another style type.`);
      used.add(name);
    }
  }
  return errors;
}

function automaticId(label, usedIds) {
  const stem = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "block";
  let id = stem;
  let suffix = 2;
  while (usedIds.has(id)) id = `${stem}-${suffix++}`;
  return id;
}

function compileMarkup(tree) {
  const errors = [...tree.errors];
  const nodes = [];
  const edges = [];
  const groups = [];
  const pendingFlows = [];
  const memberGroups = [];
  const nodesById = new Map();
  const diagramRoot = tree.roots.find((root) => root.type === "diagram") ?? null;
  const diagramSettings = diagramRoot ? diagramSettingsFor(diagramRoot, errors) : { settings: {}, block: {} };
  const blockDefaults = diagramRoot ? blockStyle(diagramSettings.block, diagramRoot.lineNumber, errors) : blockStyle({}, 1, errors);
  const nodeStyles = customNodeStyles(tree, blockDefaults, errors);
  const lineStyles = customLineStyles(tree, errors);
  const annotationStyles = customAnnotationStyles(tree, errors);
  const knownStyles = new Set([...nodeStyles.keys(), ...lineStyles.keys(), ...annotationStyles.keys()]);
  const edgeDefaults = diagramRoot ? edgeStyle(connectionAttributesFor(diagramRoot, errors, [], false, lineStyles, knownStyles), {}, diagramRoot.lineNumber, errors, lineStyles) : edgeStyle({}, {}, 1, errors, lineStyles);
  const figure = diagramRoot ? figureStyle(diagramSettings.settings, edgeDefaults.color, blockDefaults.color) : {};
  errors.push(...validateStyleNames(nodeStyles, lineStyles, annotationStyles));

  function createNode(container, labelElement) {
    const label = labelElement ? textFor(labelElement, errors) : "";
    if (!labelElement) {
      errors.push(`Line ${container.lineNumber}: every diagram/entry needs a node.label.`);
      return null;
    }
    const attributes = blockAttributesFor(container, labelElement, errors);
    const foreignTags = [...new Set(container.children
      .filter((child) => child.type === "field" && child.tag !== "node")
      .map((child) => child.tag))];
    for (const tag of foreignTags) {
      if (!nodeStyles.has(tag)) errors.push(`Line ${labelElement.lineNumber}: unknown node type "${tag}".`);
    }
    const customTags = container.children
      .filter((child) => child.type === "field" && child.tag !== "node" && nodeStyles.has(child.tag))
      .map((child) => child.tag);
    const customClasses = container.children.filter((child) => nodeStyles.has(child.type));
    const appliedStyles = [...new Set([...customTags, ...customClasses.map((child) => child.type)])];
    if (appliedStyles.length > 1) errors.push(`Line ${customClasses[1]?.lineNumber ?? labelElement.lineNumber}: only one reusable node class may be applied here.`);
    const customDefaults = nodeStyles.get(appliedStyles[0]) ?? blockDefaults;
    const offset = offsetTuple(attributes.offset, "node.offset", labelElement.lineNumber, errors);
    const labelOffset = offsetTuple(attributes["label-offset"], "node.label-offset", labelElement.lineNumber, errors);
    const imageOffset = offsetTuple(attributes["image-offset"], "node.image-offset", labelElement.lineNumber, errors);
    const requestedId = attributes.id;
    if (requestedId && !ID_PATTERN.test(requestedId)) errors.push(`Line ${labelElement.lineNumber}: "${requestedId}" is not a valid ID.`);
    const id = requestedId ?? automaticId(label, nodesById);
    if (nodesById.has(id)) {
      errors.push(`Line ${labelElement.lineNumber}: the ID "${id}" is already in use.`);
      return null;
    }
    const node = {
      id,
      explicitId: requestedId ?? "",
      label,
      annotations: annotationsFor(container, errors, annotationStyles),
      style: blockStyle(attributes, labelElement.lineNumber, errors, customDefaults),
      hidden: hiddenElement({ attrs: attributes }),
      offsetX: offset.x,
      offsetY: offset.y,
      labelOffsetX: labelOffset.x,
      labelOffsetY: labelOffset.y,
      imageOffsetX: imageOffset.x,
      imageOffsetY: imageOffset.y,
      lineNumber: labelElement.lineNumber,
      kind: "block",
    };
    nodes.push(node);
    nodesById.set(id, node);
    return node;
  }

  function buildEntry(entry, parent, branchDefaults = {}) {
    const label = entry.children.find((child) => child.type === "field" && child.classes.includes("label"));
    const node = createNode(entry, label);
    if (!node) return null;
    if (parent) edges.push({ from: parent.id, to: node.id, kind: "branch", declarationKind: "node", ...edgeStyle(connectionAttributesFor(entry, errors, [], true, lineStyles, knownStyles), branchDefaults, entry.lineNumber, errors, lineStyles) });
    processChildren(entry, node);
    return node;
  }

  function buildBranch(branch, parent) {
    if (!branch.synthetic) {
      errors.push(`Line ${branch.lineNumber}: .branch has been removed; use multiple .flow groups or directly nested nodes.`);
      return;
    }
    const defaults = edgeStyle(connectionAttributesFor(branch, errors, ["direction", "ports"], true, lineStyles, knownStyles), { ...edgeDefaults, portDistribution: "shared" }, branch.lineNumber, errors, lineStyles);
    const entries = branch.children.filter((child) => child.type === "entry");
    if (!entries.length) errors.push(`Line ${branch.lineNumber}: a branch needs at least one .entry.`);
    entries.forEach((entry) => buildEntry(entry, parent, defaults));
  }

  function buildFlow(flow, parent) {
    const attributes = connectionAttributesFor(flow, errors, ["from", "to", "from-direction", "to-direction", "direction", "ports"], true, lineStyles, knownStyles);
    const defaults = edgeStyle(attributes, edgeDefaults, flow.lineNumber, errors, lineStyles);
    const entries = flow.children.filter((child) => child.type === "entry");
    if (attributes.from !== undefined || attributes.to !== undefined) {
      if (entries.length) errors.push(`Line ${flow.lineNumber}: a referenced flow cannot also define a node; use either .from/.to or nested nodes.`);
      pendingFlows.push({ flow, attributes, defaults });
      return;
    }
    if (!entries.length) {
      errors.push(`Line ${flow.lineNumber}: a flow needs at least one node.`);
      return;
    }
    let previous = parent;
    entries.forEach((entry) => { previous = buildEntry(entry, previous, defaults) ?? previous; });
  }

  function buildSubdiagram(component) {
    const entries = component.children.filter((child) => child.type === "entry");
    const members = component.children.find((child) => child.type === "members")?.text.trim().split(/[\s,]+/).filter(Boolean) ?? [];
    if (entries.length !== 1 && !members.length) errors.push(`Line ${component.lineNumber}: graph needs exactly one root node or a .members list.`);
    if (entries.length && members.length) errors.push(`Line ${component.lineNumber}: graph cannot contain both a root node and a .members list.`);
    const before = nodes.length;
    const edgeBefore = edges.length;
    const rootNode = entries[0] ? buildEntry(entries[0], null) : null;
    if (rootNode) processChildren(component, rootNode);
    const field = (name) => component.children.find((child) => child.type === name)?.text.trim();
    const graphOffset = offsetTuple(field("offset"), "graph.offset", component.lineNumber, errors);
    const layerText = field("layer");
    const layer = layerText === undefined || layerText === "" ? 0 : Number(layerText);
    if (!Number.isInteger(layer)) errors.push(`Line ${component.lineNumber}: graph.layer must be an integer.`);
    const hiddenField = component.children.find((child) => child.type === "hidden");
    const hidden = Boolean(hiddenField && !["false", "no", "0"].includes(hiddenField.text.trim()));
    if (hidden) {
      nodes.slice(before).forEach((node) => { node.hidden = true; });
      edges.slice(edgeBefore).forEach((edge) => { edge.hidden = true; });
    }
    const group = {
      id: field("id") || `diagram-${groups.length + 1}`,
      label: field("label") || "",
      fill: field("fill") || "transparent",
      color: field("color") || null,
      outline: field("outline") || "transparent",
      outlineStyle: field("outline-style") || "solid",
      outlineWidth: Number(field("outline-width") || 1.5),
      padding: Number(field("padding") || 24),
      rootId: rootNode?.id ?? null,
      hidden,
      offsetX: graphOffset.x,
      offsetY: graphOffset.y,
      layer: Number.isInteger(layer) ? layer : 0,
      nodeIds: members.length ? members : nodes.slice(before).map((node) => node.id),
      sourceIndex: groups.length,
      lineNumber: component.lineNumber,
    };
    groups.push(group);
    if (members.length) memberGroups.push(group);
  }

  function buildMerge(merge) {
    const targetEntry = merge.children.find((child) => child.type === "entry");
    if (!targetEntry) return errors.push(`Line ${merge.lineNumber}: a merge needs one target .entry.`);
    const label = targetEntry.children.find((child) => child.type === "field" && child.classes.includes("label"));
    const target = createNode(targetEntry, label);
    if (!target) return;
    target.kind = "merge";
    const explicitSources = merge.children.filter((child) => child.type === "source");
    const mergeAttributes = connectionAttributesFor(merge, errors, ["from", "direction", "ports"], true, lineStyles, knownStyles);
    const shorthand = String(mergeAttributes.from ?? "").split(/[\s,]+/).filter(Boolean).map((ref) => ({ type: "source", children: [{ type: "ref", text: ref, attrs: {}, children: [], lineNumber: mergeAttributes.__lines.from }], attrs: {}, lineNumber: merge.lineNumber }));
    const sources = explicitSources.length ? explicitSources : shorthand;
    if (sources.length < 2) errors.push(`Line ${merge.lineNumber}: a merge needs at least two .source lines or from IDs.`);
    const defaults = edgeStyle(mergeAttributes, { ...edgeDefaults, color: edgeDefaults.color ?? "merge", portDistribution: "shared" }, merge.lineNumber, errors, lineStyles);
    sources.forEach((source) => {
      const sourceAttributes = connectionAttributesFor(source, errors, ["ref", "direction"], true, lineStyles, knownStyles);
      const ref = sourceAttributes.ref;
      if (!ref || !nodesById.has(ref)) return errors.push(`Line ${source.lineNumber}: merge source "${ref || "(missing)"}" has not been defined yet.`);
      edges.push({ from: ref, to: target.id, kind: "merge", declarationKind: "merge", mergeId: target.id, ...edgeStyle(sourceAttributes, defaults, source.lineNumber, errors, lineStyles) });
    });
    processChildren(targetEntry, target);
  }

  function buildConnect(connect) {
    const attributes = connectionAttributesFor(connect, errors, ["from", "to", "from-direction", "to-direction", "ports"], true, lineStyles, knownStyles);
    const from = attributes.from;
    const to = attributes.to;
    if (!from || !nodesById.has(from)) errors.push(`Line ${connect.lineNumber}: connection source "${from || "(missing)"}" has not been defined yet.`);
    if (!to || !nodesById.has(to)) errors.push(`Line ${connect.lineNumber}: connection target "${to || "(missing)"}" has not been defined yet.`);
    if (from && to && nodesById.has(from) && nodesById.has(to)) {
      const fromDirection = attributes["from-direction"] ?? "right";
      const toDirection = attributes["to-direction"] ?? fromDirection;
      if (!FLOW_DIRECTIONS.has(fromDirection)) errors.push(`Line ${connect.lineNumber}: from-direction must be right, left, up, or down.`);
      if (!FLOW_DIRECTIONS.has(toDirection)) errors.push(`Line ${connect.lineNumber}: to-direction must be right, left, up, or down.`);
      const style = edgeStyle(attributes, { ...edgeDefaults, portDistribution: "shared" }, connect.lineNumber, errors, lineStyles);
      edges.push({ from, to, kind: "connection", declarationKind: "connect", ...style,
        layoutDirection: FLOW_DIRECTIONS.has(fromDirection) ? fromDirection : "right",
        sourceDirection: style.sourceFace ? style.sourceDirection : (FLOW_DIRECTIONS.has(fromDirection) ? fromDirection : "right"),
        targetLayoutDirection: style.targetFace ? style.targetLayoutDirection : (FLOW_DIRECTIONS.has(toDirection) ? toDirection : fromDirection) });
    }
  }

  function processChildren(container, parent) {
    container.children.forEach((child) => {
      if (child.type === "branch") buildBranch(child, parent);
      else if (child.type === "flow") buildFlow(child, parent);
      else if (child.type === "graph") {
        if (container.type !== "diagram") errors.push(`Line ${child.lineNumber}: graphs cannot be nested; place every graph directly under #canvas.`);
        else buildSubdiagram(child);
      }
      else if (child.type === "merge") buildMerge(child);
      else if (child.type === "connect") buildConnect(child);
    });
  }

  const diagramRoots = tree.roots.filter((root) => root.type === "diagram");
  const definitionTypes = new Set(["node-definition", "line-definition", "annotation-definition"]);
  const unexpectedRoots = tree.roots.filter((root) => !definitionTypes.has(root.type) && root.type !== "diagram");
  const definitionAfterDiagram = diagramRoot && tree.roots.some((root, index) => definitionTypes.has(root.type) && index > tree.roots.indexOf(diagramRoot));
  if (diagramRoots.length !== 1 || unexpectedRoots.length || definitionAfterDiagram) {
    errors.push("The document must contain optional @node, @line, and @annotation definitions followed by exactly one #canvas.");
    return { nodes, edges, groups, errors, format: "pug", figure };
  }
  const rootLabel = diagramRoot.children.find((child) => child.type === "field" && child.classes.includes("label"));
  const root = rootLabel ? createNode(diagramRoot, rootLabel) : null;
  if (root) processChildren(diagramRoot, root);
  else processChildren(diagramRoot, null);
  for (const group of memberGroups) {
    const missing = group.nodeIds.filter((id) => !nodesById.has(id));
    if (missing.length) errors.push(`Line ${group.lineNumber}: graph member "${missing[0]}" is not defined.`);
  }
  const graphIds = new Set();
  for (const group of groups) {
    if (graphIds.has(group.id)) errors.push(`Line ${group.lineNumber}: the graph ID "${group.id}" is already in use.`);
    graphIds.add(group.id);
  }
  const memberOwners = new Map();
  for (const group of memberGroups) {
    for (const id of group.nodeIds) {
      const owner = memberOwners.get(id);
      if (owner) errors.push(`Line ${group.lineNumber}: node "${id}" is already a member of graph "${owner.id}".`);
      else memberOwners.set(id, group);
    }
  }
  for (const group of memberGroups) {
    const claimed = new Set(group.nodeIds);
    groups.filter((candidate) => candidate !== group && !memberGroups.includes(candidate)).forEach((candidate) => {
      candidate.nodeIds = candidate.nodeIds.filter((id) => !claimed.has(id));
    });
  }
  for (const { flow, attributes, defaults } of pendingFlows) {
    const from = attributes.from;
    const to = attributes.to;
    if (!from || !nodesById.has(from)) errors.push(`Line ${flow.lineNumber}: flow source "${from || "(missing)"}" is not defined.`);
    if (!to || !nodesById.has(to)) errors.push(`Line ${flow.lineNumber}: flow target "${to || "(missing)"}" is not defined.`);
    if (!from || !to || !nodesById.has(from) || !nodesById.has(to)) continue;
    const fromDirection = attributes["from-direction"] ?? attributes.direction ?? "right";
    const toDirection = attributes["to-direction"] ?? fromDirection;
    if (!FLOW_DIRECTIONS.has(fromDirection)) errors.push(`Line ${flow.lineNumber}: from-direction must be right, left, up, or down.`);
    if (!FLOW_DIRECTIONS.has(toDirection)) errors.push(`Line ${flow.lineNumber}: to-direction must be right, left, up, or down.`);
    edges.push({ from, to, kind: "flow", declarationKind: "flow", explicitFlow: true, ...defaults,
      layoutDirection: FLOW_DIRECTIONS.has(fromDirection) ? fromDirection : "right",
      sourceDirection: defaults.sourceFace ? defaults.sourceDirection : (FLOW_DIRECTIONS.has(fromDirection) ? fromDirection : "right"),
      targetLayoutDirection: defaults.targetFace ? defaults.targetLayoutDirection : (FLOW_DIRECTIONS.has(toDirection) ? toDirection : fromDirection) });
  }
  const incoming = new Map();
  edges.forEach((edge) => incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1));
  edges.forEach((edge) => {
    if (edge.kind === "flow" || edge.kind === "branch") {
      edge.kind = (incoming.get(edge.to) ?? 0) > 1 ? "merge" : "branch";
      if (edge.kind === "merge") edge.mergeId = edge.to;
    }
  });
  nodes.forEach((node) => {
    if ((incoming.get(node.id) ?? 0) > 1) node.kind = "merge";
  });
  for (const group of groups.filter((candidate) => candidate.hidden)) {
    const hiddenIds = new Set(group.nodeIds);
    nodes.filter((node) => hiddenIds.has(node.id)).forEach((node) => { node.hidden = true; });
    edges.filter((edge) => hiddenIds.has(edge.from) || hiddenIds.has(edge.to)).forEach((edge) => { edge.hidden = true; });
  }
  return { nodes, edges, groups, errors, format: "pug", figure };
}

/** Parse a diagram definition with optional external CSS-shaped reusable definitions. */
export function parseDiagram(source, styleSource = "") {
  const styles = compileStyleSheet(styleSource);
  if (styles.errors.length) return { nodes: [], edges: [], errors: styles.errors, format: "pug", figure: {} };
  const prefix = styles.source ? `${styles.source}\n\n` : "";
  const prefixLines = prefix ? prefix.split("\n").length - 1 : 0;
  const tree = parseMarkupTree(prefix + source);
  tree.roots.filter((root) => root.type === "diagram").forEach((root) => { root._isRoot = true; });
  const nodeTypeNames = new Set(tree.roots.filter((root) => root.type === "node-definition").map((root) => root.name));
  const lineTypeNames = new Set(tree.roots.filter((root) => root.type === "line-definition").map((root) => root.name));
  tree.roots.forEach((root) => normalizeGroups(root, tree.errors, nodeTypeNames, lineTypeNames));
  const result = compileMarkup(tree);
  if (prefixLines) {
    const adjust = (value) => value > prefixLines ? value - prefixLines : value;
    result.nodes.forEach((node) => {
      node.lineNumber = adjust(node.lineNumber);
      node.annotations.forEach((annotation) => { annotation.lineNumber = adjust(annotation.lineNumber); });
    });
    result.edges.forEach((edge) => {
      edge.lineNumber = adjust(edge.lineNumber);
      edge.labelLineNumber = adjust(edge.labelLineNumber);
    });
    result.groups.forEach((group) => { group.lineNumber = adjust(group.lineNumber); });
    result.errors = result.errors.map((error) => error.replace(/^Line (\d+):/, (_, line) => `Line ${adjust(Number(line))}:`));
  }
  return result;
}
