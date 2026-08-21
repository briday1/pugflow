# Pugflow

A source-first diagram editor and command-line renderer. Diagrams stay editable as readable `.pug` files, reusable presentation can live in a `.css` file, and SVG/PNG are export formats.

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

The editor has `diagram.pug` and `styles.css` tabs with matching Load and Save actions. Reusable styles use CSS-shaped rules:

```css
@node card {
  shape: rounded;
  fill: #ffffff;
  outline: #94a3b8;
}

@line warning {
  color: #dc2626;
  stroke-style: dashed;
}
```

The editor opens as a blank `#canvas`; use `pugflow --demo` for the full feature tour. It provides live rendering, line numbers, highlighting, completions, **Open Pug/CSS…**, **Save Pug + CSS**, high-DPI PNG clipboard copying, and a Save dialog for PNG or SVG export. A project requires one Pug file. CSS is optional unless the Pug uses custom classes such as `.card`; select both files in the Open dialog or add the CSS afterward. Each source tab shows its loaded filename. Source is not stored in the browser.

Drag the divider beside the source panel to resize it; the width is remembered.
Click any visible block in the preview to focus and select its corresponding source line.
Enable **Vim** beside the editor actions for Normal, Insert, and Visual modes. It starts off on every launch and supports standard movement, editing, yanking, pasting, marks, and undo/redo commands. Escape, Ctrl+[ and Ctrl+C return to Normal mode.

## Basic Pug definition

```pug
#canvas
  graph
    .id main
    .node
      .id root
      .label Root
      .node
        .line
          .arrow-style forward
        .id left
        .label Left path
      .node
        .id right
        .label Right path
```

The common structure is intentionally small:

- `#canvas` contains one or more sibling or nested `graph` components.
- Each `graph` has exactly one root node and defines one connected flow.
- Sibling graphs are disconnected unless an explicit `.connect` crosses their boundaries.
- Nodes nested directly inside another node become its children.
- A child node's `.line` group styles its incoming connector.
- Multiple directly nested nodes form a concise one-step fanout.
- Put sibling nodes inside one `.flow` when they should form a sequence; use multiple `.flow` groups for multiple paths.
- Blank lines and `//` comment lines are ignored.

For a long pipeline, `.flow` avoids progressively deeper indentation:

```pug
.node
  .label Start
  .flow
    .node
      .label Validate
    .node
      .label Transform
    .node
      .label Publish
```

This creates `Start -> Validate -> Transform -> Publish`. A line group or reusable line class inside each flow node styles the connector entering that node.

Flows and merges accept `.direction right`, `.direction left`, `.direction up`, or `.direction down`. Multiple flows may start at the same node—even in the same direction. The layout assigns competing paths separate lanes so their nodes do not overlap. Arrowheads are controlled independently with `.arrow-style`.

```pug
.node
  .label Dispatcher
  .flow
    .direction right
    .node
      .label Main work
  .flow
    .direction down
    .node
      .label Audit work
```

A leftward `.merge` provides a feedback-style route while retaining the same source/target merge semantics.

Flows and merges also accept `.ports shared` or `.ports distributed`. Shared ports attach every connection at the center of the relevant node face. Distributed ports space the connections uniformly across that face. Both default to shared ports.

```pug
.flow
  .direction right
  .ports distributed

.merge
  .direction right
  .ports shared
```

## Reusable style classes

Define a styled node type above `#canvas`, then use its name anywhere you would normally use `node`. It inherits the canvas node defaults and overrides only the fields in its definition.

```pug
@node my_node
  .shape pill
  .fill #245886
  .color #ffffff

@line warning_line
  .color #ef4444
  .stroke-style dashed

@annotation warning_note
  .color #f59e0b

#canvas
  .defaults
    .node
      .outline #111111
  graph
    .my_node
      .id root
      .label Reusable styled node
      .annotation
        .above
          .warning_note
          | Styled annotation
      .node
        .warning_line
        .label Child
```

Reusable node definitions create classes such as `.my_node`; reusable line and annotation definitions create decorators such as `.warning_line` and `.warning_note`. Local fields override the reusable style. Names must be unique across node, line, and annotation definitions.

Nested syntax is the canonical form because related fields stay together. Compact selectors such as `node.label Child` remain accepted as shorthand.

The complete original definition is preserved in [examples/original.pug](examples/original.pug).

## Merge paths

Give source blocks IDs, then reference them from `.source` lines:

```pug
#canvas
  graph
    .node
      .label Root
      .node
        .id api
        .label API
      .node
        .id cache
        .label Cache
      .merge
        .source
          .ref api
          .line
            .label live
        .source
          .ref cache
          .line
            .label hit
        .node
          .id result
          .label Result
          .annotation
            .above Paths converge here
          .shape hexagon
          .node
            .label Next block
```

For a compact merge, put `.from api cache` under `.merge`. Terminal merge sources are aligned on a pre-merge frontier when space permits, while nodes that continue another flow retain their established position. Merge paths use straight segments with rounded 90-degree bends and the merge color. See [examples/flow-and-merge.pug](examples/flow-and-merge.pug).

Use `.connect` when both endpoint nodes already exist, including feedback paths:

```pug
.connect
  .from archived
  .from-direction left
  .to styled-text
  .to-direction up
  .ports shared
  .line
    .label feedback
```

The source and target must have explicit `.id` fields and must appear before the connection declaration. `.from-direction` controls how the line leaves the source; `.to-direction` independently controls how it enters the target.

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
    .line
      .color #303030
    .annotation
      .color #606060
  graph
    .node
      .label Root
```

`.background` and `.font` belong directly to `#canvas`. Reusable node, line, and annotation defaults are grouped under `.defaults`. Style a particular merge through the `.line` group inside that `.merge`; fields closer to an object override inherited defaults.

## Block options

Node identity, text, layout, and appearance use separate readable fields. For easy scanning, keep them in that order:

```pug
.node
  .id service
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

Click a block, block label, annotation, connection, or connection label in the preview to select its exact declaration in the editor. Drag boxes and text when the automatic result needs a visual nudge; the editor writes the resulting offsets back into the source. A translucent ghost marks the original position while dragging. Hold Shift to constrain movement to the dominant horizontal or vertical axis.

Selecting a node or connector also opens the canvas inspector. Ctrl-click (Cmd-click on macOS) toggles additional nodes or connectors into the selection. The inspector can apply shared node or line properties, switch to any `@node` type defined in the source, remove offsets, align node centers/middles, and distribute selected nodes horizontally or vertically. Every inspector operation edits the Pug source directly.

Use **+ New node** above the canvas to build the graph without hand-writing its initial structure. A flow creates a new node from one chosen parent with direction, port distribution, node type, and optional line type. **Add flow** in a selected node's inspector opens the same builder with that node preselected. **Add merge** uses two or more selected/chosen source IDs and creates a new merge target. These actions insert ordinary Pug; the source remains the single editable representation.

- Dragging a box writes `.offset (x, y)` inside its node.
- Dragging its label writes `.label-offset (x, y)` inside its node.
- Dragging an image inside a node writes `.image-offset (x, y)` without moving the node.
- Dragging a block annotation writes an indented `.offset (x, y)` field.
- Dragging a connection label writes `.label-offset (x, y)` inside its node's or source's `.line` group.

Offsets affect only the rendered position. The node's automatic layout slot remains fixed.

Use **Clean up** above the canvas after manual positioning to straighten small connector jogs. It snaps nearly aligned flow nodes (within 12 pixels) to a shared centerline and writes the corrected `.offset` tuples back into the source. Larger offsets are treated as intentional and remain unchanged.

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

## Connections, arrows, and line annotations

Set connector properties in a flow's `.line` group. Override an incoming connector with a `.line` group inside its destination node. Merge sources work the same way. Use a reusable `@line` class when several flows need identical styling.

```pug
.flow
  .line
    .arrow-style forward
    .color #ffffff
  .node
    .line
      .arrow-style both
      .stroke-style dashed
      .width 3
      .annotation-above synchronizes
      .annotation-below retry path
    .label Peer
```

| Field | Values |
| --- | --- |
| `.arrow-style` | `forward` (default), `backward`, `both`, `none` |
| `.color` | Any SVG/CSS color |
| `.stroke-style` | `solid`, `dashed`, `dotted` |
| `.width` | Positive number |
| `.annotation-above` | Annotation above the connector |
| `.annotation-below` | Annotation below the connector |
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
