function offsetNumber(value) {
  const rounded = Math.round(value * 10) / 10;
  return Math.abs(rounded) < 0.05 ? "0" : String(rounded);
}

function indentationWidth(line) {
  const whitespace = line.match(/^\s*/)?.[0] ?? "";
  return [...whitespace].reduce((width, character) => width + (character === "\t" ? 2 : 1), 0);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function offsetTuple(x, y) {
  return "(" + offsetNumber(x) + ", " + offsetNumber(y) + ")";
}

export function setNodeOffsetField(value, labelLineNumber, prefix, x, y) {
  const lines = value.split("\n");
  const labelIndex = labelLineNumber - 1;
  const indentation = lines[labelIndex]?.match(/^\s*/)?.[0] ?? "";
  if (lines[labelIndex]?.trim().match(/^\.label(?:\s|$)/)) {
    const propertyIndent = indentationWidth(lines[labelIndex]);
    let nodeIndex = labelIndex - 1;
    while (nodeIndex >= 0 && indentationWidth(lines[nodeIndex]) >= propertyIndent) nodeIndex -= 1;
    const nodeType = lines[nodeIndex]?.trim() ?? "node";
    if (/^\.[a-zA-Z][\w-]*$/.test(nodeType) || /^[a-zA-Z][\w-]*$/.test(nodeType)) {
      let end = nodeIndex + 1;
      while (end < lines.length && indentationWidth(lines[end]) > indentationWidth(lines[nodeIndex])) end += 1;
      const pattern = new RegExp("^" + escapeRegExp(indentation) + "\\." + escapeRegExp(prefix) + "(?:\\s|$)");
      const existing = lines.findIndex((line, index) => index > nodeIndex && index < end && pattern.test(line));
      const field = indentation + "." + prefix + " " + offsetTuple(x, y);
      if (existing >= 0) lines[existing] = field;
      else lines.splice(labelIndex, 0, field);
      return lines.join("\n");
    }
  }
  const tag = lines[labelIndex]?.trim().match(/^([a-zA-Z][\w-]*)\.label(?:\s|$)/)?.[1] ?? "node";
  const indentWidth = indentationWidth(lines[labelIndex] ?? "");
  let start = labelIndex;
  while (start > 0 && indentationWidth(lines[start - 1]) >= indentWidth) start -= 1;
  let end = labelIndex + 1;
  while (end < lines.length && indentationWidth(lines[end]) >= indentWidth) end += 1;
  const pattern = new RegExp("^" + escapeRegExp(indentation) + "[a-zA-Z][\\w-]*\\." + escapeRegExp(prefix) + "(?:\\s|$)");
  const existing = lines.findIndex((line, index) => index >= start && index < end && pattern.test(line));
  const field = indentation + tag + "." + prefix + " " + offsetTuple(x, y);
  if (existing >= 0) lines[existing] = field;
  else lines.splice(labelIndex, 0, field);
  return lines.join("\n");
}

function setChildOffsetField(value, declarationLineNumber, fieldName, x, y) {
  const lines = value.split("\n");
  const declarationIndex = declarationLineNumber - 1;
  const declarationIndent = indentationWidth(lines[declarationIndex] ?? "");
  const indentation = (lines[declarationIndex]?.match(/^\s*/)?.[0] ?? "") + "  ";
  let end = declarationIndex + 1;
  while (end < lines.length && indentationWidth(lines[end]) > declarationIndent) end += 1;
  const pattern = new RegExp("^" + escapeRegExp(indentation) + escapeRegExp(fieldName) + "(?:\\s|$)");
  const existing = lines.findIndex((line, index) => index > declarationIndex && index < end && pattern.test(line));
  const field = indentation + fieldName + " " + offsetTuple(x, y);
  if (existing >= 0) lines[existing] = field;
  else lines.splice(declarationIndex + 1, 0, field);
  return lines.join("\n");
}

export function setStructuralOffsetField(value, declarationLineNumber, x, y) {
  const lines = value.split("\n");
  const declarationIndex = declarationLineNumber - 1;
  const parentIndent = indentationWidth(lines[declarationIndex] ?? "");
  const childWhitespace = (lines[declarationIndex]?.match(/^\s*/)?.[0] ?? "") + "  ";
  let end = declarationIndex + 1;
  while (end < lines.length && indentationWidth(lines[end]) > parentIndent) end += 1;
  const compactField = childWhitespace + ".line.label-offset " + offsetTuple(x, y);
  const compactExisting = lines.findIndex((line, index) => index > declarationIndex && index < end
    && indentationWidth(line) === parentIndent + 2 && line.trim().match(/^\.line\.label-offset(?:\s|$)/));
  if (compactExisting >= 0) {
    lines[compactExisting] = compactField;
    return lines.join("\n");
  }
  let lineIndex = lines.findIndex((line, index) => index > declarationIndex && index < end
    && indentationWidth(line) === parentIndent + 2 && line.trim() === ".line");
  if (lineIndex < 0) {
    lineIndex = lines.findIndex((line, index) => {
      if (index <= declarationIndex || index >= end || indentationWidth(line) !== parentIndent + 2 || !/^\.[\w-]+$/.test(line.trim())) return false;
      let groupEnd = index + 1;
      while (groupEnd < end && indentationWidth(lines[groupEnd]) > parentIndent + 2) groupEnd += 1;
      return lines.some((candidate, candidateIndex) => candidateIndex > index && candidateIndex < groupEnd
        && indentationWidth(candidate) === parentIndent + 4 && /^\.label(?:\s|$)/.test(candidate.trim()));
    });
  }
  if (lineIndex < 0) {
    lines.splice(declarationIndex + 1, 0, childWhitespace + ".line", childWhitespace + "  .label-offset " + offsetTuple(x, y));
    return lines.join("\n");
  }
  let lineEnd = lineIndex + 1;
  while (lineEnd < lines.length && indentationWidth(lines[lineEnd]) > parentIndent + 2) lineEnd += 1;
  const fieldWhitespace = childWhitespace + "  ";
  const existing = lines.findIndex((line, index) => index > lineIndex && index < lineEnd
    && indentationWidth(line) === parentIndent + 4 && line.trim().match(/^\.label-offset(?:\s|$)/));
  const field = fieldWhitespace + ".label-offset " + offsetTuple(x, y);
  if (existing >= 0) lines[existing] = field;
  else lines.splice(lineIndex + 1, 0, field);
  return lines.join("\n");
}

export function setStructuralField(value, declarationLineNumber, field, fieldValue) {
  const lines = value.split("\n");
  const index = declarationLineNumber - 1;
  const indent = indentationWidth(lines[index] ?? "");
  const whitespace = (lines[index]?.match(/^\s*/)?.[0] ?? "") + "  ";
  let end = index + 1;
  while (end < lines.length && indentationWidth(lines[end]) > indent) end += 1;
  const pattern = new RegExp("^" + escapeRegExp(whitespace) + "\\." + escapeRegExp(field) + "(?:\\s|$)");
  const existing = lines.findIndex((line, candidate) => candidate > index && candidate < end && pattern.test(line));
  const replacement = whitespace + "." + field + " " + fieldValue;
  if (existing >= 0) lines[existing] = replacement;
  else lines.splice(index + 1, 0, replacement);
  return lines.join("\n");
}

function setReusableLine(value, start, end, fieldIndent, type, knownTypes) {
  const lines = value.split("\n");
  const names = new Set(knownTypes);
  const existing = lines.findIndex((line, index) => index > start && index < end
    && indentationWidth(line) === indentationWidth(fieldIndent)
    && names.has(line.trim().slice(1))
    && /^\.[a-zA-Z][\w-]*$/.test(line.trim()));
  const replacement = fieldIndent + "." + type;
  if (existing >= 0) lines[existing] = replacement;
  else lines.splice(start + 1, 0, replacement);
  const baseIndent = indentationWidth(fieldIndent);
  const appearance = new Set(["color", "width", "stroke-style", "arrow-style", "label-position"]);
  for (let index = lines.length - 1; index > start; index -= 1) {
    if (index >= end + (existing < 0 ? 1 : 0)) continue;
    const indent = indentationWidth(lines[index]);
    const text = lines[index].trim();
    if (indent === baseIndent && /^\.line\.(color|width|stroke-style|arrow-style|label-position)(?:\s|$)/.test(text)) {
      lines.splice(index, 1);
      continue;
    }
    if (indent === baseIndent + 2 && appearance.has(text.match(/^\.([\w-]+)/)?.[1])) {
      let parent = index - 1;
      while (parent > start && indentationWidth(lines[parent]) >= indent) parent -= 1;
      const parentName = lines[parent]?.trim().slice(1);
      if (lines[parent]?.trim() === ".line" || names.has(parentName) || parentName === type) lines.splice(index, 1);
    }
  }
  for (let index = lines.length - 1; index > start; index -= 1) {
    if (indentationWidth(lines[index]) === baseIndent && lines[index].trim() === ".line") {
      const next = lines[index + 1];
      if (!next || indentationWidth(next) <= baseIndent) lines.splice(index, 1);
    }
  }
  return lines.join("\n");
}

export function setStructuralLineType(value, declarationLineNumber, type, knownTypes) {
  const lines = value.split("\n");
  const start = declarationLineNumber - 1;
  const indent = indentationWidth(lines[start] ?? "");
  let end = start + 1;
  while (end < lines.length && indentationWidth(lines[end]) > indent) end += 1;
  const fieldIndent = (lines[start]?.match(/^\s*/)?.[0] ?? "") + "  ";
  return setReusableLine(value, start, end, fieldIndent, type, knownTypes);
}

export function setAnnotationOffsetField(value, declarationLineNumber, x, y) {
  return setChildOffsetField(value, declarationLineNumber, ".offset", x, y);
}

function nodeRange(lines, labelLineNumber) {
  const labelIndex = labelLineNumber - 1;
  const propertyIndent = indentationWidth(lines[labelIndex] ?? "");
  let start = labelIndex - 1;
  while (start >= 0 && indentationWidth(lines[start]) >= propertyIndent) start -= 1;
  if (start < 0) start = labelIndex;
  const indent = indentationWidth(lines[start]);
  let end = start + 1;
  while (end < lines.length && indentationWidth(lines[end]) > indent) end += 1;
  return { start, end, fieldIndent: (lines[start].match(/^\s*/)?.[0] ?? "") + "  " };
}

export function setNodeField(value, labelLineNumber, field, fieldValue) {
  const lines = value.split("\n");
  const range = nodeRange(lines, labelLineNumber);
  const pattern = new RegExp("^" + escapeRegExp(range.fieldIndent) + "\\." + escapeRegExp(field) + "(?:\\s|$)");
  const existing = lines.findIndex((line, index) => index > range.start && index < range.end && pattern.test(line));
  const replacement = range.fieldIndent + "." + field + (fieldValue === "" ? "" : " " + fieldValue);
  if (existing >= 0) {
    let removeTo = existing + 1;
    while (removeTo < lines.length && indentationWidth(lines[removeTo]) > indentationWidth(lines[existing])) removeTo += 1;
    lines.splice(existing, removeTo - existing, replacement);
  } else lines.splice(range.start + 1, 0, replacement);
  return lines.join("\n");
}

export function setNodeImageGeometry(value, labelLineNumber, width, height, offsetX, offsetY) {
  const lines = value.split("\n");
  const range = nodeRange(lines, labelLineNumber);
  const values = new Map([
    ["image-width", offsetNumber(width)],
    ["image-height", offsetNumber(height)],
    ["image-offset", offsetTuple(offsetX, offsetY)],
  ]);
  for (let index = range.end - 1; index > range.start; index -= 1) {
    if (indentationWidth(lines[index]) !== indentationWidth(range.fieldIndent)) continue;
    const field = lines[index].trim().match(/^\.([\w-]+)(?:\s|$)/)?.[1];
    if (!values.has(field)) continue;
    lines[index] = `${range.fieldIndent}.${field} ${values.get(field)}`;
    values.delete(field);
  }
  lines.splice(range.start + 1, 0, ...[...values].map(([field, fieldValue]) => `${range.fieldIndent}.${field} ${fieldValue}`));
  return lines.join("\n");
}

export function setNodeLineType(value, labelLineNumber, type, knownTypes) {
  const lines = value.split("\n");
  const range = nodeRange(lines, labelLineNumber);
  return setReusableLine(value, range.start, range.end, range.fieldIndent, type, knownTypes);
}

export function removeNodeField(value, labelLineNumber, field) {
  const lines = value.split("\n");
  const range = nodeRange(lines, labelLineNumber);
  const pattern = new RegExp("^" + escapeRegExp(range.fieldIndent) + "\\." + escapeRegExp(field) + "(?:\\s|$)");
  const existing = lines.findIndex((line, index) => index > range.start && index < range.end && pattern.test(line));
  if (existing >= 0) lines.splice(existing, 1);
  return lines.join("\n");
}

export function setNodeType(value, labelLineNumber, type) {
  const lines = value.split("\n");
  const range = nodeRange(lines, labelLineNumber);
  const indentation = lines[range.start].match(/^\s*/)?.[0] ?? "";
  lines[range.start] = indentation + "." + type.replace(/^\./, "");
  const styleFields = new Set([
    "shape", "fill", "color", "outline", "outline-style", "outline-width", "width", "height", "align",
    "shadow-color", "shadow-offset-x", "shadow-offset-y", "shadow-blur", "shadow-opacity",
    "image", "image-width", "image-height", "image-fit", "image-opacity",
  ]);
  for (let index = range.end - 1; index > range.start; index -= 1) {
    if (indentationWidth(lines[index]) !== indentationWidth(range.fieldIndent)) continue;
    const field = lines[index].trim().match(/^\.([\w-]+)(?:\s|$)/)?.[1];
    if (!styleFields.has(field)) continue;
    let removeTo = index + 1;
    while (removeTo < lines.length && indentationWidth(lines[removeTo]) > indentationWidth(lines[index])) removeTo += 1;
    lines.splice(index, removeTo - index);
  }
  return lines.join("\n");
}
