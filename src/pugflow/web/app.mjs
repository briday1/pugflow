import { createBlockDiagram, parseDiagram } from "./pugflow.mjs";
import { appendDiagramNode, appendFlowNode, appendMergeNode, ensureGraphComponents, indentSourceSelection, removeConnectionLabel, removeDeclaration, removeDeclarationField, removeNodeDeclaration, removeNodeReferences, removeNodeField, removeNodeFields, setAnnotationOffsetField, setAnnotationText, setDeclarationOffsetField, setNodeAnnotationField, setNodeAnnotationText, setNodeField, setNodeImageGeometry, setNodeLineType, setNodeOffsetField, setNodeType, setStructuralField, setStructuralLineType, setStructuralOffsetField } from "./editor-source.mjs";
import { attachVimMode } from "./vim-mode.mjs";
import { attachTextEditor } from "./text-editor.mjs";
import { arrangeNodeOffsets, cleanupAlignmentOffsets, independentMoveOffsets } from "./layout.mjs";
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

#canvas
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
        .offset (140, 0)
        .blue_note
        | Block and connection annotations
      .below Auto width, fixed width, and math
        .offset (125.9, -0.8)
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
          .offset (-56, -50.3)
          .label Rounded block
        .square_node
          .warning_line
            .label both directions
            .label-position below
          .id two
          .offset (23.2, -56.3)
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
            .offset (-416.6, -96)
            .label Round $\\sqrt{x}$
        .flow
          .direction right
          .ports shared
          .dotted_line
          .node
            .quiet_line
              .label no arrow
            .offset (361, -4.4)
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
          .node
            .id archived
            .offset (-85.2, 0)
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
const EXAMPLE_DIAGRAM_START = EXAMPLE_DOCUMENT.indexOf("#canvas");
const EXAMPLE = ensureGraphComponents(`// Full feature tour — edit anything and watch the preview update\n${EXAMPLE_DOCUMENT.slice(EXAMPLE_DIAGRAM_START)}`);
const EXAMPLE_STYLES = pugDefinitionsToStyleSheet(EXAMPLE_DOCUMENT.slice(0, EXAMPLE_DIAGRAM_START));

const source = attachTextEditor(document.querySelector("#source"));
const editorShell = document.querySelector(".editor-shell");
const lineNumbers = document.querySelector("#line-numbers");
const colorDecorators = document.querySelector("#color-decorators");
const currentLine = document.querySelector("#current-line");
const vimBlockCursor = document.querySelector("#vim-block-cursor");
const completionMenu = document.querySelector("#completion-menu");
const canvas = document.querySelector("#diagram");
const canvasShell = document.querySelector(".canvas-shell");
const canvasZoom = document.querySelector("#canvas-zoom");
const PNG_COPY_SCALE = 2;
const canvasToast = document.querySelector("#canvas-toast");
let canvasToastTimer = null;

function showCanvasToast(message) {
  canvasToast.textContent = message;
  canvasToast.classList.add("show");
  clearTimeout(canvasToastTimer);
  canvasToastTimer = setTimeout(() => canvasToast.classList.remove("show"), 2200);
}
const inspector = document.querySelector("#canvas-inspector");
const inspectorContent = document.querySelector("#inspector-content");
const status = document.querySelector("#status");
const sourceFile = document.querySelector("#source-file");
const nodeImageFile = document.querySelector("#node-image-file");
const themeSelect = document.querySelector("#theme");
const main = document.querySelector("main");
const sourcePanel = document.querySelector("#source-panel");
const panelResizer = document.querySelector("#panel-resizer");
const vimToggle = document.querySelector("#vim-mode");
const vimStatus = document.querySelector("#vim-status");
const graphBuilder = document.querySelector("#graph-builder");
const graphBuilderForm = document.querySelector("#graph-builder-form");
const builderParent = document.querySelector("#builder-parent");
const builderSources = document.querySelector("#builder-sources");
const builderNodeType = document.querySelector("#builder-node-type");
const builderLineType = document.querySelector("#builder-line-type");
const builderId = document.querySelector("#builder-id");
const builderLabel = document.querySelector("#builder-label");
const builderDiagramId = document.querySelector("#builder-diagram-id");
const builderDiagramLabel = document.querySelector("#builder-diagram-label");
const builderError = document.querySelector("#builder-error");
const PANEL_WIDTH_KEY = "pugflow-panel-width-v1";
const THEME_KEY = "pugflow-theme-v1";
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
let diagram;
let currentGraph;
let selections = [];
let canvasUndo = [];
let canvasRedo = [];
let activeDocument = "pug";
const launchParams = new URLSearchParams(location.search);
let pugSource = launchParams.get("demo") === "1" ? EXAMPLE : "#canvas";
let cssSource = launchParams.get("demo") === "1" ? EXAMPLE_STYLES : "";
let pugFileName = launchParams.get("pug_name") ?? (launchParams.get("demo") === "1" ? "demo.pug" : "Untitled.pug");
let cssFileName = launchParams.get("css_name") ?? (launchParams.get("demo") === "1" ? "demo.css" : "");
let canvasZoomPercent = 100;
if (launchParams.get("project") === "1") {
  [pugSource, cssSource] = await Promise.all([
    fetch("/__project.pug").then((response) => response.ok ? response.text() : "#canvas"),
    fetch("/__project.css").then((response) => response.ok ? response.text() : ""),
  ]);
}

function updateSourceFileNames() {
  const pugTab = document.querySelector('[data-source-tab="pug"]');
  const cssTab = document.querySelector('[data-source-tab="css"]');
  pugTab.textContent = pugFileName === "Untitled.pug" ? "Pug" : pugFileName;
  cssTab.textContent = cssFileName || "CSS";
  pugTab.title = pugFileName;
  cssTab.title = cssFileName || "No CSS file loaded";
}

function storeActiveDocument() {
  if (activeDocument === "pug") pugSource = source.value;
  else cssSource = source.value;
}

function activateDocument(kind) {
  if (kind === activeDocument) return;
  storeActiveDocument();
  activeDocument = kind;
  source.value = kind === "pug" ? pugSource : cssSource;
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

function textControls(scope, style = {}, includeColor = false) {
  const option = (value, current) => `<option value="${value}"${String(current) === value ? " selected" : ""}>${value}</option>`;
  return `<details><summary>Typography</summary>${includeColor ? colorControl("Color", "color", style.color, scope) : ""}<label>Font family<input data-${scope}-field="font-family" value="${escapeHtml(style.fontFamily ?? "")}" placeholder="inherit"></label><div class="inspector-grid"><label>Size<input data-${scope}-field="font-size" type="number" min="1" value="${style.fontSize ?? 12}"></label><label>Weight<select data-${scope}-field="font-weight">${["normal","500","600","bold"].map((v) => option(v, style.fontWeight ?? "normal")).join("")}</select></label><label>Style<select data-${scope}-field="font-style">${["normal","italic","oblique"].map((v) => option(v, style.fontStyle ?? "normal")).join("")}</select></label><label>Decoration<select data-${scope}-field="text-decoration">${["none","underline","line-through","overline"].map((v) => option(v, style.textDecoration ?? "none")).join("")}</select></label></div></details>`;
}

function nodeAnnotationControls(node) {
  const option = (value, current) => `<option value="${value}"${String(current) === value ? " selected" : ""}>${value}</option>`;
  const fields = ["above", "below"].map((position) => {
    const annotation = node.annotations.find((item) => item.position === position) ?? { position, text: "", color: null, fontFamily: null, fontSize: 12, fontWeight: "normal", fontStyle: "normal", textDecoration: "none" };
    const hex = /^#[0-9a-f]{6}$/i.test(annotation.color ?? "") ? annotation.color : "#000000";
    const target = `data-node-annotation-line="${node.lineNumber}" data-node-annotation-position="${position}"`;
    return `<details class="annotation-editor"><summary>${position === "below" ? "Below" : "Above"}</summary><label>Text<textarea data-node-annotation-text ${target} rows="2">${escapeHtml(annotation.text)}</textarea></label><label>Color<span class="inspector-color"><input type="color" data-node-annotation-color-picker="${position}" value="${hex}"><input ${target} data-node-annotation-field="color" value="${escapeHtml(annotation.color ?? "")}" placeholder="CSS color"></span></label><label>Font family<input ${target} data-node-annotation-field="font-family" value="${escapeHtml(annotation.fontFamily ?? "")}" placeholder="inherit"></label><div class="inspector-grid"><label>Size<input ${target} data-node-annotation-field="font-size" type="number" min="1" value="${annotation.fontSize ?? 12}"></label><label>Weight<select ${target} data-node-annotation-field="font-weight">${["normal","500","600","bold"].map((v) => option(v, annotation.fontWeight ?? "normal")).join("")}</select></label><label>Style<select ${target} data-node-annotation-field="font-style">${["normal","italic","oblique"].map((v) => option(v, annotation.fontStyle ?? "normal")).join("")}</select></label><label>Decoration<select ${target} data-node-annotation-field="text-decoration">${["none","underline","line-through","overline"].map((v) => option(v, annotation.textDecoration ?? "none")).join("")}</select></label></div></details>`;
  }).join("");
  const fieldsWithVisibility = fields.replace(/<summary>(Above|Below)<\/summary>/g, (_match, label) => {
    const position = label.toLowerCase();
    const annotation = node.annotations.find((item) => item.position === position);
    return `<summary><span>${label}</span><label class="inspector-switch inspector-switch-summary"><span>Hidden</span><input data-node-annotation-hidden type="checkbox" data-node-annotation-line="${node.lineNumber}" data-node-annotation-position="${position}" data-annotation-line="${annotation?.lineNumber ?? ""}"${annotation?.hidden ? " checked" : ""}></label></summary>`;
  });
  const allHidden = node.annotations.length && node.annotations.every((annotation) => annotation.hidden);
  return `<details class="annotations-editor"><summary><span>Annotations</span><label class="inspector-switch inspector-switch-summary"><span>Hidden</span><input data-node-annotations-hidden type="checkbox"${allHidden ? " checked" : ""}></label></summary>${fieldsWithVisibility}</details>`;
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

function reusableNames(kind) {
  return [...new Set([...`${pugSource}\n${cssSource}`.matchAll(new RegExp(`^@${kind}\\s+([\\w-]+)`, "gm"))].map((match) => match[1]))];
}

function syncInspectorScrollbarWidth() {
  inspector.classList.remove("has-scrollbar");
  requestAnimationFrame(() => {
    if (!inspector.hidden) inspector.classList.toggle("has-scrollbar", inspector.scrollHeight > inspector.clientHeight + 1);
  });
}

function renderInspector() {
  const openSections = new Set([...inspectorContent.querySelectorAll("details[open] > summary")].map((summary) => summary.textContent.trim()));
  queueMicrotask(() => inspectorContent.querySelectorAll("details > summary").forEach((summary) => {
    if (openSections.has(summary.textContent.trim())) summary.parentElement.open = true;
  }));
  if (!selections.length) { inspector.hidden = true; return; }
  inspector.hidden = false;
  syncInspectorScrollbarWidth();
  const graphSelections = selections.filter((item) => item.kind === "graph");
  if (graphSelections.length === selections.length) {
    const group = currentGraph.groups.find((candidate) => candidate.id === graphSelections[0].id);
    inspectorContent.innerHTML = `<h3>Graph</h3><button type="button" data-graph-add="nested">+ Nested graph</button><label>Title<input data-graph-field="label" value="${escapeHtml(group?.label ?? "")}"></label><details open><summary>Frame</summary>${colorControl("Fill", "fill", group?.fill, "graph")}${colorControl("Text", "color", group?.color, "graph")}${colorControl("Outline", "outline", group?.outline, "graph")}<label>Outline style<select data-graph-field="outline-style">${["solid","dashed","dotted"].map((value) => `<option${group?.outlineStyle === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>Outline width<input data-graph-field="outline-width" type="number" min="0" value="${group?.outlineWidth ?? 1.5}"></label><label>Padding<input data-graph-field="padding" type="number" min="0" value="${group?.padding ?? 24}"></label><label class="inspector-switch"><span>Hidden</span><input data-graph-hidden type="checkbox"${group?.hidden ? " checked" : ""}></label></details>`;
    if (graphSelections.length > 1) inspectorContent.insertAdjacentHTML("beforeend", '<label>Align / distribute<select data-arrange-select><option value="">Choose…</option><option value="left">Align left</option><option value="center">Align center</option><option value="right">Align right</option><option value="top">Align top</option><option value="middle">Align middle</option><option value="bottom">Align bottom</option><option value="horizontal">Distribute horizontally</option><option value="vertical">Distribute vertically</option></select></label><button data-arrange="remove-offsets">Remove graph offsets</button>');
    return;
  }
  const nodes = selectedNodes();
  if (nodes.length === selections.length) {
    const custom = [...`${pugSource}\n${cssSource}`.matchAll(/^@node\s+([\w-]+)/gm)].map((match) => match[1]);
    if (nodes.length > 1) {
      inspectorContent.innerHTML = `<h3>${nodes.length} nodes selected</h3><label>Type<select data-node-type><option value="">Choose…</option><option value="node">node</option>${custom.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}</select></label><details><summary>Appearance</summary><label>Shape<select data-node-field="shape"><option value="">Choose…</option>${["square","rounded","round","pill","diamond","hexagon"].map((shape) => `<option>${shape}</option>`).join("")}</select></label>${colorControl("Fill", "fill", "")}${colorControl("Text", "color", "")}${colorControl("Border", "outline", "")}<label>Border style<select data-node-field="outline-style"><option value="">Choose…</option><option>solid</option><option>dashed</option><option>dotted</option></select></label><label>Border width<input data-node-field="outline-width" type="number" min="0"></label></details><details><summary><label class="shadow-toggle"><input type="checkbox" data-shadow-toggle> Shadow</label></summary>${colorControl("Color", "shadow-color", "#000000")}<label>X offset<input data-node-field="shadow-offset-x" type="number" value="4"></label><label>Y offset<input data-node-field="shadow-offset-y" type="number" value="5"></label><label>Blur<input data-node-field="shadow-blur" type="number" min="0" value="6"></label><label>Opacity<input data-node-field="shadow-opacity" type="number" min="0" max="1" step="0.05" value="0.3"></label></details><label>Align / distribute<select data-arrange-select><option value="">Choose…</option><option value="left">Align left</option><option value="center">Align center</option><option value="right">Align right</option><option value="top">Align top</option><option value="middle">Align middle</option><option value="bottom">Align bottom</option><option value="horizontal">Distribute horizontally</option><option value="vertical">Distribute vertically</option></select></label><button data-arrange="remove-offsets">Remove offsets</button>`;
      inspectorContent.querySelector("h3")?.insertAdjacentHTML("beforeend", `<label class="inspector-switch inspector-switch-heading"><span>Hidden</span><input data-node-hidden type="checkbox"${nodes.every((item) => item.hidden) ? " checked" : ""}></label>`);
      inspectorContent.querySelector("details")?.insertAdjacentHTML("afterend", textControls("node", { fontSize: 16 }));
      inspectorContent.querySelectorAll("details")[1]?.insertAdjacentHTML("afterend", imageControls());
      tidyInspectorSections();
      return;
    }
    const node = currentGraph.nodes.find((candidate) => candidate.id === nodes[0].id);
    inspectorContent.innerHTML = `<h3>Node</h3><label>Label<input data-node-field="label" value="${escapeHtml(node.label.replace(/\n/g, " "))}"></label><label>Type<select data-node-type><option value="node">node</option>${custom.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}</select></label><details><summary>Appearance</summary><label>Shape<select data-node-field="shape">${["square","rounded","round","pill","diamond","hexagon"].map((shape) => `<option${node.style.shape === shape ? " selected" : ""}>${shape}</option>`).join("")}</select></label>${colorControl("Fill", "fill", node.style.fill)}${colorControl("Text", "color", node.style.color)}${colorControl("Border", "outline", node.style.outline)}<label>Border style<select data-node-field="outline-style">${["solid","dashed","dotted"].map((value) => `<option${node.style.outlineStyle === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>Border width<input data-node-field="outline-width" type="number" min="0" value="${node.style.outlineWidth}"></label><label>Width<input data-node-field="width" value="${node.style.width}"></label><label>Height<input data-node-field="height" value="${node.style.height}"></label><label>Text alignment<select data-node-field="align">${["left","center","right"].map((value) => `<option${node.style.align === value ? " selected" : ""}>${value}</option>`).join("")}</select></label></details><details${node.style.shadowColor ? " open" : ""}><summary><label class="shadow-toggle"><input type="checkbox" data-shadow-toggle${node.style.shadowColor ? " checked" : ""}> Shadow</label></summary>${colorControl("Color", "shadow-color", node.style.shadowColor ?? "#000000")}<label>X offset<input data-node-field="shadow-offset-x" type="number" value="${node.style.shadowOffsetX}"></label><label>Y offset<input data-node-field="shadow-offset-y" type="number" value="${node.style.shadowOffsetY}"></label><label>Blur<input data-node-field="shadow-blur" type="number" min="0" value="${node.style.shadowBlur}"></label><label>Opacity<input data-node-field="shadow-opacity" type="number" min="0" max="1" step="0.05" value="${node.style.shadowOpacity}"></label></details><label>Offset<input value="(${node.offsetX}, ${node.offsetY})" readonly></label><button data-arrange="remove-offsets">Remove offset</button>`;
    inspectorContent.querySelector("h3")?.insertAdjacentHTML("beforeend", `<label class="inspector-switch inspector-switch-heading"><span>Hidden</span><input data-node-hidden type="checkbox"${node.hidden ? " checked" : ""}></label>`);
    inspectorContent.querySelector("details")?.insertAdjacentHTML("afterend", textControls("node", node.style));
    inspectorContent.querySelectorAll("details")[1]?.insertAdjacentHTML("afterend", imageControls(node));
    tidyInspectorSections();
    inspectorContent.insertAdjacentHTML("beforeend", nodeAnnotationControls(node));
    inspectorContent.insertAdjacentHTML("beforeend", '<button type="button" class="inspector-primary-action" data-graph-add="flow">+ Add flow</button>');
    return;
  }
  const annotationSelections = selections.filter((item) => item.kind === "annotation");
  if (annotationSelections.length === selections.length) {
    const annotations = annotationSelections.map((selection) => currentGraph.nodes.flatMap((node) => node.annotations).find((annotation) => annotation.lineNumber === selection.lineNumber)).filter(Boolean);
    const annotation = annotations[0] ?? {};
    inspectorContent.innerHTML = `<h3>${annotations.length} annotation${annotations.length === 1 ? "" : "s"}</h3>${textControls("annotation", annotation, true)}<label>Offset<input value="(${annotation.offsetX ?? 0}, ${annotation.offsetY ?? 0})" readonly></label>`;
    return;
  }
  const edges = selections.filter((item) => item.kind === "line").map((item) => diagram.layout.edges.find((edge) => edge.from === item.from && edge.to === item.to));
  const edge = edges[0];
  const lineTypes = [...`${pugSource}\n${cssSource}`.matchAll(/^@line\s+([\w-]+)/gm)].map((match) => match[1]);
  const sharedType = edges.every((candidate) => candidate?.lineType === edge?.lineType) ? edge?.lineType ?? "" : "";
  inspectorContent.innerHTML = `<h3>${edges.length} connector${edges.length === 1 ? "" : "s"}</h3><label>Type<select data-line-type><option value="">Choose…</option>${lineTypes.map((name) => `<option value="${escapeHtml(name)}"${sharedType === name ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label><details open><summary>Line appearance <small>local overrides</small></summary>${colorControl("Color", "color", edge?.color, "line")}<label>Width<input data-line-field="width" type="number" min="0.5" step="0.5" value="${edge?.width ?? 2}"></label><label>Stroke<select data-line-field="stroke-style">${["solid","dashed","dotted"].map((value) => `<option${edge?.style === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>Arrow<select data-line-field="arrow-style">${["forward","backward","both","none"].map((value) => `<option${edge?.direction === value ? " selected" : ""}>${value}</option>`).join("")}</select></label></details>`;
  inspectorContent.querySelector("h3")?.insertAdjacentHTML("beforeend", `<label class="inspector-switch inspector-switch-heading"><span>Hidden</span><input data-line-hidden type="checkbox"${edges.length && edges.every((item) => item?.hidden) ? " checked" : ""}></label>`);
  const connectorAnnotation = (position) => {
    const title = position === "below" ? "Below" : "Above";
    const text = position === "below" ? edge?.annotationBelow : edge?.annotationAbove;
    const hidden = position === "below" ? edge?.annotationBelowHidden : edge?.annotationAboveHidden;
    return `<details class="annotation-editor"><summary><span>${title}</span><label class="inspector-switch inspector-switch-summary"><span>Hidden</span><input data-line-annotation-hidden="annotation-${position}-hidden" type="checkbox"${hidden ? " checked" : ""}></label></summary><label>Text<input data-line-field="annotation-${position}" value="${escapeHtml(text ?? "")}"></label></details>`;
  };
  const allAnnotationsHidden = edges.length && edges.every((item) => item?.annotationAboveHidden && item?.annotationBelowHidden);
  inspectorContent.insertAdjacentHTML("beforeend", `<details class="annotations-editor"><summary><span>Annotations</span><label class="inspector-switch inspector-switch-summary"><span>Hidden</span><input data-line-annotations-hidden type="checkbox"${allAnnotationsHidden ? " checked" : ""}></label></summary>${connectorAnnotation("above")}${connectorAnnotation("below")}</details>`);
  inspectorContent.insertAdjacentHTML("beforeend", textControls("line", edge ?? {}));
}

function suggestedNodeId() {
  const used = new Set(currentGraph.nodes.map((node) => node.id));
  let number = currentGraph.nodes.length + 1;
  while (used.has(`node-${number}`)) number += 1;
  return `node-${number}`;
}

function openGraphBuilder(mode = "flow", preferredIds = null) {
  if (activeDocument !== "pug") activateDocument("pug");
  const selectedIds = preferredIds ?? selectedNodes().map((node) => node.id);
  const root = currentGraph.nodes[0];
  graphBuilder.dataset.mode = mode;
  graphBuilder.dataset.parentGraphLine = mode === "nested" ? String(selections.find((item) => item.kind === "graph")?.lineNumber ?? "") : "";
  document.querySelector("#graph-builder-title").textContent = mode === "merge" ? "Add merge target" : ["diagram", "nested"].includes(mode) ? (mode === "nested" ? "Create nested graph" : "Create graph") : "Add flow node";
  document.querySelector("#graph-builder-help").textContent = mode === "merge"
    ? "Choose two or more existing nodes that converge into a new target."
    : mode === "diagram" ? "Create a connected graph with its own root, label, fill, and outline." : "Create a new node connected from one existing parent.";
  builderParent.innerHTML = currentGraph.nodes.map((node) => `<option value="${escapeHtml(node.id)}"${node.id === (selectedIds[0] ?? root?.id) ? " selected" : ""}>${escapeHtml(node.id)}</option>`).join("");
  builderSources.innerHTML = currentGraph.nodes.map((node) => `<label><input type="checkbox" value="${escapeHtml(node.id)}"${selectedIds.includes(node.id) ? " checked" : ""}> <span>${escapeHtml(node.id)}</span></label>`).join("");
  builderNodeType.innerHTML = `<option value="node">node</option>${reusableNames("node").map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
  builderLineType.innerHTML = `<option value="">Default line</option>${reusableNames("line").map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
  builderId.value = suggestedNodeId();
  builderLabel.value = "New node";
  builderDiagramId.value = `diagram-${currentGraph.groups.length + 1}`;
  builderDiagramLabel.value = "";
  builderError.textContent = "";
  graphBuilder.showModal();
  builderLabel.select();
}

function selectCreatedNode(id) {
  const node = currentGraph.nodes.find((candidate) => candidate.id === id);
  if (!node) return;
  selections = [{ kind: "node", id, lineNumber: node.lineNumber, selectionKey: `node:${id}`, additive: false }];
  paintSelections();
  renderInspector();
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

function deleteCanvasSelection() {
  const operations = selections.map((selection) => {
    if (selection.kind === "graph") return { line: selection.lineNumber, apply: (value) => removeDeclaration(value, selection.lineNumber) };
    if (selection.kind === "node") {
      const group = currentGraph.groups.find((candidate) => candidate.rootId === selection.id);
      if (group) return { line: group.lineNumber, apply: (value) => removeDeclaration(value, group.lineNumber) };
      const node = currentGraph.nodes.find((candidate) => candidate.id === selection.id);
      return node ? { line: node.lineNumber, apply: (value) => removeNodeDeclaration(removeNodeReferences(value, node.id), node.lineNumber) } : null;
    }
    if (selection.kind === "node-label") {
      const node = currentGraph.nodes.find((candidate) => candidate.id === selection.id);
      return node ? { line: node.lineNumber, apply: (value) => setNodeField(value, node.lineNumber, "label", "") } : null;
    }
    if (selection.kind === "image") {
      const node = currentGraph.nodes.find((candidate) => candidate.id === selection.id);
      return node ? { line: node.lineNumber, apply: (value) => removeNodeFields(value, node.lineNumber, ["image", "image-width", "image-height", "image-fit", "image-opacity", "image-offset", "image-padding"]) } : null;
    }
    if (selection.kind === "annotation") return { line: selection.lineNumber, apply: (value) => removeDeclaration(value, selection.lineNumber) };
    const edge = currentGraph.edges.find((candidate) => candidate.from === selection.from && candidate.to === selection.to);
    if (!edge) return null;
    if (selection.kind === "connection-label") return { line: edge.lineNumber, apply: (value) => removeConnectionLabel(value, edge.lineNumber) };
    if (edge.kind === "branch") {
      const target = currentGraph.nodes.find((candidate) => candidate.id === edge.to);
      return target ? { line: target.lineNumber, apply: (value) => setNodeField(value, target.lineNumber, "line.hidden", "") } : null;
    }
    return { line: edge.lineNumber, apply: (value) => setStructuralField(value, edge.lineNumber, "line.hidden", "") };
  }).filter(Boolean).sort((a, b) => b.line - a.line);
  const unique = operations.filter((operation, index) => index === 0 || operation.line !== operations[index - 1].line);
  let nextSource = source.value;
  unique.forEach((operation) => { nextSource = operation.apply(nextSource); });
  selections = [];
  setSource(nextSource);
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
  const pattern = /(\/\/.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\$[^$\n]*\$)|(@(?:node|line|annotation)\b|#canvas|^\s*\||[a-zA-Z][\w-]*(?:\.[\w-]+)+|(?:\.[\w-]+)+|^\s*(?:node|graph)\b)|([\w-]+)(?=\s*=)|(\b\d+(?:\.\d+)?\b)/gm;
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
  { label: "#canvas", insert: "#canvas", detail: "Canvas root" },
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
  { label: ".annotation-above", insert: ".annotation-above ", detail: "Connector annotation above the line" },
  { label: ".annotation-below", insert: ".annotation-below ", detail: "Connector annotation below the line" },
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
  { label: ".font-family", insert: ".font-family Inter, sans-serif", detail: "Font stack for node or annotation text" },
  { label: ".font-size", insert: ".font-size 16", detail: "Text size in pixels" },
  { label: ".font-weight", insert: ".font-weight bold", detail: "normal, numeric, or bold" },
  { label: ".font-style", insert: ".font-style italic", detail: "normal, italic, or oblique" },
  { label: ".text-decoration", insert: ".text-decoration underline", detail: "none, underline, overline, or line-through" },
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
  const draggedSelection = selections.find((item) => item.selectionKey === change.selectionKey);
  if (draggedSelection && selections.length > 1 && !["node-image", "node-image-resize", "node-label", "block-annotation"].includes(change.kind)) {
    let nextSource = source.value;
    const selectedNodeIds = selections.filter((selection) => selection.kind === "node").map((selection) => selection.id);
    const nodeMoves = independentMoveOffsets(diagram?.layout?.nodes ?? [], diagram?.layout?.edges ?? [], selectedNodeIds, change.dx, change.dy)
      .map((node) => ({ line: node.lineNumber, apply: (value) => setNodeOffsetField(value, node.lineNumber, "offset", node.offsetX, node.offsetY) }));
    const operations = [...nodeMoves, ...selections.map((selection) => {
      if (selection.kind === "node") return null;
      if (selection.kind === "graph") {
        const graph = diagram?.layout?.groups.find((candidate) => candidate.id === selection.id);
        return graph && { line: graph.lineNumber, apply: (value) => setDeclarationOffsetField(value, graph.lineNumber, (graph.offsetX ?? 0) + change.dx, (graph.offsetY ?? 0) + change.dy) };
      }
      if (selection.kind === "line") {
        const edge = diagram?.layout?.edges.find((candidate) => candidate.from === selection.from && candidate.to === selection.to && candidate.lineNumber === selection.lineNumber);
        return edge && { line: edge.lineNumber, apply: (value) => setStructuralOffsetField(value, edge.lineNumber, (edge.labelOffsetX ?? 0) + change.dx, (edge.labelOffsetY ?? 0) + change.dy) };
      }
      return null;
    }).filter(Boolean)].sort((a, b) => b.line - a.line);
    operations.forEach((operation) => { nextSource = operation.apply(nextSource); });
    if (operations.length) setSource(nextSource);
    return;
  }
  if (change.kind === "graph") {
    setSource(setDeclarationOffsetField(source.value, change.lineNumber, nextX, nextY));
    return;
  }
  if (change.kind === "node") {
    applyNodePositions(independentMoveOffsets(diagram?.layout?.nodes ?? [], diagram?.layout?.edges ?? [], [change.id], change.dx, change.dy));
    return;
  }
  if (["node-label", "node-image"].includes(change.kind)) {
    const prefix = change.kind === "node" ? "offset" : change.kind === "node-image" ? "image-offset" : "label-offset";
    setSource(setNodeOffsetField(source.value, change.lineNumber, prefix, nextX, nextY));
    return;
  }
  if (change.kind === "node-image-resize") {
    const width = Math.max(1, change.currentWidth + change.dx * change.resizeX);
    const height = Math.max(1, change.currentHeight + change.dy * change.resizeY);
    const offsetX = change.currentX + (change.resizeX ? change.dx / 2 : 0);
    const offsetY = change.currentY + (change.resizeY ? change.dy / 2 : 0);
    setSource(setNodeImageGeometry(source.value, change.lineNumber, width, height, offsetX, offsetY));
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
  const selectedGraphIds = new Set(selections.filter((item) => item.kind === "graph").map((item) => item.id));
  const graphs = (diagram?.layout?.groups ?? []).filter((group) => selectedGraphIds.has(group.id)).map((group) => ({
    id: group.id, lineNumber: group.lineNumber, x: group.x, y: group.y, width: group.right - group.x,
    height: group.bottom - group.y, aboveHeight: 0, offsetX: group.offsetX ?? 0, offsetY: group.offsetY ?? 0,
  }));
  if (graphs.length) {
    let nextSource = source.value;
    if (action === "remove-offsets") {
      [...graphs].sort((a, b) => b.lineNumber - a.lineNumber).forEach((graph) => { nextSource = removeDeclarationField(nextSource, graph.lineNumber, "offset"); });
    } else if (graphs.length > 1) {
      [...arrangeNodeOffsets(graphs, action)].sort((a, b) => b.lineNumber - a.lineNumber)
        .forEach((graph) => { nextSource = setDeclarationOffsetField(nextSource, graph.lineNumber, graph.offsetX, graph.offsetY); });
    }
    setSource(nextSource);
    return;
  }
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
  const stem = pugFileName.replace(/\.pug$/i, "") || "Untitled";
  return `${stem}.${extension}`;
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
    applyCanvasZoom();
    paintSelections();
    renderInspector();
    status.textContent = "";
    status.className = "status ready";
  } catch (error) {
    status.textContent = error.message;
    status.className = "status error";
    canvas.classList.add("preview-invalid");
    canvas.dataset.error = "Preview paused — fix the source error";
  }
}

function setCanvasZoom(percent) {
  canvasZoomPercent = Math.max(25, Math.min(300, Math.round(percent / 5) * 5));
  if (![...canvasZoom.options].some((option) => Number(option.value) === canvasZoomPercent)) {
    canvasZoom.add(new Option(`${canvasZoomPercent}%`, String(canvasZoomPercent)));
  }
  canvasZoom.value = String(canvasZoomPercent);
  applyCanvasZoom();
}

function applyCanvasZoom() {
  const svg = canvas.querySelector("svg");
  if (!svg) return;
  const intrinsicWidth = Number(svg.getAttribute("width")) || 1;
  const intrinsicHeight = Number(svg.getAttribute("height")) || 1;
  svg.style.width = `${intrinsicWidth * canvasZoomPercent / 100}px`;
  svg.style.height = `${intrinsicHeight * canvasZoomPercent / 100}px`;
  svg.style.maxWidth = "none";
}

function fitCanvasZoom() {
  const svg = canvas.querySelector("svg");
  if (!svg) return;
  const width = Number(svg.getAttribute("width")) || 1;
  const height = Number(svg.getAttribute("height")) || 1;
  const availableWidth = Math.max(1, canvasShell.clientWidth - 70);
  const availableHeight = Math.max(1, canvasShell.clientHeight - 70);
  setCanvasZoom(Math.min(availableWidth / width, availableHeight / height) * 100);
}

function zoomCanvasAt(clientX, clientY, percent) {
  const svg = canvas.querySelector("svg");
  if (!svg || percent === canvasZoomPercent) return;
  const before = svg.getBoundingClientRect();
  const anchorX = before.width ? (clientX - before.left) / before.width : 0.5;
  const anchorY = before.height ? (clientY - before.top) / before.height : 0.5;
  setCanvasZoom(percent);
  const after = svg.getBoundingClientRect();
  canvasShell.scrollBy({
    left: after.left + after.width * anchorX - clientX,
    top: after.top + after.height * anchorY - clientY,
    behavior: "auto",
  });
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
  const indented = indentSourceSelection(source.value, source.selectionStart, source.selectionEnd, event.shiftKey);
  source.value = indented.value;
  source.setSelectionRange(indented.start, indented.end);
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
document.querySelector("#save-source").addEventListener("click", async () => {
  storeActiveDocument();
  const documents = [["pug", pugSource], ...(cssSource.trim() ? [["css", cssSource]] : [])];
  if (window.showDirectoryPicker) {
    try {
      const directory = await window.showDirectoryPicker({ mode: "readwrite" });
      for (const [extension, value] of documents) {
        const handle = await directory.getFileHandle(filename(extension), { create: true });
        const writable = await handle.createWritable();
        await writable.write(value);
        await writable.close();
      }
      status.textContent = `Saved ${documents.length === 1 ? "Pug" : "Pug and CSS"}`;
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  for (const [extension, value] of documents) {
    if (extension === "css" && !value.trim()) continue;
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([value], { type: "text/plain;charset=utf-8" }));
    anchor.download = filename(extension);
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  }
});
document.querySelector("#cleanup-diagram").addEventListener("click", cleanupDiagram);
canvasZoom.addEventListener("change", () => setCanvasZoom(Number(canvasZoom.value)));
document.querySelector("#zoom-out").addEventListener("click", () => setCanvasZoom(canvasZoomPercent - 25));
document.querySelector("#zoom-in").addEventListener("click", () => setCanvasZoom(canvasZoomPercent + 25));
document.querySelector("#zoom-fit").addEventListener("click", fitCanvasZoom);
canvasShell.addEventListener("wheel", (event) => {
  const mouseWheel = event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL
    || (Math.abs(event.deltaX) < 1 && Math.abs(event.deltaY) >= 80);
  if (!event.ctrlKey && !mouseWheel) return;
  event.preventDefault();
  const magnitude = event.ctrlKey ? Math.min(20, Math.max(5, Math.abs(event.deltaY) * 0.25)) : 10;
  zoomCanvasAt(event.clientX, event.clientY, canvasZoomPercent + (event.deltaY < 0 ? magnitude : -magnitude));
}, { passive: false });
document.querySelector("#add-diagram").addEventListener("click", () => openGraphBuilder("diagram"));
document.querySelector("#add-node").addEventListener("click", () => openGraphBuilder(currentGraph.nodes.length ? "flow" : "diagram"));
document.querySelector("#add-flow").addEventListener("click", () => openGraphBuilder("flow"));
document.querySelector("#add-merge").addEventListener("click", () => openGraphBuilder("merge", []));
const toolbarMenus = [...document.querySelectorAll(".new-menu")];
toolbarMenus.forEach((menu) => menu.addEventListener("click", (event) => {
  if (event.target.closest("button")) menu.open = false;
  else if (event.target.closest("summary")) toolbarMenus.filter((other) => other !== menu).forEach((other) => { other.open = false; });
}));
document.addEventListener("pointerdown", (event) => toolbarMenus.forEach((menu) => {
  if (menu.open && !menu.contains(event.target)) menu.open = false;
}));
document.querySelector("#undo-canvas").addEventListener("click", undoCanvas);
document.querySelector("#redo-canvas").addEventListener("click", redoCanvas);
document.querySelector(".preview").addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redoCanvas() : undoCanvas(); }
  else if (event.key.toLowerCase() === "y") { event.preventDefault(); redoCanvas(); }
});
document.querySelector("#close-inspector").addEventListener("click", () => { selections = []; paintSelections(); renderInspector(); });
document.querySelector("#delete-selection").addEventListener("click", deleteCanvasSelection);
inspectorContent.addEventListener("click", (event) => {
  if (event.target.matches("summary input[type='checkbox']")) event.stopPropagation();
  const graphMode = event.target.closest("[data-graph-add]")?.dataset.graphAdd;
  if (graphMode) {
    openGraphBuilder(graphMode, selectedNodes().map((node) => node.id));
    return;
  }
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
inspectorContent.addEventListener("toggle", syncInspectorScrollbarWidth, true);
graphBuilderForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const mode = graphBuilder.dataset.mode;
  const id = builderId.value.trim();
  const label = builderLabel.value.replace(/[\r\n]+/g, " ").trim();
  if (!/^[a-zA-Z][\w-]*$/.test(id)) {
    builderError.textContent = "ID must start with a letter and contain only letters, numbers, underscores, or hyphens.";
    return;
  }
  if (currentGraph.nodes.some((node) => node.id === id)) {
    builderError.textContent = `The ID “${id}” is already in use.`;
    return;
  }
  const options = {
    direction: document.querySelector("#builder-direction").value,
    ports: document.querySelector("#builder-ports").value,
    nodeType: builderNodeType.value,
    lineType: builderLineType.value,
    id,
    label,
    diagramId: builderDiagramId.value.trim(),
    diagramLabel: builderDiagramLabel.value.trim(),
    diagramFill: document.querySelector("#builder-diagram-fill").value.trim(),
    diagramOutline: document.querySelector("#builder-diagram-outline").value.trim(),
    parentGraphLineNumber: mode === "nested" ? Number(graphBuilder.dataset.parentGraphLine) : null,
  };
  let nextSource;
  if (mode === "merge") {
    options.sources = [...builderSources.querySelectorAll("input:checked")].map((input) => input.value);
    if (options.sources.length < 2) {
      builderError.textContent = "A merge needs at least two source nodes.";
      return;
    }
    nextSource = appendMergeNode(pugSource, currentGraph.nodes[0].lineNumber, options);
  } else if (mode === "flow") {
    const parent = currentGraph.nodes.find((node) => node.id === builderParent.value);
    if (!parent) {
      builderError.textContent = "Choose an existing parent node.";
      return;
    }
    nextSource = appendFlowNode(pugSource, parent.lineNumber, options);
  } else nextSource = appendDiagramNode(pugSource, options);
  graphBuilder.close();
  setSource(nextSource);
  selectCreatedNode(id);
});
nodeImageFile.addEventListener("change", () => {
  const file = nodeImageFile.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const imported = new Image();
    imported.onload = () => {
      let nextSource = source.value;
      [...selectedNodes()].sort((a, b) => b.lineNumber - a.lineNumber).forEach((node) => {
        nextSource = setNodeField(nextSource, node.lineNumber, "image", reader.result);
        nextSource = setNodeField(nextSource, node.lineNumber, "image-width", String(imported.naturalWidth));
        nextSource = setNodeField(nextSource, node.lineNumber, "image-height", String(imported.naturalHeight));
      });
      setSource(nextSource);
      nodeImageFile.value = "";
    };
    imported.src = reader.result;
  };
  reader.readAsDataURL(file);
});
inspectorContent.addEventListener("change", (event) => {
  const nodes = selectedNodes();
  const node = nodes[0];
  const graphField = event.target.dataset.graphField;
  if (graphField) {
    let nextSource = source.value;
    [...selections].filter((item) => item.kind === "graph").sort((a, b) => b.lineNumber - a.lineNumber)
      .forEach((selection) => { nextSource = setStructuralField(nextSource, selection.lineNumber, graphField, event.target.value); });
    setSource(nextSource);
    return;
  }
  if (event.target.matches("[data-graph-hidden]")) {
    let nextSource = source.value;
    [...selections].filter((item) => item.kind === "graph").sort((a, b) => b.lineNumber - a.lineNumber)
      .forEach((selection) => { nextSource = setStructuralField(nextSource, selection.lineNumber, "hidden", event.target.checked ? "" : "false"); });
    setSource(nextSource);
    return;
  }
  if (event.target.matches("[data-arrange-select]")) {
    if (event.target.value) arrangeSelection(event.target.value);
    return;
  }
  if (event.target.matches("[data-color-picker]")) {
    const textInput = inspectorContent.querySelector(`[data-color-text="${event.target.dataset.colorPicker}"]`);
    if (textInput) { textInput.value = event.target.value; textInput.dispatchEvent(new Event("change", { bubbles: true })); }
    return;
  }
  if (event.target.matches("[data-annotation-color-picker]")) {
    const input = inspectorContent.querySelector(`[data-annotation-line="${event.target.dataset.annotationColorPicker}"][data-annotation-style-field="color"]`);
    if (input) { input.value = event.target.value; input.dispatchEvent(new Event("change", { bubbles: true })); }
    return;
  }
  if (event.target.matches("[data-node-annotation-color-picker]")) {
    const position = event.target.dataset.nodeAnnotationColorPicker;
    const input = inspectorContent.querySelector(`[data-node-annotation-position="${position}"][data-node-annotation-field="color"]`);
    if (input) { input.value = event.target.value; input.dispatchEvent(new Event("change", { bubbles: true })); }
    return;
  }
  if (event.target.matches("[data-node-annotation-text]")) {
    setSource(setNodeAnnotationText(source.value, Number(event.target.dataset.nodeAnnotationLine), event.target.dataset.nodeAnnotationPosition, event.target.value));
    return;
  }
  if (event.target.matches("[data-node-annotation-field]")) {
    setSource(setNodeAnnotationField(source.value, Number(event.target.dataset.nodeAnnotationLine), event.target.dataset.nodeAnnotationPosition, event.target.dataset.nodeAnnotationField, event.target.value));
    return;
  }
  if (event.target.matches("[data-node-annotation-hidden]")) {
    const annotationLine = Number(event.target.dataset.annotationLine);
    const nextSource = event.target.checked
      ? setNodeAnnotationField(source.value, Number(event.target.dataset.nodeAnnotationLine), event.target.dataset.nodeAnnotationPosition, "hidden", "")
      : annotationLine > 0 ? removeDeclarationField(source.value, annotationLine, "hidden") : source.value;
    if (nextSource !== source.value) setSource(nextSource);
    return;
  }
  if (event.target.matches("[data-node-annotations-hidden]")) {
    let nextSource = source.value;
    [...nodes[0].annotations].sort((a, b) => b.lineNumber - a.lineNumber).forEach((annotation) => {
      nextSource = event.target.checked
        ? setStructuralField(nextSource, annotation.lineNumber, "hidden", "")
        : removeDeclarationField(nextSource, annotation.lineNumber, "hidden");
    });
    if (nextSource !== source.value) setSource(nextSource);
    return;
  }
  if (event.target.matches("[data-annotation-text]")) {
    setSource(setAnnotationText(source.value, Number(event.target.dataset.annotationText), event.target.value));
    return;
  }
  if (event.target.matches("[data-annotation-style-field]")) {
    setSource(setStructuralField(source.value, Number(event.target.dataset.annotationLine), event.target.dataset.annotationStyleField, event.target.value));
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
  if (event.target.matches("[data-node-hidden]")) {
    let nextSource = source.value;
    [...nodes].sort((a, b) => b.lineNumber - a.lineNumber).forEach((selected) => {
      nextSource = event.target.checked ? setNodeField(nextSource, selected.lineNumber, "hidden", "") : removeNodeField(nextSource, selected.lineNumber, "hidden");
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
  const annotationField = event.target.dataset.annotationField;
  if (annotationField) {
    let nextSource = source.value;
    [...selections].filter((item) => item.kind === "annotation").sort((a, b) => b.lineNumber - a.lineNumber)
      .forEach((selection) => { nextSource = setStructuralField(nextSource, selection.lineNumber, annotationField, event.target.value); });
    setSource(nextSource);
    return;
  }
  const nodeField = event.target.dataset.nodeField;
  if (nodeField && node) {
    if (!event.target.value && nodeField !== "label") return;
    let nextSource = source.value;
    [...nodes].sort((a, b) => b.lineNumber - a.lineNumber).forEach((selected) => {
      nextSource = setNodeField(nextSource, selected.lineNumber, nodeField, event.target.value);
    });
    setSource(nextSource);
    return;
  }
  const lineField = event.target.dataset.lineField;
  if (event.target.matches("[data-line-hidden], [data-line-annotation-hidden], [data-line-annotations-hidden]")) {
    const fields = event.target.matches("[data-line-hidden]")
      ? ["hidden"]
      : event.target.matches("[data-line-annotations-hidden]")
        ? ["annotation-above-hidden", "annotation-below-hidden"]
        : [event.target.dataset.lineAnnotationHidden];
    const operations = selections.filter((item) => item.kind === "line").map((item) => {
      const selectedEdge = diagram.layout.edges.find((candidate) => candidate.from === item.from && candidate.to === item.to);
      const target = currentGraph.nodes.find((candidate) => candidate.id === selectedEdge.to);
      return { edge: selectedEdge, lineNumber: selectedEdge.kind === "branch" ? target.lineNumber : selectedEdge.lineNumber };
    }).sort((a, b) => b.lineNumber - a.lineNumber);
    let nextSource = source.value;
    operations.forEach(({ edge: selectedEdge, lineNumber }) => {
      fields.forEach((field) => {
        const sourceField = `line.${field}`;
        nextSource = event.target.checked
          ? selectedEdge.kind === "branch" ? setNodeField(nextSource, lineNumber, sourceField, "") : setStructuralField(nextSource, lineNumber, sourceField, "")
          : selectedEdge.kind === "branch" ? removeNodeField(nextSource, lineNumber, sourceField) : removeDeclarationField(nextSource, lineNumber, sourceField);
      });
    });
    setSource(nextSource);
    return;
  }
  if (event.target.matches("[data-line-type]")) {
    const lineType = event.target.value;
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
  const files = [...(sourceFile.files ?? [])];
  if (!files.length) return;
  const pug = files.find((file) => file.name.toLowerCase().endsWith(".pug"));
  const css = files.find((file) => file.name.toLowerCase().endsWith(".css"));
  if (pug) pugSource = await pug.text();
  if (pug) pugFileName = pug.name;
  if (css) { cssSource = await css.text(); cssFileName = css.name; }
  canvasUndo = [];
  canvasRedo = [];
  selections = [];
  updateSourceFileNames();
  source.value = activeDocument === "pug" ? pugSource : cssSource;
  highlightSource();
  update();
  sourceFile.value = "";
});
document.querySelector("#copy-png").addEventListener("click", async () => {
  if (!diagram) return;
  try {
    const png = await diagram.toPNGBlob(PNG_COPY_SCALE);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    showCanvasToast("PNG copied to clipboard");
  } catch (error) {
    status.textContent = `Could not copy PNG: ${error.message}`;
  }
});
const saveExportDialog = document.querySelector("#save-export-dialog");
const saveExportFormat = document.querySelector("#save-export-format");
const saveExportDpiRow = document.querySelector("#save-export-dpi-row");
const saveExportDpi = document.querySelector("#save-export-dpi");
document.querySelector("#open-save-export").addEventListener("click", () => saveExportDialog.showModal());
saveExportFormat.addEventListener("change", () => { saveExportDpiRow.hidden = saveExportFormat.value !== "png"; });
document.querySelector("#save-export-form").addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel" || !diagram) return;
  event.preventDefault();
  if (saveExportFormat.value === "svg") diagram.saveSVG(filename("svg"));
  else diagram.savePNG(filename("png"), Number(saveExportDpi.value) / 96);
  saveExportDialog.close();
});

updateSourceFileNames();
highlightSource();
update();
