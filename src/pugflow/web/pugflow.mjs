import { parseDiagram } from "./parser.mjs";
import { DEFAULT_LAYOUT, inheritedFlowOffsets, layoutDiagram } from "./layout.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
const MATH_SYMBOLS = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", theta: "θ", lambda: "λ", mu: "μ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Omega: "Ω",
  times: "×", cdot: "·", pm: "±", leq: "≤", geq: "≥", neq: "≠", approx: "≈", infty: "∞", sum: "∑", prod: "∏", int: "∫", partial: "∂", nabla: "∇", rightarrow: "→", leftarrow: "←", leftrightarrow: "↔",
};
const SUPERSCRIPT = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ" };
const SUBSCRIPT = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", x: "ₓ" };

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined && value !== "") element.setAttribute(key, String(value));
  }
  return element;
}

function cssVariables(element) {
  const styles = getComputedStyle(element);
  const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return {
    background: read("--diagram-background", "#ffffff"),
    label: read("--diagram-label", "#111111"),
    text: read("--diagram-text", "#111111"),
    merge: read("--diagram-merge", "#111111"),
    annotation: read("--diagram-annotation", "#111111"),
    font: read("--diagram-font", "Verdana, sans-serif"),
  };
}

function figureColors(container, figure = {}) {
  const colors = cssVariables(container);
  for (const key of Object.keys(colors)) {
    if (figure[key] !== null && figure[key] !== undefined && figure[key] !== "") colors[key] = figure[key];
  }
  return colors;
}

function mapScript(value, table) {
  return [...value].map((character) => table[character] ?? character).join("");
}

/** Lightweight inline TeX conversion for portable SVG text. */
export function formatMath(text) {
  return text.replace(/\$([^$]+)\$/g, (_match, expression) => expression
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^{}]+)\}/g, "√($1)")
    .replace(/\^\{([^{}]+)\}|\^([\w+\-=()])/g, (_all, group, single) => mapScript(group ?? single, SUPERSCRIPT))
    .replace(/_\{([^{}]+)\}|_([\w+\-=()])/g, (_all, group, single) => mapScript(group ?? single, SUBSCRIPT))
    .replace(/\\([A-Za-z]+)/g, (_all, command) => MATH_SYMBOLS[command] ?? `\\${command}`)
    .replace(/[{}]/g, ""));
}

function wrapText(text, maxWidth, measure) {
  const output = [];
  for (const explicitLine of text.split("\n")) {
    const words = explicitLine.split(/\s+/).filter(Boolean);
    if (!words.length) { output.push(""); continue; }
    let line = words.shift();
    for (const word of words) {
      if (measure(`${line} ${word}`) <= maxWidth) line += ` ${word}`;
      else { output.push(line); line = word; }
    }
    output.push(line);
  }
  return output;
}

function measureNodes(nodes, colors) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = `16px ${colors.font}`;
  const measure = (text) => context.measureText(text).width;

  return nodes.map((node) => {
    context.font = `${node.style.fontStyle} ${node.style.fontWeight} ${node.style.fontSize}px ${node.style.fontFamily ?? colors.font}`;
    const label = formatMath(node.label);
    const requestedWidth = node.style.width;
    const initialLines = label.split("\n");
    const imageOnly = Boolean(node.style.image) && !label.trim();
    const imageWidth = node.style.image ? node.style.imageWidth + node.style.imagePadding * 2 : 0;
    const imageHeight = node.style.image ? node.style.imageHeight + node.style.imagePadding * 2 : 0;
    const naturalWidth = imageOnly ? imageWidth : Math.max(Math.max(...initialLines.map(measure), 70) + 32, imageWidth);
    const width = requestedWidth === "auto" ? Math.max(imageWidth, Math.min(300, Math.max(110, naturalWidth))) : Math.max(requestedWidth, imageWidth);
    const lines = wrapText(label, Math.max(36, width - 30), measure);
    const lineHeight = Math.ceil(node.style.fontSize * 1.2);
    const naturalHeight = imageOnly ? imageHeight : Math.max(42, lines.length * lineHeight + 20, imageHeight);
    const height = node.style.height === "auto" ? naturalHeight : Math.max(node.style.height, imageHeight);
    const above = node.annotations.filter((annotation) => annotation.position === "above").map((annotation) => ({ ...annotation, text: formatMath(annotation.text) }));
    const below = node.annotations.filter((annotation) => annotation.position === "below").map((annotation) => ({ ...annotation, text: formatMath(annotation.text) }));
    const aboveHeight = above.length ? above.length * 16 + 7 : 0;
    const belowHeight = below.length ? below.length * 16 + 7 : 0;
    return { ...node, width, height, lines, lineHeight, above, below, aboveHeight, belowHeight, layoutHeight: height };
  });
}

function boxTop(node) { return node.y; }
function centerY(node) { return boxTop(node) + node.height / 2; }
function annotationY(node, annotation, index) {
  if (annotation.position === "above") return boxTop(node) - 7 - (node.above.length - index - 1) * 16 + annotation.offsetY;
  return boxTop(node) + node.height + 17 + index * 16 + annotation.offsetY;
}
function edgeColor(edge, colors) { return edge.color === "merge" ? colors.merge : edge.color ?? colors.label; }
function dashArray(style) { return style === "dashed" ? "8 6" : style === "dotted" ? "2 5" : null; }

function ensureShadow(defs, node) {
  if (!node.style.shadowColor) return null;
  const id = `shadow-${node.id.replace(/[^\w-]/g, "-")}`;
  const filter = svgElement("filter", { id, x: "-50%", y: "-50%", width: "200%", height: "200%" });
  filter.append(svgElement("feDropShadow", {
    dx: node.style.shadowOffsetX, dy: node.style.shadowOffsetY, stdDeviation: node.style.shadowBlur,
    "flood-color": node.style.shadowColor, "flood-opacity": Math.min(1, node.style.shadowOpacity),
  }));
  defs.append(filter);
  return `url(#${id})`;
}

function shapeElement(node, colors, defs) {
  const top = boxTop(node);
  const outline = node.style.outline ?? (node.kind === "merge" ? colors.merge : colors.label);
  const common = {
    class: "label-box",
    fill: node.style.fill,
    stroke: outline,
    "stroke-width": node.style.outlineWidth,
    "stroke-dasharray": dashArray(node.style.outlineStyle),
    filter: ensureShadow(defs, node),
    "data-line": node.lineNumber,
    "data-id": node.id,
    "data-drag-kind": "node",
    "data-current-x": node.offsetX ?? 0,
    "data-current-y": node.offsetY ?? 0,
    role: "link",
    tabindex: 0,
    "aria-label": "Move or edit block " + node.label.replace(/\n/g, " "),
  };
  if (node.style.shape === "diamond") {
    return svgElement("polygon", { ...common, points: `${node.x + node.width / 2},${top} ${node.x + node.width},${top + node.height / 2} ${node.x + node.width / 2},${top + node.height} ${node.x},${top + node.height / 2}` });
  }
  if (node.style.shape === "hexagon") {
    const inset = Math.min(24, node.width * 0.15);
    return svgElement("polygon", { ...common, points: `${node.x + inset},${top} ${node.x + node.width - inset},${top} ${node.x + node.width},${top + node.height / 2} ${node.x + node.width - inset},${top + node.height} ${node.x + inset},${top + node.height} ${node.x},${top + node.height / 2}` });
  }
  const radius = node.style.shape === "square" ? 0 : node.style.shape === "pill" ? node.height / 2 : node.style.shape === "rounded" ? 12 : 5;
  return svgElement("rect", { ...common, x: node.x, y: top, width: node.width, height: node.height, rx: radius });
}

function addNode(svg, node, colors, defs) {
  const group = svgElement("g", {
    class: `entry ${node.kind === "merge" ? "merge-entry" : ""}`.trim(),
    "data-id": node.id,
    "data-selection-key": `node:${node.id}`,
    "data-line": node.lineNumber,
    role: "link",
    tabindex: 0,
    "aria-label": `Edit ${node.label.replace(/\n/g, " ")}`,
  });
  const top = boxTop(node);
  node.above.filter((annotation) => !annotation.hidden).forEach((annotation, index) => {
    const text = svgElement("text", {
      class: "block-annotation",
      x: node.x + node.width / 2 + annotation.offsetX,
      y: annotationY(node, annotation, index),
      fill: annotation.color ?? colors.annotation,
      "font-family": annotation.fontFamily ?? colors.font,
      "font-size": annotation.fontSize, "font-weight": annotation.fontWeight,
      "font-style": annotation.fontStyle, "text-decoration": annotation.textDecoration,
      "data-line": annotation.lineNumber,
      "data-id": node.id,
      "data-select-kind": "node",
      "data-selection-key": `node:${node.id}`,
      "data-drag-kind": "block-annotation",
      "data-current-x": annotation.offsetX,
      "data-current-y": annotation.offsetY,
      role: "link",
      tabindex: 0,
      "aria-label": "Move or edit annotation " + annotation.text,
    });
    text.textContent = annotation.text;
    group.append(text);
  });
  const shape = shapeElement(node, colors, defs);
  group.append(shape);
  if (node.style.image) {
    const clipId = `image-clip-${node.id.replace(/[^\w-]/g, "-")}`;
    const clip = svgElement("clipPath", { id: clipId });
    const clipShape = shape.cloneNode(false);
    ["class", "filter", "stroke", "stroke-width", "stroke-dasharray", "data-line", "data-id", "data-drag-kind", "data-current-x", "data-current-y", "role", "tabindex", "aria-label"].forEach((name) => clipShape.removeAttribute(name));
    clip.append(clipShape);
    defs.append(clip);
    const preserveAspectRatio = node.style.imageFit === "fill" ? "none" : `xMidYMid ${node.style.imageFit === "cover" ? "slice" : "meet"}`;
    const imageX = node.x + (node.width - node.style.imageWidth) / 2 + node.imageOffsetX;
    const imageY = top + (node.height - node.style.imageHeight) / 2 + node.imageOffsetY;
    group.append(svgElement("image", {
      href: node.style.image,
      x: imageX,
      y: imageY,
      width: node.style.imageWidth,
      height: node.style.imageHeight,
      opacity: Math.min(1, node.style.imageOpacity),
      preserveAspectRatio,
      "clip-path": `url(#${clipId})`,
      "data-line": node.lineNumber,
      "data-id": node.id,
      "data-drag-kind": "node-image",
      "data-select-kind": "image",
      "data-selection-key": `image:${node.id}`,
      "data-current-x": node.imageOffsetX,
      "data-current-y": node.imageOffsetY,
      role: "link",
      tabindex: 0,
      "aria-label": `Move image in ${node.label.replace(/\n/g, " ")}`,
    }));
    const handles = svgElement("g", { class: "image-resize-handles", display: "none", "aria-hidden": "true" });
    handles.append(svgElement("rect", { class: "image-resize-frame", x: imageX, y: imageY, width: node.style.imageWidth, height: node.style.imageHeight }));
    for (const [resizeX, resizeY] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
      handles.append(svgElement("circle", {
        class: "image-resize-handle",
        cx: imageX + (resizeX + 1) * node.style.imageWidth / 2,
        cy: imageY + (resizeY + 1) * node.style.imageHeight / 2,
        r: 5,
        "data-line": node.lineNumber,
        "data-id": node.id,
        "data-drag-kind": "node-image-resize",
        "data-resize-x": resizeX,
        "data-resize-y": resizeY,
        "data-current-x": node.imageOffsetX,
        "data-current-y": node.imageOffsetY,
        "data-current-width": node.style.imageWidth,
        "data-current-height": node.style.imageHeight,
      }));
    }
    group.append(handles);
  }
  const textColor = node.style.color ?? colors.text;
  const anchor = node.style.align === "left" ? "start" : node.style.align === "right" ? "end" : "middle";
  const baseX = node.style.align === "left" ? node.x + 16 : node.style.align === "right" ? node.x + node.width - 16 : node.x + node.width / 2;
  const x = baseX + node.labelOffsetX;
  const text = svgElement("text", {
    class: "label",
    x,
    y: top + node.height / 2 - ((node.lines.length - 1) * node.lineHeight / 2) + node.labelOffsetY,
    fill: textColor,
    "font-family": node.style.fontFamily ?? colors.font,
    "font-size": node.style.fontSize, "font-weight": node.style.fontWeight,
    "font-style": node.style.fontStyle, "text-decoration": node.style.textDecoration,
    "text-anchor": anchor,
    "dominant-baseline": "middle",
    "data-line": node.lineNumber,
    "data-id": node.id,
    "data-drag-kind": "node-label",
    "data-select-kind": "node",
    "data-selection-key": `node:${node.id}`,
    "data-current-x": node.labelOffsetX,
    "data-current-y": node.labelOffsetY,
    role: "link",
    tabindex: 0,
    "aria-label": "Move or edit label " + node.label.replace(/\n/g, " "),
  });
  node.lines.forEach((line, index) => {
    const span = svgElement("tspan", { x, dy: index ? node.lineHeight : 0 });
    span.textContent = line;
    text.append(span);
  });
  group.append(text);
  node.below.filter((annotation) => !annotation.hidden).forEach((annotation, index) => {
    const annotationText = svgElement("text", {
      class: "block-annotation",
      x: node.x + node.width / 2 + annotation.offsetX,
      y: annotationY(node, annotation, index),
      fill: annotation.color ?? colors.annotation,
      "font-family": annotation.fontFamily ?? colors.font,
      "font-size": annotation.fontSize, "font-weight": annotation.fontWeight,
      "font-style": annotation.fontStyle, "text-decoration": annotation.textDecoration,
      "data-line": annotation.lineNumber,
      "data-id": node.id,
      "data-select-kind": "node",
      "data-selection-key": `node:${node.id}`,
      "data-drag-kind": "block-annotation",
      "data-current-x": annotation.offsetX,
      "data-current-y": annotation.offsetY,
      role: "link",
      tabindex: 0,
      "aria-label": "Move or edit annotation " + annotation.text,
    });
    annotationText.textContent = annotation.text;
    group.append(annotationText);
  });
  svg.append(group);
}

function markerId(color) {
  let hash = 0;
  for (const character of color) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return `arrow-${Math.abs(hash)}`;
}

function ensureMarker(defs, color) {
  const id = markerId(color);
  if (defs.querySelector(`#${id}`)) return id;
  const marker = svgElement("marker", { id, viewBox: "0 0 10 10", refX: 8.5, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse", markerUnits: "strokeWidth" });
  marker.append(svgElement("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: color }));
  defs.append(marker);
  return id;
}

/** Route a connection with straight segments and small rounded 90-degree bends. */
export function connectionPath(source, target, kind = "branch", direction = "right", targetPortOffset = 0, sourcePortOffset = 0, targetDirection = direction) {
  const vertical = direction === "up" || direction === "down";
  const sx = vertical ? source.x + source.width / 2 + sourcePortOffset : direction === "left" ? source.x : source.x + source.width;
  const sy = vertical ? direction === "up" ? boxTop(source) : boxTop(source) + source.height : centerY(source) + sourcePortOffset;
  const targetVertical = targetDirection === "up" || targetDirection === "down";
  const tx = targetVertical ? target.x + target.width / 2 + targetPortOffset : targetDirection === "left" ? target.x + target.width : target.x;
  const ty = targetVertical ? targetDirection === "up" ? boxTop(target) + target.height : boxTop(target) : centerY(target) + targetPortOffset;
  if (targetDirection !== direction) {
    const sourceVector = direction === "right" ? { x: 1, y: 0 } : direction === "left" ? { x: -1, y: 0 } : direction === "down" ? { x: 0, y: 1 } : { x: 0, y: -1 };
    const targetVector = targetDirection === "right" ? { x: 1, y: 0 } : targetDirection === "left" ? { x: -1, y: 0 } : targetDirection === "down" ? { x: 0, y: 1 } : { x: 0, y: -1 };
    const startLead = { x: sx + sourceVector.x * 24, y: sy + sourceVector.y * 24 };
    const endLead = { x: tx - targetVector.x * 24, y: ty - targetVector.y * 24 };
    let middle;
    if (sourceVector.x && targetVector.y) middle = [{ x: startLead.x, y: endLead.y }];
    else if (sourceVector.y && targetVector.x) middle = [{ x: endLead.x, y: startLead.y }];
    else if (sourceVector.x) {
      const middleY = (startLead.y + endLead.y) / 2;
      middle = [{ x: startLead.x, y: middleY }, { x: endLead.x, y: middleY }];
    } else {
      const middleX = (startLead.x + endLead.x) / 2;
      middle = [{ x: middleX, y: startLead.y }, { x: middleX, y: endLead.y }];
    }
    return roundedRoute([{ x: sx, y: sy }, startLead, ...middle, endLead, { x: tx, y: ty }]);
  }
  if (vertical) {
    if (Math.abs(sx - tx) < 1) return { d: `M ${sx} ${sy} V ${ty}`, labelX: sx, labelY: (sy + ty) / 2 };
    const middle = sy + (ty - sy) * (kind === "merge" ? 0.58 : 0.5);
    const ySign = Math.sign(ty - sy) || 1;
    const xSign = Math.sign(tx - sx) || 1;
    const radius = Math.min(9, Math.abs(tx - sx) / 2, Math.abs(middle - sy) / 2, Math.abs(ty - middle) / 2);
    return {
      d: `M ${sx} ${sy} V ${middle - ySign * radius} Q ${sx} ${middle} ${sx + xSign * radius} ${middle} H ${tx - xSign * radius} Q ${tx} ${middle} ${tx} ${middle + ySign * radius} V ${ty}`,
      labelX: tx,
      labelY: kind === "merge" ? (sy + middle) / 2 : (middle + ty) / 2,
    };
  }
  if (Math.abs(sy - ty) < 1) return { d: `M ${sx} ${sy} H ${tx}`, labelX: (sx + tx) / 2, labelY: sy };
  const middle = sx + (tx - sx) * (kind === "merge" ? 0.58 : 0.5);
  const xSign = Math.sign(tx - sx) || 1;
  const ySign = Math.sign(ty - sy) || 1;
  const radius = Math.min(9, Math.abs(ty - sy) / 2, Math.abs(middle - sx) / 2, Math.abs(tx - middle) / 2);
  return {
    d: `M ${sx} ${sy} H ${middle - xSign * radius} Q ${middle} ${sy} ${middle} ${sy + ySign * radius} V ${ty - ySign * radius} Q ${middle} ${ty} ${middle + xSign * radius} ${ty} H ${tx}`,
    labelX: kind === "merge" ? (sx + middle) / 2 : (middle + tx) / 2,
    labelY: kind === "merge" ? sy : ty,
  };
}

function segmentClear(a, b, obstacles) {
  return obstacles.every((box) => {
    if (a.y === b.y) {
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      return !(a.y > box.top && a.y < box.bottom && right > box.left && left < box.right);
    }
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y, b.y);
    return !(a.x > box.left && a.x < box.right && bottom > box.top && top < box.bottom);
  });
}

function roundedRoute(points) {
  const unique = points.filter((point, index) => !index || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
  const compact = unique.filter((point, index) => {
    if (!index || index === unique.length - 1) return true;
    const previous = unique[index - 1];
    const next = unique[index + 1];
    return !((previous.x === point.x && point.x === next.x) || (previous.y === point.y && point.y === next.y));
  });
  let d = `M ${compact[0].x} ${compact[0].y}`;
  for (let index = 1; index < compact.length - 1; index += 1) {
    const previous = compact[index - 1];
    const point = compact[index];
    const next = compact[index + 1];
    const incoming = Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
    const outgoing = Math.abs(next.x - point.x) + Math.abs(next.y - point.y);
    const radius = Math.min(9, incoming / 2, outgoing / 2);
    const before = {
      x: point.x - Math.sign(point.x - previous.x) * radius,
      y: point.y - Math.sign(point.y - previous.y) * radius,
    };
    const after = {
      x: point.x + Math.sign(next.x - point.x) * radius,
      y: point.y + Math.sign(next.y - point.y) * radius,
    };
    d += ` L ${before.x} ${before.y} Q ${point.x} ${point.y} ${after.x} ${after.y}`;
  }
  const last = compact.at(-1);
  d += ` L ${last.x} ${last.y}`;
  const segments = compact.slice(1).map((point, index) => ({
    a: compact[index],
    b: point,
    length: Math.abs(point.x - compact[index].x) + Math.abs(point.y - compact[index].y),
  }));
  const labelSegment = segments.sort((a, b) => b.length - a.length)[0];
  return {
    d,
    labelX: (labelSegment.a.x + labelSegment.b.x) / 2,
    labelY: (labelSegment.a.y + labelSegment.b.y) / 2,
  };
}

export function connectionPathAvoidingNodes(source, target, kind, direction, nodes, targetPortOffset = 0, sourcePortOffset = 0, targetDirection = direction) {
  const basic = connectionPath(source, target, kind, direction, targetPortOffset, sourcePortOffset, targetDirection);
  const vertical = direction === "up" || direction === "down";
  const start = vertical
    ? { x: source.x + source.width / 2 + sourcePortOffset, y: direction === "up" ? boxTop(source) : boxTop(source) + source.height }
    : { x: direction === "left" ? source.x : source.x + source.width, y: centerY(source) + sourcePortOffset };
  const targetVertical = targetDirection === "up" || targetDirection === "down";
  const end = targetVertical
    ? { x: target.x + target.width / 2 + targetPortOffset, y: targetDirection === "up" ? boxTop(target) + target.height : boxTop(target) }
    : { x: targetDirection === "left" ? target.x + target.width : target.x, y: centerY(target) + targetPortOffset };
  const portVector = direction === "right" ? { x: 1, y: 0 }
    : direction === "left" ? { x: -1, y: 0 }
      : direction === "down" ? { x: 0, y: 1 }
        : { x: 0, y: -1 };
  const targetVector = targetDirection === "right" ? { x: 1, y: 0 }
    : targetDirection === "left" ? { x: -1, y: 0 }
      : targetDirection === "down" ? { x: 0, y: 1 }
        : { x: 0, y: -1 };
  const portLead = 24;
  const startLead = { x: start.x + portVector.x * portLead, y: start.y + portVector.y * portLead };
  const endLead = { x: end.x - targetVector.x * portLead, y: end.y - targetVector.y * portLead };
  const obstacles = nodes
    .filter((node) => node.id !== source.id && node.id !== target.id && !node.hidden)
    .map((node) => ({ left: node.x - 12, right: node.x + node.width + 12, top: boxTop(node) - 12, bottom: boxTop(node) + node.height + 12 }));
  if (!obstacles.length || segmentClear(start, end, obstacles) && (start.x === end.x || start.y === end.y)) return basic;

  const xValues = [...new Set([startLead.x, endLead.x, ...obstacles.flatMap((box) => [box.left, box.right])])];
  const yValues = [...new Set([startLead.y, endLead.y, ...obstacles.flatMap((box) => [box.top, box.bottom])])];
  const points = [];
  const pointByKey = new Map();
  for (const x of xValues) for (const y of yValues) {
    if (obstacles.some((box) => x > box.left && x < box.right && y > box.top && y < box.bottom)) continue;
    const point = { x, y };
    points.push(point);
    pointByKey.set(`${x},${y}`, point);
  }
  const adjacency = new Map(points.map((point) => [point, []]));
  const connect = (items, coordinate) => {
    items.sort((a, b) => a[coordinate] - b[coordinate]);
    for (let index = 1; index < items.length; index += 1) {
      const a = items[index - 1];
      const b = items[index];
      if (!segmentClear(a, b, obstacles)) continue;
      adjacency.get(a).push(b);
      adjacency.get(b).push(a);
    }
  };
  yValues.forEach((y) => connect(points.filter((point) => point.y === y), "x"));
  xValues.forEach((x) => connect(points.filter((point) => point.x === x), "y"));

  const startPoint = pointByKey.get(`${startLead.x},${startLead.y}`);
  const endPoint = pointByKey.get(`${endLead.x},${endLead.y}`);
  if (!startPoint || !endPoint) return basic;
  const queue = [{ point: startPoint, axis: "", cost: 0, previous: null }];
  const best = new Map();
  let finished = null;
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const state = queue.shift();
    const stateKey = `${state.point.x},${state.point.y}|${state.axis}`;
    if (best.has(stateKey) && best.get(stateKey) <= state.cost) continue;
    best.set(stateKey, state.cost);
    if (state.point === endPoint) { finished = state; break; }
    for (const neighbor of adjacency.get(state.point)) {
      const axis = neighbor.x === state.point.x ? "v" : "h";
      const distance = Math.abs(neighbor.x - state.point.x) + Math.abs(neighbor.y - state.point.y);
      queue.push({ point: neighbor, axis, cost: state.cost + distance + (state.axis && state.axis !== axis ? 18 : 0), previous: state });
    }
  }
  if (!finished) return basic;
  const route = [];
  for (let state = finished; state; state = state.previous) route.unshift(state.point);
  route.unshift(start);
  route.push(end);
  return roundedRoute(route);
}

function addEdge(svg, defs, edge, source, target, colors, nodes) {
  const color = edgeColor(edge, colors);
  const marker = ensureMarker(defs, color);
  const vertical = ["up", "down"].includes(edge.layoutDirection);
  const targetDirection = edge.targetLayoutDirection ?? edge.layoutDirection;
  const targetVertical = ["up", "down"].includes(targetDirection);
  const targetPortOffset = (edge.targetPortFraction ?? 0) * (targetVertical ? target.width : target.height);
  const sourcePortOffset = (edge.sourcePortFraction ?? 0) * (vertical ? source.width : source.height);
  const route = connectionPathAvoidingNodes(source, target, edge.kind, edge.layoutDirection, nodes, targetPortOffset, sourcePortOffset, targetDirection);
  const path = svgElement("path", {
    d: route.d,
    class: `connector ${edge.kind}`,
    stroke: color,
    "stroke-width": edge.width,
    "stroke-dasharray": dashArray(edge.style),
    "marker-start": ["backward", "both"].includes(edge.direction) ? `url(#${marker})` : null,
    "marker-end": ["forward", "both"].includes(edge.direction) ? `url(#${marker})` : null,
    "data-line": edge.lineNumber,
    "data-selection-key": `line:${edge.from}:${edge.to}:${edge.lineNumber}`,
    "data-from": edge.from,
    "data-to": edge.to,
    role: "link",
    tabindex: 0,
    "aria-label": "Edit connection",
  });
  svg.append(path);
  if (edge.label) {
    const offset = edge.labelPosition === "below" ? 16 : -8;
    const label = svgElement("text", {
      class: "connection-annotation",
      x: route.labelX + edge.labelOffsetX,
      y: route.labelY + offset + edge.labelOffsetY,
      fill: color,
      "font-family": edge.fontFamily ?? colors.font,
      "font-size": edge.fontSize, "font-weight": edge.fontWeight,
      "font-style": edge.fontStyle, "text-decoration": edge.textDecoration,
      "data-line": edge.labelLineNumber,
      "data-offset-line": edge.lineNumber,
      "data-drag-kind": "connection-label",
      "data-select-kind": "line",
      "data-selection-key": `line:${edge.from}:${edge.to}:${edge.lineNumber}`,
      "data-from": edge.from,
      "data-to": edge.to,
      "data-current-x": edge.labelOffsetX,
      "data-current-y": edge.labelOffsetY,
      role: "link",
      tabindex: 0,
      "aria-label": "Move or edit connection annotation " + formatMath(edge.label),
    });
    label.textContent = formatMath(edge.label);
    svg.append(label);
  }
}

export function edgeIsVisible(edge, nodesById) {
  const source = nodesById.get(edge.from);
  const target = nodesById.get(edge.to);
  return Boolean(source && target && !edge.hidden && !source.hidden && !target.hidden);
}

function layoutOptionsForLabels(edges, colors, requested = {}) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const widestLabel = Math.max(0, ...edges.map((edge) => {
    context.font = `${edge.fontStyle ?? "normal"} ${edge.fontWeight ?? "normal"} ${edge.fontSize ?? 12}px ${edge.fontFamily ?? colors.font}`;
    return context.measureText(formatMath(edge.label ?? "")).width;
  }));
  return {
    ...requested,
    horizontalGutter: Math.max(requested.horizontalGutter ?? DEFAULT_LAYOUT.horizontalGutter, Math.ceil(widestLabel + 46)),
  };
}

function diagramBounds(groups, nodesById) {
  return groups.map((group) => {
    const nodes = group.nodeIds.map((id) => nodesById.get(id)).filter(Boolean);
    if (!nodes.length) return null;
    const padding = group.padding ?? 24;
    const titleSpace = group.label ? 22 : 0;
    return {
      ...group,
      x: Math.min(...nodes.map((node) => node.x)) - padding,
      y: Math.min(...nodes.map((node) => node.y)) - padding - titleSpace,
      right: Math.max(...nodes.map((node) => node.x + node.width)) + padding,
      bottom: Math.max(...nodes.map((node) => node.y + node.layoutHeight)) + padding,
    };
  }).filter(Boolean);
}

function addDiagramFrame(svg, group, colors) {
  const frame = svgElement("g", { "data-line": group.lineNumber, "data-id": group.id, "data-select-kind": "graph", "data-selection-key": `graph:${group.id}`, "data-drag-kind": "graph", "data-current-x": group.offsetX ?? 0, "data-current-y": group.offsetY ?? 0 });
  frame.append(svgElement("rect", {
    class: "subdiagram-frame", x: group.x, y: group.y, width: group.right - group.x, height: group.bottom - group.y,
    rx: 12, fill: group.fill, stroke: group.outline, "stroke-width": group.outlineWidth,
    "stroke-dasharray": dashArray(group.outlineStyle),
  }));
  if (group.label) {
    const label = svgElement("text", { class: "subdiagram-label", x: group.x + 12, y: group.y + 17, fill: group.color ?? colors.text, "data-line": group.lineNumber, "data-id": group.id, "data-select-kind": "graph", "data-selection-key": `graph:${group.id}` });
    label.textContent = group.label;
    frame.append(label);
  }
  svg.append(frame);
}

function packSiblingGraphs(nodes, groups, gap = 80) {
  const maximal = groups.filter((group) => !groups.some((other) => other !== group
    && group.nodeIds.every((id) => other.nodeIds.includes(id)) && other.nodeIds.length > group.nodeIds.length));
  if (maximal.length < 2) return nodes;
  const shifts = new Map();
  let previousBottom = null;
  let anchorLeft = null;
  for (const group of maximal) {
    const members = nodes.filter((node) => group.nodeIds.includes(node.id));
    if (!members.length) continue;
    const top = Math.min(...members.map((node) => node.y));
    const bottom = Math.max(...members.map((node) => node.y + node.layoutHeight));
    const left = Math.min(...members.map((node) => node.x));
    if (anchorLeft === null) anchorLeft = left;
    const shiftY = previousBottom === null ? 0 : Math.max(0, previousBottom + gap - top);
    const shiftX = anchorLeft - left;
    group.nodeIds.forEach((id) => shifts.set(id, { x: shiftX, y: shiftY }));
    previousBottom = bottom + shiftY;
  }
  return nodes.map((node) => ({ ...node, x: node.x + (shifts.get(node.id)?.x ?? 0), y: node.y + (shifts.get(node.id)?.y ?? 0) }));
}

function renderSvg(container, graph, options) {
  const colors = figureColors(container, graph.figure);
  const measured = measureNodes(graph.nodes, colors);
  const layout = layoutDiagram(measured, graph.edges, layoutOptionsForLabels(graph.edges, colors, options.layout));
  const flowOffsets = inheritedFlowOffsets(layout.nodes, graph.edges);
  let visualNodes = layout.nodes.map((node) => {
    const graphOffset = (graph.groups ?? []).filter((group) => group.nodeIds.includes(node.id))
      .reduce((total, group) => ({ x: total.x + (group.offsetX ?? 0), y: total.y + (group.offsetY ?? 0) }), { x: 0, y: 0 });
    const inherited = flowOffsets.get(node.id) ?? { x: 0, y: 0 };
    return { ...node, x: node.x + node.offsetX + inherited.x + graphOffset.x, y: node.y + node.offsetY + inherited.y + graphOffset.y };
  });
  visualNodes = packSiblingGraphs(visualNodes, graph.groups ?? []);
  const byId = new Map(visualNodes.map((node) => [node.id, node]));
  const groups = diagramBounds((graph.groups ?? []).filter((group) => !group.hidden), byId);
  const extentX = visualNodes.flatMap((node) => [
    node.x,
    node.x + node.width,
    node.x + node.width / 2 + node.labelOffsetX,
    ...node.annotations.map((annotation) => node.x + node.width / 2 + annotation.offsetX),
  ]);
  const extentY = visualNodes.flatMap((node) => [
    boxTop(node),
    boxTop(node) + node.height,
    boxTop(node) + node.height / 2 + node.labelOffsetY,
    ...node.above.map((annotation, index) => annotationY(node, annotation, index)),
    ...node.below.map((annotation, index) => annotationY(node, annotation, index)),
  ]);
  const viewX = extentX.length ? Math.min(...extentX.map((value) => value - 60), ...groups.map((group) => group.x - 20)) : 0;
  const viewY = extentY.length ? Math.min(...extentY.map((value) => value - 40), ...groups.map((group) => group.y - 20)) : 0;
  const viewRight = extentX.length ? Math.max(...extentX.map((value) => value + 60), ...groups.map((group) => group.right + 20)) : 1;
  const viewBottom = extentY.length ? Math.max(...extentY.map((value) => value + 40), ...groups.map((group) => group.bottom + 20)) : 1;
  const viewWidth = viewRight - viewX;
  const viewHeight = viewBottom - viewY;
  const svg = svgElement("svg", { xmlns: SVG_NS, viewBox: `${viewX} ${viewY} ${viewWidth} ${viewHeight}`, width: viewWidth, height: viewHeight, role: "img", "aria-label": options.accessibleLabel ?? "Block diagram" });
  svg.classList.add("pugflow-svg");
  const style = svgElement("style");
  style.textContent = `
    .diagram-background { fill: ${colors.background}; }
    .label { user-select: none; }
    .block-annotation, .connection-annotation { text-anchor: middle; user-select: none; }
    .connection-annotation { paint-order: stroke; stroke: ${colors.background}; stroke-width: 4px; stroke-linejoin: round; }
    .subdiagram-label { font: 600 13px ${colors.font}; }
    .connector { fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .interactive [data-line] { cursor: pointer; }
    .interactive [data-drag-kind] { touch-action: none; }
    .interactive .entry:hover .label-box, .interactive .entry:focus .label-box { filter: brightness(1.08); }
    .interactive text[data-line]:hover, .interactive text[data-line]:focus { text-decoration: underline; }
    .interactive path[data-line]:hover, .interactive path[data-line]:focus { filter: brightness(1.25); }
    .interactive .dragging { opacity: .82; }
    .interactive .drag-origin { opacity: .24; pointer-events: none; }
  `;
  svg.append(style);
  const defs = svgElement("defs");
  svg.append(defs);
  svg.append(svgElement("rect", { class: "diagram-background", x: viewX, y: viewY, width: viewWidth, height: viewHeight }));
  [...groups].sort((a, b) => b.nodeIds.length - a.nodeIds.length).forEach((group) => addDiagramFrame(svg, group, colors));
  layout.edges.forEach((edge) => {
    const source = byId.get(edge.from);
    const target = byId.get(edge.to);
    if (edgeIsVisible(edge, byId)) addEdge(svg, defs, edge, source, target, colors, visualNodes);
  });
  visualNodes.forEach((node) => { if (!node.hidden) addNode(svg, node, colors, defs); });
  Object.defineProperty(svg, "__diagramLayout", { value: { ...layout, nodes: visualNodes, groups } });
  if (options.onNodeClick || options.onElementMove) {
    svg.classList.add("interactive");
    let drag = null;
    let navigationPointer = null;
    const pointFor = (event) => {
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      return point.matrixTransform(svg.getScreenCTM().inverse());
    };
    if (options.onNodeClick) {
      svg.addEventListener("pointerdown", (event) => {
        const target = event.target.closest?.("[data-line]");
        if (!target || event.button !== 0) return;
        navigationPointer = {
          pointerId: event.pointerId,
          target,
          clientX: event.clientX,
          clientY: event.clientY,
          moved: false,
        };
      });
      svg.addEventListener("pointermove", (event) => {
        if (!navigationPointer || navigationPointer.pointerId !== event.pointerId) return;
        if (Math.hypot(event.clientX - navigationPointer.clientX, event.clientY - navigationPointer.clientY) > 2) {
          navigationPointer.moved = true;
        }
      });
      svg.addEventListener("pointerup", (event) => {
        if (!navigationPointer || navigationPointer.pointerId !== event.pointerId) return;
        const completed = navigationPointer;
        navigationPointer = null;
        if (!completed.moved) {
          const entry = completed.target.closest?.(".entry");
          const connector = completed.target.closest?.(".connector");
          const additive = event.ctrlKey || event.metaKey;
          const selectedTarget = completed.target.closest?.("[data-select-kind]") ?? completed.target;
          options.onElementClick?.({
            kind: selectedTarget.dataset.selectKind ?? (connector ? "line" : "node"),
            id: entry?.dataset.id ?? selectedTarget.dataset.id ?? null,
            from: connector?.dataset.from ?? selectedTarget.dataset.from ?? null,
            to: connector?.dataset.to ?? selectedTarget.dataset.to ?? null,
            lineNumber: Number(selectedTarget.dataset.line ?? completed.target.dataset.line),
            offsetLineNumber: Number(selectedTarget.dataset.offsetLine ?? selectedTarget.dataset.line),
            selectionKey: selectedTarget.dataset.selectionKey ?? connector?.dataset.selectionKey ?? entry?.dataset.selectionKey ?? null,
            additive,
          });
          if (!additive) options.onNodeClick({
            id: completed.target.dataset.id ?? null,
            lineNumber: Number(completed.target.dataset.line),
          });
        }
      });
      svg.addEventListener("pointercancel", (event) => {
        if (navigationPointer?.pointerId === event.pointerId) navigationPointer = null;
      });
    }
    if (options.onElementMove) {
      svg.addEventListener("pointerdown", (event) => {
        const target = event.target.closest?.("[data-drag-kind]");
        if (!target || event.button !== 0) return;
        event.preventDefault();
        const start = pointFor(event);
        const element = target.dataset.dragKind === "node" ? target.closest(".entry") : target;
        const ghost = element.cloneNode(true);
        ghost.classList.remove("dragging");
        ghost.classList.add("drag-origin");
        for (const item of [ghost, ...ghost.querySelectorAll("[data-line], [tabindex], [data-drag-kind]")]) {
          item.removeAttribute("data-line");
          item.removeAttribute("data-drag-kind");
          item.removeAttribute("tabindex");
          item.removeAttribute("role");
        }
        element.parentNode.insertBefore(ghost, element);
        drag = {
          pointerId: event.pointerId,
          target,
          element,
          ghost,
          start,
          dx: 0,
          dy: 0,
        };
        drag.element.classList.add("dragging");
        svg.setPointerCapture(event.pointerId);
      });
      svg.addEventListener("pointermove", (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        const point = pointFor(event);
        let dx = point.x - drag.start.x;
        let dy = point.y - drag.start.y;
        if (event.shiftKey) {
          if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        drag.dx = dx;
        drag.dy = dy;
        drag.element.setAttribute("transform", `translate(${drag.dx} ${drag.dy})`);
      });
      const finishDrag = (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        const completed = drag;
        drag = null;
        completed.element.removeAttribute("transform");
        completed.element.classList.remove("dragging");
        completed.ghost.remove();
        if (Math.hypot(completed.dx, completed.dy) > 2) {
          options.onElementMove({
            kind: completed.target.dataset.dragKind,
            id: completed.target.dataset.id ?? null,
            lineNumber: Number(completed.target.dataset.offsetLine ?? completed.target.dataset.line),
            currentX: Number(completed.target.dataset.currentX ?? 0),
            currentY: Number(completed.target.dataset.currentY ?? 0),
            currentWidth: Number(completed.target.dataset.currentWidth ?? 0),
            currentHeight: Number(completed.target.dataset.currentHeight ?? 0),
            resizeX: Number(completed.target.dataset.resizeX ?? 0),
            resizeY: Number(completed.target.dataset.resizeY ?? 0),
            dx: completed.dx,
            dy: completed.dy,
          });
        }
      };
      svg.addEventListener("pointerup", finishDrag);
      svg.addEventListener("pointercancel", (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        drag.element.removeAttribute("transform");
        drag.element.classList.remove("dragging");
        drag.ghost.remove();
        drag = null;
      });
    }
    const activateNode = (event) => {
      const target = event.target.closest?.("[data-line]");
      if (!target || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      options.onNodeClick?.({ id: target.dataset.id ?? null, lineNumber: Number(target.dataset.line) });
    };
    svg.addEventListener("keydown", activateNode);
  }
  return svg;
}

function serialize(svg) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
}

function download(blob, filename) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

export function createBlockDiagram(container, source, options = {}) {
  if (!(container instanceof Element)) throw new TypeError("A container element is required.");
  let currentSource = source;
  let currentStyles = options.styles ?? "";
  let currentSvg = null;
  let currentLayout = null;

  function render(nextSource = currentSource, nextStyles = currentStyles) {
    currentSource = nextSource;
    currentStyles = nextStyles;
    const graph = parseDiagram(currentSource, currentStyles);
    if (graph.errors.length) throw new Error(graph.errors.join("\n"));
    currentSvg = renderSvg(container, graph, options);
    currentLayout = currentSvg.__diagramLayout;
    container.classList.add("pugflow");
    container.replaceChildren(currentSvg);
    return graph;
  }
  function toSVGString() { if (!currentSvg) render(); return serialize(currentSvg); }
  function saveSVG(filename = "diagram.svg") { download(new Blob([toSVGString()], { type: "image/svg+xml;charset=utf-8" }), filename); }
  function saveSource(filename = "diagram.pug") { download(new Blob([currentSource], { type: "text/plain;charset=utf-8" }), filename); }
  function toPNGBlob(scale = 2) {
    return new Promise((resolve, reject) => {
      if (!currentSvg) render();
      const url = URL.createObjectURL(new Blob([toSVGString()], { type: "image/svg+xml;charset=utf-8" }));
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const viewBox = currentSvg.viewBox.baseVal;
        canvas.width = viewBox.width * scale;
        canvas.height = viewBox.height * scale;
        const context = canvas.getContext("2d");
        context.scale(scale, scale);
        context.drawImage(image, 0, 0);
        canvas.toBlob((png) => {
          URL.revokeObjectURL(url);
          if (!png) return reject(new Error("The browser could not create the PNG."));
          resolve(png);
        }, "image/png");
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The browser could not rasterize the SVG.")); };
      image.src = url;
    });
  }
  async function savePNG(filename = "diagram.png", scale = 2) { download(await toPNGBlob(scale), filename); }
  render();
  return {
    render, toSVGString, toPNGBlob, saveSVG, savePNG, saveSource,
    get source() { return currentSource; },
    get layout() { return currentLayout; },
  };
}

export { parseDiagram } from "./parser.mjs";
