export type NetworkLane = "upstream" | "focus" | "downstream";

export interface NetworkWorldPoint {
  readonly x: number;
  readonly y: number;
}

export interface NetworkWorldNode extends NetworkWorldPoint {
  readonly id: string;
  readonly lane: NetworkLane;
  readonly width: number;
  readonly height: number;
}

export interface NetworkWorldLayout {
  readonly width: number;
  readonly height: number;
  readonly focus: NetworkWorldNode;
  readonly nodes: ReadonlyMap<string, NetworkWorldNode>;
}

export interface NetworkCamera {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

const MAX_COLUMNS = 4;
const NODE_WIDTH = 216;
const FOCUS_WIDTH = 264;
const NODE_HEIGHT = 96;
const COLUMN_GAP = 40;
const ROW_GAP = 40;
const LANE_GAP = 144;
const WORLD_PADDING = 80;
export const NETWORK_MIN_SCALE = 0.42;
export const NETWORK_MAX_SCALE = 1.8;

function rowsFor(count: number): number {
  return Math.ceil(count / MAX_COLUMNS);
}

function widestColumns(...counts: number[]): number {
  return Math.max(1, ...counts.map((count) => Math.min(MAX_COLUMNS, count)));
}

function rowX(index: number, count: number, centreX: number): number {
  return centreX + (index - (count - 1) / 2) * (NODE_WIDTH + COLUMN_GAP);
}

export function layoutNetworkWorld(
  upstreamIds: readonly string[],
  focusId: string,
  downstreamIds: readonly string[],
): NetworkWorldLayout {
  const upstreamRows = rowsFor(upstreamIds.length);
  const downstreamRows = rowsFor(downstreamIds.length);
  const columns = widestColumns(upstreamIds.length, downstreamIds.length);
  const contentWidth = Math.max(FOCUS_WIDTH, columns * NODE_WIDTH + Math.max(0, columns - 1) * COLUMN_GAP);
  const width = contentWidth + WORLD_PADDING * 2;
  const centreX = width / 2;
  const upstreamHeight = upstreamRows === 0 ? 0 : upstreamRows * NODE_HEIGHT + (upstreamRows - 1) * ROW_GAP + LANE_GAP;
  const downstreamHeight = downstreamRows === 0 ? 0 : downstreamRows * NODE_HEIGHT + (downstreamRows - 1) * ROW_GAP + LANE_GAP;
  const focusY = WORLD_PADDING + upstreamHeight + NODE_HEIGHT / 2;
  const height = WORLD_PADDING * 2 + upstreamHeight + NODE_HEIGHT + downstreamHeight;
  const nodes = new Map<string, NetworkWorldNode>();

  const focus: NetworkWorldNode = {
    id: focusId,
    lane: "focus",
    x: centreX,
    y: focusY,
    width: FOCUS_WIDTH,
    height: NODE_HEIGHT,
  };
  nodes.set(focusId, focus);

  const placeLane = (ids: readonly string[], lane: Exclude<NetworkLane, "focus">): void => {
    ids.forEach((id, index) => {
      const row = Math.floor(index / MAX_COLUMNS);
      const rowStart = row * MAX_COLUMNS;
      const count = Math.min(MAX_COLUMNS, ids.length - rowStart);
      const column = index - rowStart;
      const direction = lane === "upstream" ? -1 : 1;
      const y = focusY + direction * (LANE_GAP + NODE_HEIGHT + row * (NODE_HEIGHT + ROW_GAP));
      nodes.set(id, {
        id,
        lane,
        x: rowX(column, count, centreX),
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    });
  };

  placeLane(upstreamIds, "upstream");
  placeLane(downstreamIds, "downstream");
  return { width, height, focus, nodes };
}

export function orthogonalNetworkPath(from: NetworkWorldNode, to: NetworkWorldNode): string {
  const downward = from.y <= to.y;
  const fromY = from.y + (downward ? from.height / 2 : -from.height / 2);
  const toY = to.y + (downward ? -to.height / 2 : to.height / 2);
  const midY = (fromY + toY) / 2;
  return `M ${from.x} ${fromY} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${toY}`;
}

export function clampNetworkScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(NETWORK_MAX_SCALE, Math.max(NETWORK_MIN_SCALE, scale));
}

export function centreNetworkCamera(
  viewportWidth: number,
  viewportHeight: number,
  point: NetworkWorldPoint,
  scale = 1,
): NetworkCamera {
  const nextScale = clampNetworkScale(scale);
  return {
    x: viewportWidth / 2 - point.x * nextScale,
    y: viewportHeight / 2 - point.y * nextScale,
    scale: nextScale,
  };
}

export function zoomNetworkCameraAt(
  camera: NetworkCamera,
  nextScale: number,
  screenPoint: NetworkWorldPoint,
): NetworkCamera {
  const scale = clampNetworkScale(nextScale);
  const worldX = (screenPoint.x - camera.x) / camera.scale;
  const worldY = (screenPoint.y - camera.y) / camera.scale;
  return {
    x: screenPoint.x - worldX * scale,
    y: screenPoint.y - worldY * scale,
    scale,
  };
}

export function fitNetworkCamera(
  viewportWidth: number,
  viewportHeight: number,
  layout: Pick<NetworkWorldLayout, "width" | "height">,
  padding = 48,
): NetworkCamera {
  const usableWidth = Math.max(1, viewportWidth - padding * 2);
  const usableHeight = Math.max(1, viewportHeight - padding * 2);
  const scale = clampNetworkScale(Math.min(1, usableWidth / layout.width, usableHeight / layout.height));
  return {
    x: (viewportWidth - layout.width * scale) / 2,
    y: (viewportHeight - layout.height * scale) / 2,
    scale,
  };
}
