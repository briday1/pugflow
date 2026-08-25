# Pugflow

A source-first diagram editor and command-line renderer. Diagrams stay editable as readable `.pug` files, reusable presentation can live in a `.css` file, and SVG/PNG are export formats.

**[Try the online editor on GitHub Pages →](https://briday1.github.io/pugflow/)**

## Install as a Python application

For development, install the checkout in editable mode:

```powershell
python -m pip install -e .
pugflow
```

The installed command opens the editor. Add `--vim` to begin in Vim mode:

```powershell
python -m pugflow --vim
```

The server opens <http://127.0.0.1:4173> automatically. Examples of server options:

```powershell
pugflow --no-browser
pugflow --host 0.0.0.0 --port 8080 --vim
pugflow --demo
pugflow --gui diagram.pug --css diagram.css
pugflow --version
```

Render directly from the command line. Pugflow uses an installed Edge, Chrome, or Chromium browser for exact parity with the editor; set `PUGFLOW_BROWSER` when it is not discovered automatically.

```powershell
pugflow diagram.pug
pugflow diagram.pug --css styles.css --output diagram.png --scale 2
```

`GET /healthz` returns server status and version as JSON.

The compact application toolbar groups source and export actions under **File**, canvas creation under **New**, and theme and Vim controls under **Settings**. Click **Pugflow** for the installed version and links to the repository, PyPI, and documentation. Reusable styles use CSS-shaped rules:

```css
@node card {
  shape: rounded;
  fill: #ffffff;
  outline: #94a3b8;
}

@flow warning {
  color: #dc2626;
  stroke-style: dashed;
}
```

The editor opens as a blank `#canvas`; use `pugflow --demo` for the full feature tour. It provides live rendering, line numbers, highlighting, completions, a **File** menu for new/open/save actions using system files, a collapsible source panel, high-DPI PNG clipboard copying, and image export dialogs. A project requires one Pug file. CSS is optional unless the Pug uses custom classes such as `.card`; select both files in the Open dialog or create CSS from the File menu. Each source tab shows its loaded filename. Source is not stored in the browser.

Drag the divider beside the source panel to resize it; the width is remembered.
Click any visible block in the preview to focus and select its corresponding source line.
Enable **Vim mode** from **Settings** for Normal, Insert, and Visual modes. It starts off on every launch and supports standard movement, editing, yanking, pasting, marks, and undo/redo commands. Escape, Ctrl+[ and Ctrl+C return to Normal mode.

## Basic Pug definition

```pug
#canvas
  graph
    .id main
    .node
      .id root
      .label Root
    .node
      .id left
      .label Left path
    .node
      .id right
      .label Right path
    .flow
      .from root
      .to left
      .arrow-style forward
    .flow
      .from root
      .to right
```

The common structure is intentionally small:

- `#canvas` contains one or more sibling `graph` components. Graphs never nest.
- Nodes are declared directly inside their graph and have explicit IDs when flows reference them.
- Every connection is an explicit `.flow` with `.from` and `.to`.
- Put a flow inside a graph when both endpoints belong to that graph. Put cross-graph flows directly under `#canvas`.
- Flow style fields such as `.color`, `.label`, and `.arrow-style` are direct children of `.flow`; there is no nested `.line` group.
- Blank lines and `//` comment lines are ignored.

For a long pipeline, declare each node and each connection at graph level:

```pug
graph
  .node
    .id start
    .label Start
  .node
    .id validate
    .label Validate
  .node
    .id publish
    .label Publish
  .flow
    .from start
    .to validate
  .flow
    .from validate
    .to publish
```

This creates `Start -> Validate -> Publish`. A reusable flow class or local fields on each `.flow` style the connector.

Flows accept `.direction right`, `.direction left`, `.direction up`, or `.direction down`. Multiple flows may start at the same node—even in the same direction. Multiple outgoing flows are rendered as branches and multiple incoming flows are rendered as a merge. The layout assigns competing paths separate lanes so their nodes do not overlap. Arrowheads are controlled independently with `.arrow-style`.

```pug
graph
  .node
    .id dispatcher
    .label Dispatcher
  .node
    .id main
    .label Main work
  .node
    .id audit
    .label Audit work
  .flow
    .from dispatcher
    .to main
    .direction right
  .flow
    .from dispatcher
    .to audit
    .direction down
```

Each node face accepts its own port setting: `.top-ports`, `.right-ports`, `.bottom-ports`, and `.left-ports`. Use `shared` (the default) to attach connections at the face center or `distributed` to space them uniformly.

```pug
.node
  .id source-id
  .right-ports distributed
  .label Source
```

## Reusable style classes

Define a styled node type above `#canvas`, then apply it by nesting its class inside a `.node` declaration, exactly as flows nest `.warning_flow` inside `.flow`. It inherits the canvas node defaults and overrides only the fields in its definition. The older form, which used the class name itself as the declaration keyword (`.my_node` directly inside `graph`), still parses so existing documents keep working.

```pug
@node my_node
  .shape pill
  .fill #245886
  .color #ffffff

@flow warning_flow
  .color #ef4444
  .stroke-style dashed

@annotation warning_note
  .color #f59e0b

#canvas
  .defaults
    .node
      .outline #111111
  graph
    .node
      .my_node
      .id root
      .label Reusable styled node
      .annotation
        .above
          .warning_note
          | Styled annotation
    .node
      .id child
      .label Child
    .flow
      .from root
      .to child
      .warning_flow
```

Reusable node definitions create classes such as `.my_node`; reusable flow and annotation definitions create decorators such as `.warning_flow` and `.warning_note`. Nest the class inside `.node`, `.flow`, or the annotation entry it styles. Local fields override the reusable style, and fields nested under the class itself (for example `.my_node` followed by an indented `.fill #ff0000`) override it too. Names must be unique across node, flow, and annotation definitions.

The complete original definition is preserved in [examples/original.pug](examples/original.pug).

## ID-based flows

Give nodes IDs, then use the same `.flow` keyword for convergence, feedback, cross-graph links, or a target that appears later in the source:

```pug
#canvas
  graph
    .node
      .id api
      .label API
    .node
      .id cache
      .label Cache
    .node
      .id result
      .label Result
      .annotation
        .above Paths converge here
      .shape hexagon
    .flow
      .from api
      .to result
      .label live
    .flow
      .from cache
      .to result
      .label hit
```

The parser resolves `.from` and `.to` after reading all nodes, so either endpoint may appear before or after the flow declaration. When several flows share a target, Pugflow automatically applies convergence layout and distributed merge routing.

For a feedback path, specify the endpoint directions independently:

```pug
.flow
  .from archived
  .from-direction left
  .to styled-text
  .to-direction up
  .label feedback
```

The source and target must have explicit `.id` fields, but may appear before or after the flow declaration. `.from-direction` controls how the flow leaves the source; `.to-direction` independently controls how it enters the target.

## Figure defaults

Pugflow has a small built-in rendering theme: white background with black blocks, text, annotations, and connections. Project CSS is optional and additive. Put per-document defaults on `#canvas`:

```pug
#canvas
  .background #fffaf0
  .font Arial
  .defaults
    .node
      .shape rounded
      .fill #ffffff
      .color #202020
      .outline-width 2
      .align center
    .flow
      .color #303030
    .annotation
      .color #606060
  graph
    .node
      .label Root
```

`.background` and `.font` belong directly to `#canvas`. Reusable node, flow, and annotation defaults are grouped under `.defaults`. Direct fields on a `.flow` override inherited defaults.

## Block options

Node identity, text, layout, and appearance use separate readable fields. For easy scanning, keep them in that order:

```pug
.node
  .id service
  .layer 1
  .label
    | Service name
    | A clear multiline description
  .width 220
  .height auto
  .align left
  .shape pill
  .fill #1e4f7a
  .color #ffffff
  .outline #93c5fd
  .outline-style dashed
  .outline-width 3
```

Supported options:

| Field | Values |
| --- | --- |
| `.id` | A letter followed by letters, numbers, `_`, or `-` |
| `.layer` | Optional integer override; otherwise declaration order sets stacking within the graph |
| `.label` | Inline text, or indented `|` lines for explicit multiline text |
| `.shape` | `square`, `round`, `rounded`, `pill`, `diamond`, `hexagon` |
| `.fill`, `.color`, `.outline` | Any SVG/CSS color |
| `.outline-style` | `solid`, `dashed`, `dotted` |
| `.outline-width` | Number, in SVG pixels |
| `.width`, `.height` | Number or `auto` |
| `.align` | `left`, `center`, `right` |

Auto-sized blocks measure their content, wrap long labels, and grow vertically. Indented `|` lines create intentional line breaks and keep longer descriptions readable in the source. The old escaped-`\n` form is not supported.

## Block annotations

Place any number of annotations above or below a node:

```pug
.node
  .label Controller
  .annotation
    .above
      .color #bfdbfe
      | Control plane
      | Handles orchestration
    .below Optional subsystem
```

## Hide items without changing layout

Add `.hidden` beside the node's other fields:

```pug
.node
  .annotation
    .above Removed in the after diagram
  .id legacy
  .hidden
  .label Legacy service
```

The block still participates in measurement and layout, so every other block keeps the exact same position. The hidden block, its annotations, and all incoming/outgoing connections (including their labels and arrowheads) are omitted.

## Click, locate, and manually offset

Click a block, block label, annotation, connection, or connection label in the preview to select its exact declaration in the editor. Drag boxes and text when the automatic result needs a visual nudge; the editor writes the resulting offsets back into the source. A translucent ghost marks the original position while dragging. Hold Cmd on macOS or Ctrl on other platforms to constrain movement to the dominant horizontal or vertical axis; Shift remains supported as an alternative.

Selecting a node or flow also opens the canvas inspector. Ctrl-click (Cmd-click on macOS) toggles additional items into the selection. The inspector shows only controls applicable to every selected item. Every inspector operation edits the Pug source directly.

Graphs are packed without overlap by default. Graph titles support `.label-position inside|outside`, `.align left|center|right`, `.color`, and the standard font fields. Use `.x-spacing` and `.y-spacing` to tune a graph's layout. Drag a graph to write its `.offset`; explicit offsets may overlap graph frames. Set `.layer 1` (or any integer) in source, use the inspector's **Graph Layer** selector, or reorder graphs in the collapsible **Graphs** section of the right-side **Graphs** panel. Higher layers render in front and equal layers retain source order. A flow renders at the higher layer of its two endpoint graphs, so it remains visible over both endpoints but may be obscured by an unrelated graph on a higher layer. Choose a graph in that panel to browse its nodes and flows; selecting an item opens its normal property inspector. The node list is ordered front to back. Initially, node declaration order determines that stacking without adding `.layer` fields. Dragging nodes or using **Node Layer** to send selected nodes to the front or back persists explicit `.layer` values in the source.

The **Node** builder adds an independent node to the chosen graph. The **Flow** builder places graph-filtered **From** and **To** endpoints side by side with independent directions.

Use **+ New** above the canvas to add a Graph, Node, or Flow without hand-writing its initial structure. Branching, merging, and feedback are inferred from explicit flows. **Add Connected Node** in a selected node's inspector creates and connects a new node above, below, left, or right; **Add Flow** connects existing nodes. These actions insert ordinary Pug; the source remains the single editable representation.

- Dragging a box writes `.offset (x, y)` inside its node.
- Dragging its label writes `.label-offset (x, y)` inside its node.
- Dragging an image inside a node writes `.image-offset (x, y)` without moving the node.
- Dragging a block annotation writes an indented `.offset (x, y)` field.
- Dragging a flow label writes `.label-offset (x, y)` directly inside its `.flow` declaration.

Offsets affect only the rendered position. The node's automatic layout slot remains fixed.

Use **Clean up** above the canvas after manual positioning to align connected flow nodes and collapse unnecessary bends. It writes corrected `.offset` tuples back into the source without changing flow faces or moving untouched sibling branches.

Nodes support SVG drop shadows through `.shadow-color`, `.shadow-offset-x`, `.shadow-offset-y`, `.shadow-blur`, and `.shadow-opacity`. A shadow is enabled when `shadow-color` is present; these fields work in `@node` definitions, diagram defaults, local nodes, and the canvas inspector.

Nodes can contain a clipped image using `.image`, with `.image-width`, `.image-height`, `.image-fit` (`contain`, `cover`, or `fill`), `.image-opacity`, and `.image-offset`. These fields work in reusable `@node` styles and in the canvas inspector. Relative paths and same-origin URLs export reliably to PNG; remote images require the image server to allow cross-origin canvas use. SVG exports retain the image URL.

```pug
.node
  .image photos/sample.png
  .image-width 72
  .image-height 72
  .image-fit cover
  .label Profile
```

## Flows, arrows, and annotations

Set appearance and annotation properties directly on a `.flow`. Use a reusable `@flow` class when several flows need identical styling.

```pug
.flow
  .from service-a
  .to service-b
  .arrow-style both
  .stroke-style dashed
  .color #ffffff
  .width 3
  .annotation-above synchronizes
  .annotation-below retry path
```

| Field | Values |
| --- | --- |
| `.arrow-style` | `forward` (default), `backward`, `both`, `none` |
| `.color` | Any SVG/CSS color |
| `.stroke-style` | `solid`, `dashed`, `dotted` |
| `.width` | Positive number |
| `.annotation-above` | Annotation above the flow |
| `.annotation-below` | Annotation below the flow |
| `.annotation-above-hidden`, `.annotation-below-hidden` | Hide either annotation independently |
| `.label-offset` | Manual `(x, y)` offset |

## Math

Use `$...$` for inline math and `$$...$$` for a display equation on its own line. Pugflow uses a bundled MathJax renderer to produce real TeX as SVG paths, including in nodes, node annotations, and connection annotations. Equation dimensions participate in node sizing and diagram layout, and SVG/PNG/CLI exports remain self-contained and offline.

```pug
.node
  .label Transfer $x_i^2 \\rightarrow y_i$
```

Display math can be mixed with ordinary multiline labels:

```pug
.label
  | Quadratic formula
  | $$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$
```

## Embed in another page

Copy the files in `src/pugflow/web/`, then:

```html
<link rel="stylesheet" href="./pugflow.css">
<div id="diagram"></div>

<script type="module">
  import { createBlockDiagram } from "./pugflow.mjs";

  const source = `#canvas
    graph
      .node
        .label Root
      .flow
        .node
          .label Child`;

  const diagram = createBlockDiagram(document.querySelector("#diagram"), source);
  diagram.render(updatedSource);
  diagram.saveSource("architecture.pug");
  diagram.saveSVG("architecture.svg");
  await diagram.savePNG("architecture.png", 2);
</script>
```

The returned object exposes `render(source)`, `toSVGString()`, `saveSource(filename)`, `saveSVG(filename)`, and `savePNG(filename, scale)`.

## Theme and layout

Saved Pug figure defaults are usually the most portable option. You can still override CSS properties on the diagram container for an embedded diagram:

```css
#diagram {
  --diagram-background: #2e6ba7;
  --diagram-label: #eee9dc;
  --diagram-text: #eee9dc;
  --diagram-merge: #ffd166;
  --diagram-annotation: #dbeafe;
  --diagram-font: Verdana, sans-serif;
}
```

Pass layout spacing when creating the diagram:

```js
createBlockDiagram(element, source, {
  layout: { horizontalGutter: 120, verticalGutter: 36, padding: 60 },
});
```

## Project layout

```text
src/pugflow/
  cli.py                 Python command-line interface
  server.py              HTTP server and health endpoint
  web/                   Browser application and reusable ES modules
tests/
  python/                Server tests
  js/                    Parser, layout, and math tests
examples/                Loadable Pug diagram definitions
dist/                    Generated PyInstaller output (gitignored)
```

The browser source under `web/` is package data and is served directly as ES modules. There is no generated JavaScript bundle or frontend build step.

## Build a standalone executable

The included PyInstaller spec embeds the web frontend alongside the Python server:

```powershell
python -m pip install pyinstaller
pyinstaller pugflow.spec
```

The resulting `dist/pugflow.exe` runs the same web application and opens it in the default browser. PyInstaller is a build-time dependency only; it is not required by the installed application.

## Tests

```powershell
node --test tests/js
python -m unittest tests.python.test_server -v
```

The optional JavaScript tests use the Node.js 18+ built-in runner directly; no npm project or packages are involved. Python server tests use only the standard library. The application itself has no third-party runtime dependencies.
