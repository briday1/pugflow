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

export function indentSourceSelection(value, selectionStart, selectionEnd, outdent = false) {
  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const lastCharacter = selectionEnd > selectionStart && value[selectionEnd - 1] === "\n" ? selectionEnd - 1 : selectionEnd;
  const newline = value.indexOf("\n", lastCharacter);
  const lineEnd = newline < 0 ? value.length : newline;
  const original = value.slice(lineStart, lineEnd);
  const lines = original.split("\n");
  const transformed = lines.map((line) => outdent ? line.replace(/^(?:  |\t)/, "") : `  ${line}`).join("\n");
  const nextValue = value.slice(0, lineStart) + transformed + value.slice(lineEnd);
  if (selectionStart === selectionEnd) {
    const firstDelta = transformed.split("\n")[0].length - lines[0].length;
    const caret = Math.max(lineStart, selectionStart + firstDelta);
    return { value: nextValue, start: caret, end: caret };
  }
  return { value: nextValue, start: lineStart, end: lineStart + transformed.length };
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
  while (end < lines.length && (!lines[end].trim() || indentationWidth(lines[end]) > declarationIndent)) end += 1;
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
  while (end < lines.length && (!lines[end].trim() || indentationWidth(lines[end]) > indent)) end += 1;
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
  while (end < lines.length && (!lines[end].trim() || indentationWidth(lines[end]) > indent)) end += 1;
  const fieldIndent = (lines[start]?.match(/^\s*/)?.[0] ?? "") + "  ";
  return setReusableLine(value, start, end, fieldIndent, type, knownTypes);
}

export function setAnnotationOffsetField(value, declarationLineNumber, x, y) {
  return setChildOffsetField(value, declarationLineNumber, ".offset", x, y);
}

export function setDeclarationOffsetField(value, declarationLineNumber, x, y) {
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
  while (end < lines.length && (!lines[end].trim() || indentationWidth(lines[end]) > indent)) end += 1;
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

function nodeDeclaration(type, indentation, id, label) {
  const nodeType = `.${type.replace(/^\./, "")}`;
  return [
    `${indentation}${nodeType}`,
    ...(id ? [`${indentation}  .id ${id}`] : []),
    `${indentation}  .label${label ? ` ${label}` : ""}`,
  ];
}

export function ensureGraphComponents(value) {
  const lines = value.split("\n");
  const rootIndex = lines.findIndex((line) => /^#(?:canvas|diagram)(?:\(|$)/.test(line.trim()));
  if (rootIndex < 0) return value;
  const rootIndent = indentationWidth(lines[rootIndex]);
  let end = rootIndex + 1;
  while (end < lines.length && (!lines[end].trim() || indentationWidth(lines[end]) > rootIndent)) end += 1;
  const childWidth = rootIndent + 2;
  if (lines.some((line, index) => index > rootIndex && index < end && indentationWidth(line) === childWidth && line.trim() === "graph")) return value;
  const settings = new Set([".background", ".font", ".annotation", ".defaults"]);
  const firstGraphChild = lines.findIndex((line, index) => index > rootIndex && index < end
    && indentationWidth(line) === childWidth && !settings.has(line.trim().split(/\s/)[0]));
  if (firstGraphChild < 0) return value;
  const indentation = (lines[rootIndex].match(/^\s*/)?.[0] ?? "") + "  ";
  const graphBlock = lines.slice(firstGraphChild, end).map((line) => "  " + line);
  lines.splice(firstGraphChild, end - firstGraphChild, `${indentation}graph`, ...graphBlock);
  return lines.join("\n");
}

export function appendFlowNode(value, parentLabelLineNumber, { direction = "right", ports = "shared", nodeType = "node", lineType = "", id = "", label = "" } = {}) {
  const lines = value.split("\n");
  const range = nodeRange(lines, parentLabelLineNumber);
  const indentation = range.fieldIndent;
  const childIndent = indentation + "  ";
  const insertion = [
    `${indentation}.flow`,
    `${childIndent}.direction ${direction}`,
    `${childIndent}.ports ${ports}`,
    ...(lineType ? [`${childIndent}.${lineType.replace(/^\./, "")}`] : []),
    ...nodeDeclaration(nodeType, childIndent, id, label),
  ];
  lines.splice(range.end, 0, ...insertion);
  return lines.join("\n");
}

export function appendDiagramNode(value, { nodeType = "node", id = "", label = "", diagramId = "", diagramLabel = "", diagramFill = "", diagramOutline = "", parentGraphLineNumber = null } = {}) {
  let lines = ensureGraphComponents(value).split("\n");
  const rootIndex = parentGraphLineNumber ? parentGraphLineNumber - 1 : lines.findIndex((line) => /^#(?:canvas|diagram)(?:\(|$)/.test(line.trim()));
  if (rootIndex < 0) return value;
  const rootIndent = indentationWidth(lines[rootIndex]);
  let end = rootIndex + 1;
  while (end < lines.length && (!lines[end].trim() || indentationWidth(lines[end]) > rootIndent)) end += 1;
  const indentation = (lines[rootIndex].match(/^\s*/)?.[0] ?? "") + "  ";
  const fieldIndent = indentation + "  ";
  const childWidth = rootIndent + 2;
  const alreadyComponentized = lines.some((line, index) => index > rootIndex && index < end
    && indentationWidth(line) === childWidth && line.trim() === "graph");
  if (!parentGraphLineNumber && !alreadyComponentized) {
    const settings = new Set([".background", ".font", ".annotation", ".defaults"]);
    const firstGraphChild = lines.findIndex((line, index) => index > rootIndex && index < end
      && indentationWidth(line) === childWidth && !settings.has(line.trim().split(/\s/)[0]));
    if (firstGraphChild >= 0) {
      const graphBlock = lines.slice(firstGraphChild, end).map((line) => "  " + line);
      lines.splice(firstGraphChild, end - firstGraphChild, `${indentation}graph`, ...graphBlock);
      end = firstGraphChild + graphBlock.length + 1;
    }
  }
  lines.splice(end, 0, `${indentation}graph`,
    ...(diagramId ? [`${fieldIndent}.id ${diagramId}`] : []),
    ...(diagramLabel ? [`${fieldIndent}.label ${diagramLabel}`] : []),
    ...(diagramFill ? [`${fieldIndent}.fill ${diagramFill}`] : []),
    ...(diagramOutline ? [`${fieldIndent}.outline ${diagramOutline}`] : []),
    ...nodeDeclaration(nodeType, fieldIndent, id, label));
  return lines.join("\n");
}

export function appendMergeNode(value, rootLabelLineNumber, { sources = [], direction = "right", ports = "shared", nodeType = "node", lineType = "", id = "", label = "" } = {}) {
  const lines = value.split("\n");
  const range = nodeRange(lines, rootLabelLineNumber);
  const indentation = range.fieldIndent;
  const childIndent = indentation + "  ";
  const sourceIndent = childIndent + "  ";
  const insertion = [
    `${indentation}.merge`,
    `${childIndent}.direction ${direction}`,
    `${childIndent}.ports ${ports}`,
    ...sources.flatMap((source) => [`${childIndent}.source`, `${sourceIndent}.ref ${source}`]),
    ...(lineType ? [`${childIndent}.${lineType.replace(/^\./, "")}`] : []),
    ...nodeDeclaration(nodeType, childIndent, id, label),
  ];
  lines.splice(range.end, 0, ...insertion);
  return lines.join("\n");
}

export function removeDeclaration(value, declarationLineNumber) {
  const lines = value.split("\n");
  const start = declarationLineNumber - 1;
  const indent = indentationWidth(lines[start] ?? "");
  let end = start + 1;
  while (end < lines.length && (!lines[end].trim() || indentationWidth(lines[end]) > indent)) end += 1;
  lines.splice(start, end - start);
  return lines.join("\n");
}

export function removeDeclarationField(value, declarationLineNumber, field) {
  const lines = value.split("\n");
  const start = declarationLineNumber - 1;
  const indent = indentationWidth(lines[start] ?? "");
  let end = start + 1;
  while (end < lines.length && (!lines[end].trim() || indentationWidth(lines[end]) > indent)) end += 1;
  const fieldIndent = indent + 2;
  const pattern = new RegExp(`^\\.${escapeRegExp(field)}(?:\\s|$)`);
  for (let index = end - 1; index > start; index -= 1) {
    if (indentationWidth(lines[index]) === fieldIndent && pattern.test(lines[index].trim())) lines.splice(index, 1);
  }
  return lines.join("\n");
}

export function removeNodeDeclaration(value, labelLineNumber) {
  const lines = value.split("\n");
  const range = nodeRange(lines, labelLineNumber);
  lines.splice(range.start, range.end - range.start);
  return lines.join("\n");
}

export function removeNodeFields(value, labelLineNumber, fields) {
  const lines = value.split("\n");
  const range = nodeRange(lines, labelLineNumber);
  const names = new Set(fields);
  for (let index = range.end - 1; index > range.start; index -= 1) {
    if (indentationWidth(lines[index]) !== indentationWidth(range.fieldIndent)) continue;
    const field = lines[index].trim().match(/^\.([\w-]+)(?:\s|$)/)?.[1];
    if (names.has(field)) lines.splice(index, 1);
  }
  return lines.join("\n");
}

export function removeConnectionLabel(value, declarationLineNumber) {
  const lines = value.split("\n");
  let start = declarationLineNumber - 1;
  let end;
  if (/^\.label(?:\s|$)/.test(lines[start]?.trim() ?? "")) {
    const range = nodeRange(lines, declarationLineNumber);
    start = range.start;
    end = range.end;
  } else {
    const base = indentationWidth(lines[start] ?? "");
    end = start + 1;
    while (end < lines.length && (!lines[end].trim() || indentationWidth(lines[end]) > base)) end += 1;
  }
  const baseIndent = indentationWidth(lines[start] ?? "");
  for (let index = end - 1; index > start; index -= 1) {
    const text = lines[index].trim();
    if (/^\.line\.label(?:\s|$)/.test(text) || (indentationWidth(lines[index]) === baseIndent + 4 && /^\.label(?:\s|$)/.test(text))) lines.splice(index, 1);
  }
  return lines.join("\n");
}

export function removeAncestorDeclaration(value, lineNumber, type) {
  const lines = value.split("\n");
  let index = lineNumber - 1;
  const initialIndent = indentationWidth(lines[index] ?? "");
  while (index >= 0) {
    if (lines[index].trim() === `.${type}` && indentationWidth(lines[index]) < initialIndent) return removeDeclaration(value, index + 1);
    index -= 1;
  }
  return value;
}

export function removeNodeReferences(value, id) {
  let result = value;
  const escapedId = escapeRegExp(id);
  while (true) {
    const lines = result.split("\n");
    const refIndex = lines.findIndex((line) => new RegExp(`^\\s*\\.ref\\s+${escapedId}\\s*$`).test(line));
    if (refIndex < 0) break;
    let sourceIndex = refIndex - 1;
    while (sourceIndex >= 0 && !(lines[sourceIndex].trim() === ".source" && indentationWidth(lines[sourceIndex]) < indentationWidth(lines[refIndex]))) sourceIndex -= 1;
    let mergeIndex = sourceIndex - 1;
    while (mergeIndex >= 0 && !(lines[mergeIndex].trim() === ".merge" && indentationWidth(lines[mergeIndex]) < indentationWidth(lines[sourceIndex]))) mergeIndex -= 1;
    if (sourceIndex < 0 || mergeIndex < 0) break;
    const mergeIndent = indentationWidth(lines[mergeIndex]);
    let mergeEnd = mergeIndex + 1;
    while (mergeEnd < lines.length && (!lines[mergeEnd].trim() || indentationWidth(lines[mergeEnd]) > mergeIndent)) mergeEnd += 1;
    const sourceCount = lines.slice(mergeIndex + 1, mergeEnd).filter((line) => indentationWidth(line) === mergeIndent + 2 && line.trim() === ".source").length;
    if (sourceCount > 2) result = removeDeclaration(result, sourceIndex + 1);
    else {
      const targetLabel = lines.findIndex((line, index) => index > mergeIndex && index < mergeEnd && indentationWidth(line) === mergeIndent + 4 && /^\.label(?:\s|$)/.test(line.trim()));
      if (targetLabel >= 0) result = moveNodeToDiagram(result, targetLabel + 1);
      result = removeDeclaration(result, mergeIndex + 1);
    }
  }
  while (true) {
    const lines = result.split("\n");
    const endpoint = lines.findIndex((line) => new RegExp(`^\\s*\\.(?:from|to)\\s+${escapedId}\\s*$`).test(line));
    if (endpoint < 0) break;
    let connect = endpoint - 1;
    while (connect >= 0 && !(lines[connect].trim() === ".connect" && indentationWidth(lines[connect]) < indentationWidth(lines[endpoint]))) connect -= 1;
    if (connect < 0) break;
    result = removeDeclaration(result, connect + 1);
  }
  return result;
}

export function removeMergeEdge(value, sourceLineNumber) {
  const lines = value.split("\n");
  const sourceIndex = sourceLineNumber - 1;
  let mergeIndex = sourceIndex - 1;
  while (mergeIndex >= 0 && !(lines[mergeIndex].trim() === ".merge" && indentationWidth(lines[mergeIndex]) < indentationWidth(lines[sourceIndex]))) mergeIndex -= 1;
  if (mergeIndex < 0) return value;
  const mergeIndent = indentationWidth(lines[mergeIndex]);
  let mergeEnd = mergeIndex + 1;
  while (mergeEnd < lines.length && (!lines[mergeEnd].trim() || indentationWidth(lines[mergeEnd]) > mergeIndent)) mergeEnd += 1;
  const sources = lines.map((line, index) => ({ line, index })).filter(({ line, index }) => index > mergeIndex && index < mergeEnd && indentationWidth(line) === mergeIndent + 2 && line.trim() === ".source");
  if (sources.length > 2) return removeDeclaration(value, sourceLineNumber);
  const targetLabel = lines.findIndex((line, index) => index > mergeIndex && index < mergeEnd && indentationWidth(line) === mergeIndent + 4 && /^\.label(?:\s|$)/.test(line.trim()));
  let result = targetLabel >= 0 ? moveNodeToDiagram(value, targetLabel + 1) : value;
  return removeDeclaration(result, mergeIndex + 1);
}

export function moveNodeToDiagram(value, labelLineNumber) {
  let lines = value.split("\n");
  const node = nodeRange(lines, labelLineNumber);
  const originalIndent = lines[node.start].match(/^\s*/)?.[0] ?? "";
  const block = lines.slice(node.start, node.end);
  lines.splice(node.start, node.end - node.start);
  const rootIndex = lines.findIndex((line) => /^#(?:canvas|diagram)(?:\(|$)/.test(line.trim()));
  const rootIndent = indentationWidth(lines[rootIndex] ?? "");
  let end = rootIndex + 1;
  while (end < lines.length && (!lines[end].trim() || indentationWidth(lines[end]) > rootIndent)) end += 1;
  const diagramIndent = (lines[rootIndex]?.match(/^\s*/)?.[0] ?? "") + "  ";
  const targetIndent = diagramIndent + "  ";
  const moved = block.map((line) => targetIndent + line.slice(originalIndent.length));
  lines.splice(end, 0, `${diagramIndent}graph`, ...moved);
  return lines.join("\n");
}
