export const DEFAULT_LAYOUT = Object.freeze({
  horizontalGutter: 100,
  verticalGutter: 28,
  padding: 54,
});

const VECTORS = Object.freeze({
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
});

function cellKey(x, y) {
  return `${x},${y}`;
}

function alternateOffset(attempt) {
  if (!attempt) return 0;
  const distance = Math.ceil(attempt / 2);
  return attempt % 2 ? distance : -distance;
}

function freeCell(origin, direction, occupied) {
  const vector = VECTORS[direction] ?? VECTORS.right;
  const base = { x: origin.x + vector.x, y: origin.y + vector.y };
  return freeCandidate(base, direction, occupied);
}

function freeCandidate(base, direction, occupied) {
  const vector = VECTORS[direction] ?? VECTORS.right;
  for (let attempt = 0; ; attempt += 1) {
    const offset = alternateOffset(attempt);
    const candidate = vector.x
      ? { x: base.x, y: base.y + offset }
      : { x: base.x + offset, y: base.y };
    if (!occupied.has(cellKey(candidate.x, candidate.y))) return candidate;
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function alignTerminalMergeSources(positions, edges) {
  const occupied = new Set([...positions.values()].map((position) => cellKey(position.x, position.y)));
  const groups = new Map();
  edges.forEach((edge) => {
    if (edge.kind !== "merge") return;
    const key = `${edge.to}|${edge.layoutDirection ?? "right"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge);
  });
  groups.forEach((group) => {
    const direction = group[0].layoutDirection ?? "right";
    const vector = VECTORS[direction];
    const target = positions.get(group[0].to);
    if (!target) return;
    const frontier = { x: target.x - vector.x, y: target.y - vector.y };
    group.forEach((edge) => {
      const source = positions.get(edge.from);
      const continuesFlow = edges.some((candidate) => candidate.from === edge.from && candidate.kind !== "merge");
      if (!source || continuesFlow) return;
      const distanceToFrontier = (frontier.x - source.x) * vector.x + (frontier.y - source.y) * vector.y;
      if (distanceToFrontier <= 0) return;
      occupied.delete(cellKey(source.x, source.y));
      const position = freeCandidate(frontier, direction, occupied);
      positions.set(edge.from, position);
      occupied.add(cellKey(position.x, position.y));
    });
  });
  return positions;
}

function assignConnectionPorts(edges, cells) {
  const groups = new Map();
  edges.forEach((edge, sourceOrder) => {
    const endpoint = edge.kind === "merge" ? edge.to : edge.from;
    const key = `${edge.kind}|${endpoint}|${edge.layoutDirection ?? "right"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ edge, sourceOrder });
  });
  const assignments = new Map();
  groups.forEach((group) => {
    const direction = group[0].edge.layoutDirection ?? "right";
    const vertical = direction === "up" || direction === "down";
    group.sort((a, b) => {
      const aCell = cells.get(a.edge.kind === "merge" ? a.edge.from : a.edge.to);
      const bCell = cells.get(b.edge.kind === "merge" ? b.edge.from : b.edge.to);
      const perpendicular = vertical ? aCell.x - bCell.x : aCell.y - bCell.y;
      if (perpendicular) return perpendicular;
      const along = vertical ? aCell.y - bCell.y : aCell.x - bCell.x;
      if (along) return ["left", "up"].includes(direction) ? -along : along;
      return a.sourceOrder - b.sourceOrder;
    });
    group.forEach(({ edge }, index) => {
      const distributed = edge.portDistribution === "distributed";
      const fraction = distributed ? (index + 1) / (group.length + 1) - 0.5 : 0;
      assignments.set(edge, edge.kind === "merge"
        ? { mergePortIndex: index, mergePortCount: group.length, targetPortFraction: fraction }
        : { branchPortIndex: index, branchPortCount: group.length, sourcePortFraction: fraction });
    });
  });
  return edges.map((edge) => ({ ...edge, ...(assignments.get(edge) ?? {}) }));
}

function assignCells(nodes, edges) {
  const positions = new Map();
  const occupied = new Set();
  const first = nodes[0];
  if (first) {
    positions.set(first.id, { x: 0, y: 0 });
    occupied.add(cellKey(0, 0));
  }

  // Edges are emitted in source order. Repeated passes let merges and mixed
  // directions settle once their source has been placed.
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      const from = positions.get(edge.from);
      if (!from || positions.has(edge.to)) continue;
      if (edge.kind === "merge") {
        const incoming = edges.filter((candidate) => candidate.kind === "merge" && candidate.to === edge.to);
        const sources = incoming.map((candidate) => positions.get(candidate.from));
        if (sources.some((position) => !position)) continue;
        const direction = edge.layoutDirection ?? "right";
        const base = direction === "left"
          ? { x: Math.min(...sources.map((position) => position.x)) - 1, y: median(sources.map((position) => position.y)) }
          : direction === "right"
            ? { x: Math.max(...sources.map((position) => position.x)) + 1, y: median(sources.map((position) => position.y)) }
            : direction === "up"
              ? { x: median(sources.map((position) => position.x)), y: Math.min(...sources.map((position) => position.y)) - 1 }
              : { x: median(sources.map((position) => position.x)), y: Math.max(...sources.map((position) => position.y)) + 1 };
        const position = freeCandidate(base, direction, occupied);
        positions.set(edge.to, position);
        occupied.add(cellKey(position.x, position.y));
        changed = true;
        continue;
      }
      const position = freeCell(from, edge.layoutDirection, occupied);
      positions.set(edge.to, position);
      occupied.add(cellKey(position.x, position.y));
      changed = true;
    }
  }

  // Defensive placement for disconnected source fragments.
  let orphanRow = 0;
  for (const node of nodes) {
    if (positions.has(node.id)) continue;
    while (occupied.has(cellKey(0, orphanRow))) orphanRow += 1;
    positions.set(node.id, { x: 0, y: orphanRow });
    occupied.add(cellKey(0, orphanRow));
  }
  return positions;
}

export function layoutDiagram(nodes, edges, overrides = {}) {
  const options = { ...DEFAULT_LAYOUT, ...overrides };
  const cells = alignTerminalMergeSources(assignCells(nodes, edges), edges);
  const routedEdges = assignConnectionPorts(edges, cells);
  const xValues = [...new Set([...cells.values()].map((position) => position.x))].sort((a, b) => a - b);
  const yValues = [...new Set([...cells.values()].map((position) => position.y))].sort((a, b) => a - b);
  const columnWidths = new Map(xValues.map((x) => [x, Math.max(...nodes
    .filter((node) => cells.get(node.id).x === x)
    .map((node) => node.width ?? 150), 0)]));
  const rowHeights = new Map(yValues.map((y) => [y, Math.max(...nodes
    .filter((node) => cells.get(node.id).y === y)
    .map((node) => node.layoutHeight ?? node.height ?? 42), 0)]));
  const columnLeft = new Map();
  const rowTop = new Map();
  let cursor = options.padding;
  xValues.forEach((x) => {
    columnLeft.set(x, cursor);
    cursor += columnWidths.get(x) + options.horizontalGutter;
  });
  const width = cursor - options.horizontalGutter + options.padding;
  cursor = options.padding;
  yValues.forEach((y) => {
    rowTop.set(y, cursor);
    cursor += rowHeights.get(y) + options.verticalGutter;
  });
  const height = cursor - options.verticalGutter + options.padding;

  const placed = nodes.map((node) => {
    const cell = cells.get(node.id);
    const nodeWidth = node.width ?? 150;
    const nodeHeight = node.height ?? 42;
    const layoutHeight = node.layoutHeight ?? nodeHeight;
    return {
      ...node,
      rank: cell.x,
      x: columnLeft.get(cell.x) + (columnWidths.get(cell.x) - nodeWidth) / 2,
      y: rowTop.get(cell.y) + (rowHeights.get(cell.y) - layoutHeight) / 2,
      width: nodeWidth,
      height: nodeHeight,
      layoutHeight,
    };
  });

  return { nodes: placed, edges: routedEdges, width, height, options };
}

export function cleanupAlignmentOffsets(nodes, edges, tolerance = 12) {
  const byId = new Map(nodes.map((node) => [node.id, { ...node }]));
  const changed = new Map();
  const centerX = (node) => node.x + node.width / 2;
  const centerY = (node) => node.y + (node.aboveHeight ?? 0) + node.height / 2;
  edges.filter((edge) => edge.kind === "branch").forEach((edge) => {
    const source = byId.get(edge.from);
    const target = byId.get(edge.to);
    if (!source || !target || source.hidden || target.hidden) return;
    const vertical = edge.layoutDirection === "up" || edge.layoutDirection === "down";
    const difference = vertical ? centerX(source) - centerX(target) : centerY(source) - centerY(target);
    if (Math.abs(difference) < 0.05 || Math.abs(difference) > tolerance) return;
    if (vertical) target.x += difference;
    else target.y += difference;
    target.offsetX = (target.offsetX ?? 0) + (vertical ? difference : 0);
    target.offsetY = (target.offsetY ?? 0) + (vertical ? 0 : difference);
    changed.set(target.id, { id: target.id, lineNumber: target.lineNumber, offsetX: target.offsetX, offsetY: target.offsetY });
  });
  return [...changed.values()];
}

export function arrangeNodeOffsets(nodes, action) {
  const targets = nodes.map((node) => ({ ...node }));
  if (targets.length < 2) return targets;
  const centerX = (node) => node.x + node.width / 2;
  const centerY = (node) => node.y + (node.aboveHeight ?? 0) + node.height / 2;
  if (["left", "center", "right", "top", "middle", "bottom"].includes(action)) {
    const horizontalAlignment = ["left", "center", "right"].includes(action);
    const read = action === "left" ? (node) => node.x
      : action === "right" ? (node) => node.x + node.width
        : action === "top" ? (node) => node.y + (node.aboveHeight ?? 0)
          : action === "bottom" ? (node) => node.y + (node.aboveHeight ?? 0) + node.height
            : action === "center" ? centerX : centerY;
    const goal = targets.reduce((sum, node) => sum + read(node), 0) / targets.length;
    targets.forEach((node) => {
      const delta = goal - read(node);
      node.offsetX += horizontalAlignment ? delta : 0;
      node.offsetY += horizontalAlignment ? 0 : delta;
    });
    return targets;
  }
  const horizontal = action === "horizontal";
  const start = (node) => horizontal ? node.x : node.y + (node.aboveHeight ?? 0);
  const size = (node) => horizontal ? node.width : node.height;
  targets.sort((a, b) => start(a) - start(b));
  const first = start(targets[0]);
  const lastEdge = start(targets.at(-1)) + size(targets.at(-1));
  const occupied = targets.reduce((sum, node) => sum + size(node), 0);
  const gap = (lastEdge - first - occupied) / (targets.length - 1);
  let cursor = first;
  targets.forEach((node) => {
    const delta = cursor - start(node);
    node.offsetX += horizontal ? delta : 0;
    node.offsetY += horizontal ? 0 : delta;
    cursor += size(node) + gap;
  });
  return targets;
}
