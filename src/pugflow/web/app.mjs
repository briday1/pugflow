import { createBlockDiagram, parseDiagram } from "./pugflow.mjs";
import { removeNodeField, setAnnotationOffsetField, setNodeField, setNodeLineType, setNodeOffsetField, setNodeType, setStructuralField, setStructuralLineType, setStructuralOffsetField } from "./editor-source.mjs";
import { attachVimMode } from "./vim-mode.mjs";
import { attachTextEditor } from "./text-editor.mjs";
import { arrangeNodeOffsets, cleanupAlignmentOffsets } from "./layout.mjs";
import { pugDefinitionsToStyleSheet } from "./style-sheet.mjs";

const EXAMPLE_DOCUMENT = `// Full feature tour — edit anything and watch the preview update
@node primary_node
  .shape pill
  .fill #245886
  .color #ffffff
  .width 220

@node rounded_node
  .shape rounded
  .fill #1e4f7a
  .color #ffffff

@node diamond_node
  .shape diamond
  .height 76
  .fill #254f73
  .color #ffffff

@node round_node
  .shape round
  .outline #fca5a5

@node path_node
  .shape rounded
  .fill #1e4f7a
  .color #ffffff
  .width 190
  .align left

@node square_node
  .shape square
  .outline #a7f3d0
  .outline-style dotted
  .outline-width 3

@node output_node
  .shape pill
  .color #ffd166

@node merge_node
  .shape hexagon
  .fill #4b5563
  .color #ffffff
  .outline #ffd166
  .width 220

@line warning_line
  .color #fca5a5
  .stroke-style dashed
  .arrow-style both

@line success_line
  .color #059669

@line backward_line
  .color #dc2626
  .arrow-style backward

@line feedback_line
  .color #dc2626
  .stroke-style dashed

@line quiet_line
  .stroke-style dotted
  .arrow-style none
  .label-position below

@line dotted_line
  .stroke-style dotted

@line output_line
  .color #d97706

@annotation blue_note
  .color #bfdbfe

@annotation warning_note
  .color #f59e0b

#diagram
  .background #ffffff
  .defaults
    .node
      .color #111827
    .line
      .color #111827
    .annotation
      .color #475569
  .primary_node
    .id root
    .label
      | Root $x^2 + y_1$
      | Reusable styles and multiline labels
    .annotation
      .above
        .offset (114.1, 0)
        .blue_note
        | Block and connection annotations
      .below Auto width, fixed width, and math
        .offset (120, 22.2)
    .flow
      .direction right
      .path_node
        .success_line
        .id path-a
        .label
          | Path A
          | Forced line break
        .rounded_node
          .line
            .label solid
          .id one
          .offset (40.7, 0)
          .label Rounded block
        .square_node
          .warning_line
            .label both directions
            .label-position below
          .id two
          .offset (8.9, -55.6)
          .label Square block
          .annotation
            .above Annotation above
            .below Annotation below

    .flow
      .direction down
      .diamond_node
        .backward_line
        .id path-b
        .label Diamond $\\alpha$
        .flow
          .direction right
          .ports shared
          .dotted_line
          .round_node
            .id three
            .offset (-363.1, -110.5)
            .label Round $\\sqrt{x}$
        .flow
          .direction down
          .ports distributed
          .dotted_line
          .node
            .quiet_line
              .label no arrow
            .offset (356.2, 45.2)
            .label Automatic wrapping makes a block taller when its label becomes long

    .flow
      .direction up
      .output_node
        .quiet_line
        .id styled-text
        .label Styled text

    .merge
      .direction right
      .ports shared
      .source
        .ref one
        .line
          .label $x_1$
          .label-position below
      .source
        .ref two
        .line
          .label $x_2$
          .stroke-style dashed
      .source
        .ref three
        .line
          .label $x_3$
          .color #fde68a
      .merge_node
        .id combined
        .label Combined $\\frac{a}{b}$
        .annotation
          .above
            .warning_note
            | Rounded paths converge
          .below Merge target
        .flow
          .direction right
          .output_node
            .output_line
            .offset (-85.9, 0)
            .label Final output
          .node
            .id archived
            .offset (-177.8, 0)
            .label Archived

    .connect
      .from archived
      .from-direction up
      .to styled-text
      .to-direction left
      .ports shared
      .feedback_line
        .label feedback
`;
const EXAMPLE_DIAGRAM_START = EXAMPLE_DOCUMENT.indexOf("#diagram");
const EXAMPLE = `// Full feature tour — edit anything and watch the preview update\n${EXAMPLE_DOCUMENT.slice(EXAMPLE_DIAGRAM_START)}`;
const EXAMPLE_STYLES = pugDefinitionsToStyleSheet(EXAMPLE_DOCUMENT.slice(0, EXAMPLE_DIAGRAM_START));

const source = attachTextEditor(document.querySelector("#source"));
const editorShell = document.querySelector(".editor-shell");
const lineNumbers = document.querySelector("#line-numbers");
const colorDecorators = document.querySelector("#color-decorators");
const currentLine = document.querySelector("#current-line");
const vimBlockCursor = document.querySelector("#vim-block-cursor");
const completionMenu = document.querySelector("#completion-menu");
const canvas = document.querySelector("#diagram");
const inspector = document.querySelector("#canvas-inspector");
const inspectorContent = document.querySelector("#inspector-content");
const status = document.querySelector("#status");
const scale = document.querySelector("#scale");
const sourceFile = document.querySelector("#source-file");
const nodeImageFile = document.querySelector("#node-image-file");
const themeSelect = document.querySelector("#theme");
const main = document.querySelector("main");
const sourcePanel = document.querySelector("#source-panel");
const panelResizer = document.querySelector("#panel-resizer");
const vimToggle = document.querySelector("#vim-mode");
const vimStatus = document.querySelector("#vim-status");
const PANEL_WIDTH_KEY = "pugflow-panel-width-v1";
const THEME_KEY = "pugflow-theme-v1";
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
let diagram;
let currentGraph;
let selections = [];
let canvasUndo = [];
let canvasRedo = [];
let activeDocument = "pug";
let pugSource = EXAMPLE;
let cssSource = EXAMPLE_STYLES;

function storeActiveDocument() {
  if (activeDocument === "pug") pugSource = source.value;
  else cssSource = source.value;
}

function activateDocument(kind) {
  if (kind === activeDocument) return;
  storeActiveDocument();
  activeDocument = kind;
  source.value = kind === "pug" ? pugSource : cssSource;
  sourceFile.accept = kind === "pug" ? ".pug,text/plain" : ".css,text/css,text/plain";
  document.querySelector("#load-source").textContent = kind === "pug" ? "Load Pug" : "Load CSS";
  document.querySelector("#save-source").textContent = kind === "pug" ? "Save Pug" : "Save CSS";
  document.querySelectorAll("[data-source-tab]").forEach((tab) => {
    const selected = tab.dataset.sourceTab === kind;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  highlightSource();
  syncHighlightScroll();
  update();
}

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])); }
function colorControl(label, field, value, scope = "node") {
  const hex = /^#[0-9a-f]{6}$/i.test(value ?? "") ? value : "#000000";
  return `<label>${label}<span class="inspector-color"><input type="color" data-color-picker="${scope}:${field}" value="${hex}"><input data-${scope}-field="${field}" data-color-text="${scope}:${field}" value="${escapeHtml(value ?? "")}" placeholder="CSS color"></span></label>`;
}

function imageControls(node = null) {
  const style = node?.style;
  const enabled = Boolean(style?.image);
  const option = (value) => `<option${style?.imageFit === value ? " selected" : ""}>${value}</option>`;
  return `<details${enabled ? " open" : ""}><summary>Image</summary><label class="inspector-switch"><span>Enabled</span><input type="checkbox" data-image-toggle${enabled ? " checked" : ""}></label><div class="inspector-file-row"><label>Source<input data-node-field="image" value="${escapeHtml(style?.image ?? "")}" placeholder="image.png or https://…"></label><button type="button" data-choose-image>Choose file…</button></div><div class="inspector-grid"><label>Width<input data-node-field="image-width" type="number" min="1" value="${style?.imageWidth ?? 64}"></label><label>Height<input data-node-field="image-height" type="number" min="1" value="${style?.imageHeight ?? 64}"></label><label>Fit<select data-node-field="image-fit">${["contain", "cover", "fill"].map(option).join("")}</select></label><label>Opacity<input data-node-field="image-opacity" type="number" min="0" max="1" step="0.05" value="${style?.imageOpacity ?? 1}"></label></div>${node ? `<label>Image offset<input value="(${node.imageOffsetX}, ${node.imageOffsetY})" readonly></label><button data-remove-field="image-offset">Remove image offset</button>` : ""}</details>`;
}

function tidyInspectorSections() {
  inspectorContent.querySelectorAll("[data-shadow-toggle]").forEach((toggle) => {
    const details = toggle.closest("details");
    const label = toggle.closest("label");
    const summary = details?.querySelector(":scope > summary");
    if (!details || !label || !summary) return;
    summary.textContent = "Shadow";
    label.className = "inspector-switch";
    label.replaceChildren(Object.assign(document.createElement("span"), { textContent: "Enabled" }), toggle);
    summary.insertAdjacentElement("afterend", label);
  });
}

function paintSelections() {
  const selectedKeys = new Set(selections.map((selection) => selection.selectionKey));
  canvas.querySelectorAll("[data-selection-key]").forEach((element) => {
    element.classList.toggle("selected-element", selectedKeys.has(element.dataset.selectionKey));
  });
}

function selectedNodes() {
  const selectedIds = new Set(selections.filter((item) => item.kind === "node").map((item) => item.id));
  return diagram?.layout?.nodes.filter((node) => selectedIds.has(node.id)) ?? [];
}

function renderInspector() {
  if (!selections.length) { inspector.hidden = true; return; }
  inspector.hidden = false;
  const nodes = selectedNodes();
  if (nodes.length === selections.length) {
    const custom = [...`${pugSource}\n${cssSource}`.matchAll(/^@node\s+([\w-]+)/gm)].map((match) => match[1]);
    if (nodes.length > 1) {
      inspectorContent.innerHTML = `<h3>${nodes.length} nodes selected</h3><label>Type<select data-node-type><option value="">Choose…</option><option value="node">node</option>${custom.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}</select></label><details><summary>Appearance</summary><label>Shape<select data-node-field="shape"><option value="">Choose…</option>${["square","rounded","round","pill","diamond","hexagon"].map((shape) => `<option>${shape}</option>`).join("")}</select></label>${colorControl("Fill", "fill", "")}${colorControl("Text", "color", "")}${colorControl("Border", "outline", "")}<label>Border style<select data-node-field="outline-style"><option value="">Choose…</option><option>solid</option><option>dashed</option><option>dotted</option></select></label><label>Border width<input data-node-field="outline-width" type="number" min="0"></label></details><details><summary><label class="shadow-toggle"><input type="checkbox" data-shadow-toggle> Shadow</label></summary>${colorControl("Color", "shadow-color", "#000000")}<label>X offset<input data-node-field="shadow-offset-x" type="number" value="4"></label><label>Y offset<input data-node-field="shadow-offset-y" type="number" value="5"></label><label>Blur<input data-node-field="shadow-blur" type="number" min="0" value="6"></label><label>Opacity<input data-node-field="shadow-opacity" type="number" min="0" max="1" step="0.05" value="0.3"></label></details><label>Align / distribute<select data-arrange-select><option value="">Choose…</option><option value="left">Align left</option><option value="center">Align center</option><option value="right">Align right</option><option value="top">Align top</option><option value="middle">Align middle</option><option value="bottom">Align bottom</option><option value="horizontal">Distribute horizontally</option><option value="vertical">Distribute vertically</option></select></label><button data-arrange="remove-offsets">Remove offsets</button>`;
      inspectorContent.querySelector("details")?.insertAdjacentHTML("afterend", imageControls());
      tidyInspectorSections();
      return;
    }
    const node = currentGraph.nodes.find((candidate) => candidate.id === nodes[0].id);
    inspectorContent.innerHTML = `<h3>Node</h3><label>Label<input data-node-field="label" value="${escapeHtml(node.label.replace(/\n/g, " "))}"></label><label>Type<select data-node-type><option value="node">node</option>${custom.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}</select></label><details><summary>Appearance</summary><label>Shape<select data-node-field="shape">${["square","rounded","round","pill","diamond","hexagon"].map((shape) => `<option${node.style.shape === shape ? " selected" : ""}>${shape}</option>`).join("")}</select></label>${colorControl("Fill", "fill", node.style.fill)}${colorControl("Text", "color", node.style.color)}${colorControl("Border", "outline", node.style.outline)}<label>Border style<select data-node-field="outline-style">${["solid","dashed","dotted"].map((value) => `<option${node.style.outlineStyle === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>Border width<input data-node-field="outline-width" type="number" min="0" value="${node.style.outlineWidth}"></label><label>Width<input data-node-field="width" value="${node.style.width}"></label><label>Height<input data-node-field="height" value="${node.style.height}"></label><label>Text alignment<select data-node-field="align">${["left","center","right"].map((value) => `<option${node.style.align === value ? " selected" : ""}>${value}</option>`).join("")}</select></label></details><details${node.style.shadowColor ? " open" : ""}><summary><label class="shadow-toggle"><input type="checkbox" data-shadow-toggle${node.style.shadowColor ? " checked" : ""}> Shadow</label></summary>${colorControl("Color", "shadow-color", node.style.shadowColor ?? "#000000")}<label>X offset<input data-node-field="shadow-offset-x" type="number" value="${node.style.shadowOffsetX}"></label><label>Y offset<input data-node-field="shadow-offset-y" type="number" value="${node.style.shadowOffsetY}"></label><label>Blur<input data-node-field="shadow-blur" type="number" min="0" value="${node.style.shadowBlur}"></label><label>Opacity<input data-node-field="shadow-opacity" type="number" min="0" max="1" step="0.05" value="${node.style.shadowOpacity}"></label></details><label>Offset<input value="(${node.offsetX}, ${node.offsetY})" readonly></label><button data-arrange="remove-offsets">Remove offset</button>`;
    inspectorContent.querySelector("details")?.insertAdjacentHTML("afterend", imageControls(node));
    tidyInspectorSections();
    return;
  }
  const edges = selections.filter((item) => item.kind === "line").map((item) => diagram.layout.edges.find((edge) => edge.from === item.from && edge.to === item.to));
  const edge = edges[0];
  const lineTypes = [...`${pugSource}\n${cssSource}`.matchAll(/^@line\s+([\w-]+)/gm)].map((match) => match[1]);
  const sharedType = edges.every((candidate) => candidate?.lineType === edge?.lineType) ? edge?.lineType ?? "" : "";
  inspectorContent.innerHTML = `<h3>${edges.length} connector${edges.length === 1 ? "" : "s"}</h3><label>Type<select data-line-type><option value="">Choose…</option>${lineTypes.map((name) => `<option value="${escapeHtml(name)}"${sharedType === name ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label><details open><summary>Line appearance <small>local overrides</small></summary>${colorControl("Color", "color", edge?.color, "line")}<label>Width<input data-line-field="width" type="number" min="0.5" step="0.5" value="${edge?.width ?? 2}"></label><label>Stroke<select data-line-field="stroke-style">${["solid","dashed","dotted"].map((value) => `<option${edge?.style === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>Arrow<select data-line-field="arrow-style">${["forward","backward","both","none"].map((value) => `<option${edge?.direction === value ? " selected" : ""}>${value}</option>`).join("")}</select></label></details>`;
}

function selectCanvasElement(item) {
  if (activeDocument !== "pug") activateDocument("pug");
  if (item.additive) {
    const index = selections.findIndex((selection) => selection.selectionKey === item.selectionKey);
    if (index >= 0) selections.splice(index, 1); else selections.push(item);
  } else selections = [item];
  paintSelections();
  renderInspector();
}

vimToggle.checked = new URLSearchParams(location.search).get("vim") === "1";
attachVimMode(source, vimToggle, vimStatus);

function panelLimits() {
  const mainWidth = main.getBoundingClientRect().width;
  return { minimum: 300, maximum: Math.max(300, Math.min(760, mainWidth - 360)) };
}

function setPanelWidth(width, persist = true) {
  const { minimum, maximum } = panelLimits();
  const nextWidth = Math.round(Math.min(maximum, Math.max(minimum, width)));
  main.style.setProperty("--panel-width", nextWidth + "px");
  panelResizer.setAttribute("aria-valuemin", String(minimum));
  panelResizer.setAttribute("aria-valuemax", String(maximum));
  panelResizer.setAttribute("aria-valuenow", String(nextWidth));
  if (persist) localStorage.setItem(PANEL_WIDTH_KEY, String(nextWidth));
}

const savedPanelWidth = Number(localStorage.getItem(PANEL_WIDTH_KEY));
if (Number.isFinite(savedPanelWidth) && savedPanelWidth > 0) setPanelWidth(savedPanelWidth, false);
else setPanelWidth(430, false);

let panelDrag = null;
panelResizer.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  panelDrag = { pointerId: event.pointerId, x: event.clientX, width: sourcePanel.getBoundingClientRect().width };
  document.body.classList.add("resizing-panel");
});
window.addEventListener("pointermove", (event) => {
  if (panelDrag?.pointerId === event.pointerId) setPanelWidth(panelDrag.width + event.clientX - panelDrag.x);
});
function finishPanelDrag(event) {
  if (!panelDrag || (event.pointerId !== undefined && panelDrag.pointerId !== event.pointerId)) return;
  panelDrag = null;
  document.body.classList.remove("resizing-panel");
}
window.addEventListener("pointerup", finishPanelDrag);
window.addEventListener("pointercancel", finishPanelDrag);
panelResizer.addEventListener("keydown", (event) => {
  const current = sourcePanel.getBoundingClientRect().width;
  const { minimum, maximum } = panelLimits();
  const amount = event.shiftKey ? 50 : 10;
  if (event.key === "ArrowLeft") setPanelWidth(current - amount);
  else if (event.key === "ArrowRight") setPanelWidth(current + amount);
  else if (event.key === "Home") setPanelWidth(minimum);
  else if (event.key === "End") setPanelWidth(maximum);
  else return;
  event.preventDefault();
});
panelResizer.addEventListener("dblclick", () => setPanelWidth(430));
window.addEventListener("resize", () => {
  setPanelWidth(sourcePanel.getBoundingClientRect().width, false);
});

function applyTheme(preference) {
  const resolved = preference === "system" ? (systemDark.matches ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = resolved;
  themeSelect.value = preference;
}

applyTheme(localStorage.getItem(THEME_KEY) ?? "system");
themeSelect.addEventListener("change", () => {
  localStorage.setItem(THEME_KEY, themeSelect.value);
  applyTheme(themeSelect.value);
});
systemDark.addEventListener("change", () => {
  if (themeSelect.value === "system") applyTheme("system");
});

let renderedLineCount = 0;
let lastEditorCaret = 0;

function updateEditorChrome() {
  const lineCount = source.value.split("\n").length;
  if (lineCount !== renderedLineCount) {
    renderedLineCount = lineCount;
    lineNumbers.replaceChildren(...Array.from({ length: lineCount }, (_item, index) => {
      const number = document.createElement("span");
      number.textContent = String(index + 1);
      return number;
    }));
  }
  const selection = window.getSelection();
  if (document.activeElement === source || source.contains(selection?.anchorNode)) {
    const visualMode = source.dataset.vimMode?.startsWith("visual");
    lastEditorCaret = source.selectionDirection === "backward"
      ? source.selectionStart
      : visualMode
        ? Math.max(source.selectionStart, source.selectionEnd - 1)
        : source.selectionEnd;
  }
  const line = source.value.slice(0, lastEditorCaret).split("\n").length - 1;
  lineNumbers.querySelector(".active")?.classList.remove("active");
  lineNumbers.children[line]?.classList.add("active");
  lineNumbers.style.transform = "translateY(" + -source.scrollTop + "px)";
  currentLine.style.transform = "translateY(" + (14 + line * 20 - source.scrollTop) + "px)";
  for (const swatch of colorDecorators.children) {
    const left = 52 + (Number(swatch.dataset.column) + Number(swatch.dataset.length)) * 7.23 - source.scrollLeft + 8;
    const top = 18 + Number(swatch.dataset.line) * 20 - source.scrollTop;
    swatch.style.transform = `translate(${left}px, ${top}px)`;
  }
  const showVimCursor = source.dataset.vimMode === "normal" && document.activeElement === source;
  vimBlockCursor.hidden = !showVimCursor;
  if (showVimCursor) {
    const selectionRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    selectionRange?.collapse(source.selectionDirection !== "backward");
    const caretRect = selectionRange?.getClientRects()[0];
    const shellRect = editorShell.getBoundingClientRect();
    let left = caretRect?.left ? caretRect.left - shellRect.left : 52;
    if (!caretRect?.left) {
      const currentLineText = source.value.slice(source.value.lastIndexOf("\n", lastEditorCaret - 1) + 1, lastEditorCaret);
      const columns = [...currentLineText].reduce((count, character) => character === "\t" ? count + (2 - count % 2) : count + 1, 0);
      left += columns * 7.23 - source.scrollLeft;
    }
    vimBlockCursor.style.transform = "translate(" + left + "px, " + (14 + line * 20 - source.scrollTop) + "px)";
  }
}

function renderColorDecorators() {
  const swatches = [];
  const pattern = /#[\da-fA-F]{6}\b|#[\da-fA-F]{3}\b/g;
  for (const match of source.value.matchAll(pattern)) {
    const before = source.value.slice(0, match.index);
    const lineStart = before.lastIndexOf("\n") + 1;
    const lineText = source.value.slice(lineStart, match.index);
    const column = [...lineText].reduce((count, character) => character === "\t" ? count + (2 - count % 2) : count + 1, 0);
    const picker = document.createElement("input");
    picker.type = "color";
    picker.className = "color-decorator";
    picker.value = match[0].length === 4
      ? "#" + [...match[0].slice(1)].map((digit) => digit + digit).join("")
      : match[0];
    picker.dataset.start = String(match.index);
    picker.dataset.end = String(match.index + match[0].length);
    picker.dataset.line = String(before.split("\n").length - 1);
    picker.dataset.column = String(column);
    picker.dataset.length = String(match[0].length);
    picker.title = `Change ${match[0]}`;
    picker.setAttribute("aria-label", `Change color ${match[0]}`);
    picker.addEventListener("change", () => {
      source.setRangeText(picker.value, Number(picker.dataset.start), Number(picker.dataset.end), "end");
      source.dispatchEvent(new Event("input", { bubbles: true }));
      source.focus();
    });
    swatches.push(picker);
  }
  colorDecorators.replaceChildren(...swatches);
}

function highlightSource() {
  renderColorDecorators();
  updateEditorChrome();
  if (!CSS.highlights || !window.Highlight) return;
  for (const name of ["sbd-comment", "sbd-string", "sbd-math", "sbd-structure", "sbd-attribute", "sbd-number"]) {
    CSS.highlights.delete(name);
  }
  const pattern = /(\/\/.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\$[^$\n]*\$)|(@(?:node|line|annotation)\b|#diagram|^\s*\||[a-zA-Z][\w-]*(?:\.[\w-]+)+|(?:\.[\w-]+)+|^\s*node\b)|([\w-]+)(?=\s*=)|(\b\d+(?:\.\d+)?\b)/gm;
  const start = source.selectionStart;
  const end = source.selectionEnd;
  if (source.childNodes.length !== 1 || source.firstChild?.nodeType !== Node.TEXT_NODE) {
    const value = source.value;
    source.value = value;
    source.setSelectionRange(start, end);
  }
  const textNode = source.firstChild;
  if (!textNode) return;
  const ranges = {
    "sbd-comment": [],
    "sbd-string": [],
    "sbd-math": [],
    "sbd-structure": [],
    "sbd-attribute": [],
    "sbd-number": [],
  };
  for (const match of source.value.matchAll(pattern)) {
    const name = match[1] ? "sbd-comment"
      : match[2] ? "sbd-string"
        : match[3] ? "sbd-math"
          : match[4] ? "sbd-structure"
            : match[5] ? "sbd-attribute"
              : "sbd-number";
    const range = document.createRange();
    range.setStart(textNode, match.index);
    range.setEnd(textNode, match.index + match[0].length);
    ranges[name].push(range);
  }
  for (const [name, items] of Object.entries(ranges)) CSS.highlights.set(name, new Highlight(...items));
}

function syncHighlightScroll() {
  updateEditorChrome();
}

const structureCompletions = [
  { label: "@node", insert: "@node custom_node", detail: "Define a reusable node type" },
  { label: "@line", insert: "@line custom_line", detail: "Define a reusable connection style" },
  { label: "@annotation", insert: "@annotation custom_note", detail: "Define a reusable annotation style" },
  { label: "#diagram", insert: "#diagram", detail: "Figure root" },
  { label: ".defaults", insert: ".defaults", detail: "Group diagram-wide node, line, and annotation defaults" },
  { label: ".flow", insert: ".flow", detail: "Chain sibling nodes in sequence" },
  { label: ".merge", insert: ".merge", detail: "Merge two or more sources" },
  { label: ".connect", insert: ".connect\n  .from source-id\n  .to target-id", detail: "Connect two existing nodes" },
  { label: ".source", insert: ".source", detail: "Declare a merge source; add .ref below it" },
  { label: ".ref", insert: ".ref ", detail: "Merge source node ID" },
  { label: ".from", insert: ".from ", detail: "Compact list of merge source IDs" },
  { label: ".to", insert: ".to ", detail: "Existing connection target ID" },
  { label: ".from-direction", insert: ".from-direction right", detail: "Direction leaving a .connect source" },
  { label: ".to-direction", insert: ".to-direction right", detail: "Direction entering a .connect target" },
  { label: ".direction", insert: ".direction right", detail: "Layout direction: right, left, up, or down" },
  { label: ".ports", insert: ".ports distributed", detail: "Use distributed or shared connection ports" },
  { label: ".line", insert: ".line\n  .color #111111", detail: "Group connection properties" },
  { label: ".background", insert: ".background #ffffff", detail: "Diagram background" },
  { label: ".font", insert: ".font Verdana, sans-serif", detail: "Diagram font" },
  { label: ".node", insert: ".node\n  .fill #ffffff", detail: "Group default node properties" },
  { label: ".color", insert: ".color #111111", detail: "Text, line, or annotation color" },
  { label: ".fill", insert: ".fill #ffffff", detail: "Node fill color" },
  { label: ".shape", insert: ".shape rounded", detail: "Node shape" },
  { label: ".shadow-color", insert: ".shadow-color #000000", detail: "Enable a node drop shadow" },
  { label: ".shadow-offset-x", insert: ".shadow-offset-x 4", detail: "Horizontal shadow offset" },
  { label: ".shadow-offset-y", insert: ".shadow-offset-y 5", detail: "Vertical shadow offset" },
  { label: ".shadow-blur", insert: ".shadow-blur 6", detail: "Shadow blur radius" },
  { label: ".shadow-opacity", insert: ".shadow-opacity 0.3", detail: "Shadow opacity from 0 to 1" },
  { label: ".image", insert: ".image image.png", detail: "Image URL or path inside a node" },
  { label: ".image-width", insert: ".image-width 64", detail: "Rendered image width" },
  { label: ".image-height", insert: ".image-height 64", detail: "Rendered image height" },
  { label: ".image-fit", insert: ".image-fit contain", detail: "contain, cover, or fill" },
  { label: ".image-opacity", insert: ".image-opacity 1", detail: "Image opacity from 0 to 1" },
  { label: ".image-offset", insert: ".image-offset (0, 0)", detail: "Manual image offset inside its node" },
  { label: ".outline", insert: ".outline #111111", detail: "Node outline color" },
  { label: ".outline-style", insert: ".outline-style solid", detail: "solid, dashed, or dotted" },
  { label: ".outline-width", insert: ".outline-width 2", detail: "Node outline width" },
  { label: ".arrow-style", insert: ".arrow-style forward", detail: "forward, backward, both, or none" },
  { label: ".stroke-style", insert: ".stroke-style solid", detail: "solid, dashed, or dotted" },
  { label: ".label-position", insert: ".label-position above", detail: "Connection label side" },
  { label: ".label-offset", insert: ".label-offset (0, 0)", detail: "Manual label offset" },
  { label: ".offset", insert: ".offset (0, 0)", detail: "Manual node or annotation offset" },
  { label: ".node", insert: ".node\n  .label ", detail: "Start a node block" },
  { label: ".annotation", insert: ".annotation\n  .above ", detail: "Group annotations inside a node" },
  { label: ".above", insert: ".above ", detail: "Annotation above a node" },
  { label: ".below", insert: ".below ", detail: "Annotation below a node" },
  { label: ".label", insert: ".label ", detail: "Node or connection text" },
  { label: ".id", insert: ".id ", detail: "Stable node ID" },
  { label: ".width", insert: ".width 180", detail: "Node or line width" },
  { label: ".height", insert: ".height auto", detail: "Node height" },
  { label: ".align", insert: ".align center", detail: "left, center, or right" },
  { label: ".hidden", insert: ".hidden", detail: "Hide a node while preserving layout" },
];

function availableStructureCompletions() {
  const custom = [...source.value.matchAll(/^@(node|line|annotation)\s+([a-zA-Z][\w-]*)/gm)].map((match) => ({
    label: `.${match[2]}`,
    insert: match[1] === "node" ? `.${match[2]}\n  .label ` : `.${match[2]}`,
    detail: match[1] === "node" ? "Insert reusable node type" : `Apply reusable ${match[1]} class`,
  }));
  return [...structureCompletions, ...custom];
}
let shownCompletions = [];
let activeCompletion = 0;
let completionRange = null;

function completionContext() {
  const caret = source.selectionStart;
  const lineStart = source.value.lastIndexOf("\n", caret - 1) + 1;
  const before = source.value.slice(lineStart, caret);
  const openParen = before.lastIndexOf("(");
  if (openParen > before.lastIndexOf(")")) {
    const match = before.match(/([\w-]*)$/);
    return { items: [], prefix: match?.[1] ?? "", start: caret - (match?.[1]?.length ?? 0), end: caret };
  }
  const match = before.match(/([a-zA-Z][\w-]*(?:\.[\w-]*)+|(?:\.[\w-]*)+|#[\w-]*|@[\w-]*)$/);
  return { items: availableStructureCompletions(), prefix: match?.[1] ?? "", start: match ? caret - match[1].length : caret, end: caret };
}

function renderCompletions() {
  completionMenu.replaceChildren();
  shownCompletions.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "completion-item" + (index === activeCompletion ? " active" : "");
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(index === activeCompletion));
    button.append(document.createTextNode(item.label));
    const detail = document.createElement("small");
    detail.textContent = item.detail;
    button.append(detail);
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      activeCompletion = index;
      acceptCompletion();
    });
    completionMenu.append(button);
  });
}

function showCompletions() {
  const context = completionContext();
  const prefix = context.prefix.toLowerCase();
  shownCompletions = context.items.filter((item) => item.label.toLowerCase().startsWith(prefix));
  if (!shownCompletions.length) return hideCompletions();
  activeCompletion = 0;
  completionRange = context;
  completionMenu.hidden = false;
  renderCompletions();
}

function hideCompletions() {
  completionMenu.hidden = true;
  shownCompletions = [];
  completionRange = null;
}

function acceptCompletion() {
  const item = shownCompletions[activeCompletion];
  if (!item || !completionRange) return;
  source.setRangeText(item.insert, completionRange.start, completionRange.end, "end");
  const caret = source.selectionStart - (item.cursorBack ?? 0);
  source.setSelectionRange(caret, caret);
  hideCompletions();
  source.dispatchEvent(new Event("input"));
}

function persistElementMove(change) {
  const nextX = change.currentX + change.dx;
  const nextY = change.currentY + change.dy;
  if (["node", "node-label", "node-image"].includes(change.kind)) {
    const prefix = change.kind === "node" ? "offset" : change.kind === "node-image" ? "image-offset" : "label-offset";
    setSource(setNodeOffsetField(source.value, change.lineNumber, prefix, nextX, nextY));
    return;
  }
  if (change.kind === "connection-label") {
    setSource(setStructuralOffsetField(source.value, change.lineNumber, nextX, nextY));
    return;
  }
  setSource(setAnnotationOffsetField(source.value, change.lineNumber, nextX, nextY));
}

function cleanupDiagram() {
  const changes = diagram?.layout ? cleanupAlignmentOffsets(diagram.layout.nodes, diagram.layout.edges) : [];
  if (!changes.length) {
    status.textContent = "No small alignment kinks found.";
    status.className = "status ready";
    return;
  }
  let nextSource = source.value;
  [...changes].sort((a, b) => b.lineNumber - a.lineNumber).forEach((change) => {
    nextSource = setNodeOffsetField(nextSource, change.lineNumber, "offset", change.offsetX, change.offsetY);
  });
  setSource(nextSource);
  status.textContent = `Cleaned up ${changes.length} node${changes.length === 1 ? "" : "s"}.`;
  status.className = "status ready";
}

function applyNodePositions(targets) {
  let nextSource = source.value;
  [...targets].sort((a, b) => b.lineNumber - a.lineNumber).forEach((target) => {
    nextSource = setNodeOffsetField(nextSource, target.lineNumber, "offset", target.offsetX, target.offsetY);
  });
  setSource(nextSource);
}

function arrangeSelection(action) {
  const nodes = selectedNodes();
  if (!nodes.length) return;
  if (action === "remove-offsets") {
    let nextSource = source.value;
    [...nodes].sort((a, b) => b.lineNumber - a.lineNumber).forEach((node) => { nextSource = removeNodeField(nextSource, node.lineNumber, "offset"); });
    setSource(nextSource);
    return;
  }
  if (nodes.length < 2) return;
  applyNodePositions(arrangeNodeOffsets(nodes, action));
}

function filename(extension) {
  const lines = source.value.split("\n");
  const labelIndex = lines.findIndex((line) => /[a-zA-Z][\w-]*\.label(?:\s|$)/.test(line));
  const inlineLabel = lines[labelIndex]?.match(/[a-zA-Z][\w-]*\.label\s+(.+)$/)?.[1];
  const literalLabel = labelIndex >= 0 ? lines[labelIndex + 1]?.match(/^\s*\|\s?(.*)$/)?.[1] : null;
  const label = inlineLabel ?? literalLabel ?? "diagram";
  const name = label.replace(/\$[^$]+\$/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "diagram";
  return `${name}.${extension}`;
}

function selectSourceLine({ lineNumber }) {
  if (activeDocument !== "pug") activateDocument("pug");
  const lines = source.value.split("\n");
  const start = lines.slice(0, lineNumber - 1).reduce((length, line) => length + line.length + 1, 0);
  const end = start + (lines[lineNumber - 1]?.length ?? 0);
  source.focus({ preventScroll: true });
  const lineHeight = Number.parseFloat(getComputedStyle(source).lineHeight) || 20;
  const reveal = () => {
    source.setSelectionRange(start, end);
    source.scrollTop = Math.max(0, (lineNumber - 3) * lineHeight);
    updateEditorChrome();
  };
  reveal();
  requestAnimationFrame(reveal);
  editorShell.classList.remove("source-target");
  void editorShell.offsetWidth;
  editorShell.classList.add("source-target");
}

function update() {
  storeActiveDocument();
  const result = parseDiagram(pugSource, cssSource);
  if (result.errors.length) {
    status.textContent = result.errors[0];
    status.className = "status error";
    canvas.classList.add("preview-invalid");
    canvas.dataset.error = "Preview paused — fix the source error";
    return;
  }
  try {
    canvas.classList.remove("preview-invalid");
    delete canvas.dataset.error;
    currentGraph = result;
    if (diagram) diagram.render(pugSource, cssSource);
    else diagram = createBlockDiagram(canvas, pugSource, {
      styles: cssSource,
      onNodeClick: selectSourceLine,
      onElementMove: persistElementMove,
      onElementClick: selectCanvasElement,
    });
    paintSelections();
    renderInspector();
    status.textContent = `${result.nodes.length} blocks | ${result.edges.length} connections | ${result.format}`;
    status.className = "status ready";
  } catch (error) {
    status.textContent = error.message;
    status.className = "status error";
    canvas.classList.add("preview-invalid");
    canvas.dataset.error = "Preview paused — fix the source error";
  }
}

function setSource(value, recordHistory = true) {
  if (activeDocument !== "pug") activateDocument("pug");
  if (recordHistory && value !== pugSource) {
    canvasUndo.push(pugSource);
    canvasRedo = [];
  }
  source.value = value;
  pugSource = value;
  highlightSource();
  syncHighlightScroll();
  hideCompletions();
  update();
}

function undoCanvas() {
  const previous = canvasUndo.pop();
  if (previous === undefined) return;
  canvasRedo.push(pugSource);
  setSource(previous, false);
}

function redoCanvas() {
  const next = canvasRedo.pop();
  if (next === undefined) return;
  canvasUndo.push(pugSource);
  setSource(next, false);
}

source.value = pugSource;
source.addEventListener("input", (event) => {
  storeActiveDocument();
  highlightSource();
  update();
  if (event.data === "." || event.data === "(") showCompletions();
  else if (!completionMenu.hidden) showCompletions();
});
source.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.code === "Space") {
    event.preventDefault();
    showCompletions();
    return;
  }
  if (!completionMenu.hidden) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      activeCompletion = (activeCompletion + direction + shownCompletions.length) % shownCompletions.length;
      renderCompletions();
      completionMenu.children[activeCompletion]?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      acceptCompletion();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      hideCompletions();
      return;
    }
  }
  if (event.key !== "Tab") return;
  event.preventDefault();
  source.setRangeText("  ", source.selectionStart, source.selectionEnd, "end");
  source.dispatchEvent(new Event("input"));
});
source.addEventListener("scroll", syncHighlightScroll);
source.addEventListener("click", hideCompletions);
source.addEventListener("keyup", updateEditorChrome);
source.addEventListener("vim-mode-change", updateEditorChrome);
document.addEventListener("selectionchange", () => {
  if (document.activeElement === source) updateEditorChrome();
});
document.addEventListener("pointerdown", (event) => {
  if (!completionMenu.contains(event.target) && event.target !== source) hideCompletions();
});

document.querySelectorAll("[data-source-tab]").forEach((tab) => tab.addEventListener("click", () => activateDocument(tab.dataset.sourceTab)));
document.querySelector("#save-source").addEventListener("click", () => {
  storeActiveDocument();
  const extension = activeDocument === "pug" ? "pug" : "css";
  const blob = new Blob([activeDocument === "pug" ? pugSource : cssSource], { type: "text/plain;charset=utf-8" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename(extension);
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
});
document.querySelector("#cleanup-diagram").addEventListener("click", cleanupDiagram);
document.querySelector("#undo-canvas").addEventListener("click", undoCanvas);
document.querySelector("#redo-canvas").addEventListener("click", redoCanvas);
document.querySelector(".preview").addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redoCanvas() : undoCanvas(); }
  else if (event.key.toLowerCase() === "y") { event.preventDefault(); redoCanvas(); }
});
document.querySelector("#close-inspector").addEventListener("click", () => { selections = []; paintSelections(); renderInspector(); });
inspectorContent.addEventListener("click", (event) => {
  if (event.target.closest("[data-choose-image]")) {
    nodeImageFile.click();
    return;
  }
  const action = event.target.closest("[data-arrange]")?.dataset.arrange;
  if (action) arrangeSelection(action);
  const field = event.target.closest("[data-remove-field]")?.dataset.removeField;
  if (field) {
    let nextSource = source.value;
    [...selectedNodes()].sort((a, b) => b.lineNumber - a.lineNumber).forEach((node) => { nextSource = removeNodeField(nextSource, node.lineNumber, field); });
    setSource(nextSource);
  }
});
nodeImageFile.addEventListener("change", () => {
  const file = nodeImageFile.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let nextSource = source.value;
    [...selectedNodes()].sort((a, b) => b.lineNumber - a.lineNumber).forEach((node) => { nextSource = setNodeField(nextSource, node.lineNumber, "image", reader.result); });
    setSource(nextSource);
    nodeImageFile.value = "";
  };
  reader.readAsDataURL(file);
});
inspectorContent.addEventListener("change", (event) => {
  const nodes = selectedNodes();
  const node = nodes[0];
  if (event.target.matches("[data-arrange-select]")) {
    if (event.target.value) arrangeSelection(event.target.value);
    return;
  }
  if (event.target.matches("[data-color-picker]")) {
    const textInput = inspectorContent.querySelector(`[data-color-text="${event.target.dataset.colorPicker}"]`);
    if (textInput) { textInput.value = event.target.value; textInput.dispatchEvent(new Event("change", { bubbles: true })); }
    return;
  }
  if (event.target.matches("[data-shadow-toggle]")) {
    let nextSource = source.value;
    [...nodes].sort((a, b) => b.lineNumber - a.lineNumber).forEach((selected) => {
      nextSource = event.target.checked ? setNodeField(nextSource, selected.lineNumber, "shadow-color", "#000000") : removeNodeField(nextSource, selected.lineNumber, "shadow-color");
    });
    setSource(nextSource);
    return;
  }
  if (event.target.matches("[data-image-toggle]")) {
    let nextSource = source.value;
    [...nodes].sort((a, b) => b.lineNumber - a.lineNumber).forEach((selected) => {
      nextSource = event.target.checked ? setNodeField(nextSource, selected.lineNumber, "image", "image.png") : removeNodeField(nextSource, selected.lineNumber, "image");
    });
    setSource(nextSource);
    return;
  }
  if (event.target.matches("[data-node-type]") && node) {
    if (!event.target.value) return;
    let nextSource = source.value;
    [...nodes].sort((a, b) => b.lineNumber - a.lineNumber).forEach((selected) => { nextSource = setNodeType(nextSource, selected.lineNumber, event.target.value); });
    setSource(nextSource);
    return;
  }
  const nodeField = event.target.dataset.nodeField;
  if (nodeField && node) {
    if (!event.target.value) return;
    let nextSource = source.value;
    [...nodes].sort((a, b) => b.lineNumber - a.lineNumber).forEach((selected) => {
      nextSource = setNodeField(nextSource, selected.lineNumber, nodeField, event.target.value);
    });
    setSource(nextSource);
    return;
  }
  const lineField = event.target.dataset.lineField;
  const lineType = event.target.dataset.lineType;
  if (lineType !== undefined) {
    if (!lineType) return;
    const knownTypes = [...`${pugSource}\n${cssSource}`.matchAll(/^@line\s+([\w-]+)/gm)].map((match) => match[1]);
    const operations = selections.filter((item) => item.kind === "line").map((item) => {
      const edge = diagram.layout.edges.find((candidate) => candidate.from === item.from && candidate.to === item.to);
      const target = currentGraph.nodes.find((candidate) => candidate.id === edge.to);
      return { edge, lineNumber: edge.kind === "branch" ? target.lineNumber : edge.lineNumber };
    }).sort((a, b) => b.lineNumber - a.lineNumber);
    let nextSource = source.value;
    operations.forEach(({ edge, lineNumber }) => {
      nextSource = edge.kind === "branch"
        ? setNodeLineType(nextSource, lineNumber, lineType, knownTypes)
        : setStructuralLineType(nextSource, lineNumber, lineType, knownTypes);
    });
    setSource(nextSource);
    return;
  }
  if (!lineField) return;
  const operations = selections.filter((item) => item.kind === "line").map((item) => {
    const edge = diagram.layout.edges.find((candidate) => candidate.from === item.from && candidate.to === item.to);
    const target = currentGraph.nodes.find((candidate) => candidate.id === edge.to);
    return { edge, target, lineNumber: edge.kind === "branch" ? target.lineNumber : edge.lineNumber };
  }).sort((a, b) => b.lineNumber - a.lineNumber);
  let nextSource = source.value;
  operations.forEach(({ edge, lineNumber }) => {
    nextSource = edge.kind === "branch"
      ? setNodeField(nextSource, lineNumber, `line.${lineField}`, event.target.value)
      : setStructuralField(nextSource, lineNumber, `line.${lineField}`, event.target.value);
  });
  setSource(nextSource);
});

let inspectorDrag = null;
document.querySelector(".inspector-drag-handle").addEventListener("pointerdown", (event) => {
  const bounds = inspector.getBoundingClientRect();
  inspectorDrag = { pointerId: event.pointerId, dx: event.clientX - bounds.left, dy: event.clientY - bounds.top };
  event.target.setPointerCapture(event.pointerId);
});
document.querySelector(".inspector-drag-handle").addEventListener("pointermove", (event) => {
  if (!inspectorDrag || inspectorDrag.pointerId !== event.pointerId) return;
  const shell = inspector.parentElement.getBoundingClientRect();
  const left = Math.max(0, Math.min(shell.width - inspector.offsetWidth, event.clientX - shell.left - inspectorDrag.dx));
  const top = Math.max(0, Math.min(shell.height - inspector.offsetHeight, event.clientY - shell.top - inspectorDrag.dy));
  inspector.style.left = `${left}px`;
  inspector.style.top = `${top}px`;
  inspector.style.right = "auto";
});
document.querySelector(".inspector-drag-handle").addEventListener("pointerup", () => { inspectorDrag = null; });
document.querySelector("#load-source").addEventListener("click", () => sourceFile.click());
sourceFile.addEventListener("change", async () => {
  const file = sourceFile.files?.[0];
  if (!file) return;
  const value = await file.text();
  if (activeDocument === "pug") setSource(value);
  else { cssSource = value; source.value = value; highlightSource(); update(); }
  sourceFile.value = "";
});
document.querySelector("#save-svg").addEventListener("click", () => diagram?.saveSVG(filename("svg")));
document.querySelector("#save-png").addEventListener("click", () => diagram?.savePNG(filename("png"), Number(scale.value)));
document.querySelector("#copy-svg").addEventListener("click", async () => {
  if (!diagram) return;
  await navigator.clipboard.writeText(diagram.toSVGString());
  status.textContent = "SVG copied to the clipboard";
});

highlightSource();
update();
