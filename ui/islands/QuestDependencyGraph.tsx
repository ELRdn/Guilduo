import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createReactIsland, type IslandProps } from "./bridge.ts";
import type { QuestGraphActions, QuestGraphNode, QuestGraphViewModel } from "./types.ts";
import "./styles.css";

type GraphProps = IslandProps<QuestGraphViewModel, QuestGraphActions>;
type LayoutNode = QuestGraphNode & { depth: number; x: number; y: number; width: number; height: number };
type GraphEdge = { id: string; source: string; target: string; kind: "parent" | "dependency" | "warning" };

function statusClass(status: string): string {
  return status.replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "unknown";
}

// Mirrors the Quest Rail legend (interaction-lab/index.html .quest-rail-legend /
// .rail-marker) so the graph uses the same 主目的/サブQuest/サイドQuest visual language
// as the rest of the app, instead of inventing a separate scheme for this Island.
const KIND_LABEL: Record<string, string> = { main: "MAIN", sub: "SUB", side: "SIDE" };
const KIND_TONE: Record<string, string> = { main: "human", sub: "agent", side: "rpg" };

function kindLabel(kind: string): string {
  return KIND_LABEL[kind] || "SIDE";
}

function kindTone(kind: string): string {
  return KIND_TONE[kind] || "rpg";
}

function sortNodes(a: QuestGraphNode, b: QuestGraphNode): number {
  const aOrder = Number.isFinite(a.order) ? Number(a.order) : Number.POSITIVE_INFINITY;
  const bOrder = Number.isFinite(b.order) ? Number(b.order) : Number.POSITIVE_INFINITY;
  if (aOrder !== bOrder) return aOrder - bOrder;
  const created = a.createdAt.localeCompare(b.createdAt);
  return created || a.id.localeCompare(b.id);
}

function layoutGraph(nodes: QuestGraphNode[], collapsed: Set<string>, hideCompleted: boolean, statusFilter: string): { nodes: LayoutNode[]; edges: GraphEdge[]; warnings: string[]; width: number; height: number } {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const warnings: string[] = [];
  const depthMemo = new Map<string, number>();
  const visiting = new Set<string>();

  const depthOf = (id: string): number => {
    if (depthMemo.has(id)) return depthMemo.get(id) || 0;
    const node = byId.get(id);
    if (!node || !node.parentQuestId || !byId.has(node.parentQuestId)) {
      depthMemo.set(id, 0);
      return 0;
    }
    if (visiting.has(id)) {
      warnings.push(`親子関係の循環を検出: ${id}`);
      depthMemo.set(id, 0);
      return 0;
    }
    visiting.add(id);
    const depth = Math.min(8, depthOf(node.parentQuestId) + 1);
    visiting.delete(id);
    depthMemo.set(id, depth);
    return depth;
  };

  nodes.forEach((node) => depthOf(node.id));
  const visibleIds = new Set(nodes.filter((node) => {
    if (hideCompleted && ["completed", "archived", "done"].includes(node.status)) return false;
    if (statusFilter !== "all") {
      const matches = statusFilter === "active"
        ? !["completed", "archived", "done"].includes(node.status)
        : node.status === statusFilter;
      if (!matches) return false;
    }
    let parent = node.parentQuestId;
    while (parent) {
      if (collapsed.has(parent)) return false;
      parent = byId.get(parent)?.parentQuestId || "";
    }
    return true;
  }).map((node) => node.id));

  const columns = new Map<number, QuestGraphNode[]>();
  nodes.filter((node) => visibleIds.has(node.id)).forEach((node) => {
    const column = columns.get(depthMemo.get(node.id) || 0) || [];
    column.push(node);
    columns.set(depthMemo.get(node.id) || 0, column);
  });
  const positioned: LayoutNode[] = [];
  const columnValues = [...columns.entries()].sort(([a], [b]) => a - b);
  const maxRows = Math.max(1, ...columnValues.map(([, column]) => column.length));
  columnValues.forEach(([depth, column]) => {
    column.sort(sortNodes).forEach((node, index) => positioned.push({ ...node, depth, x: 24 + depth * 236, y: 24 + index * 92, width: 204, height: 72 }));
  });
  const positionedIds = new Set(positioned.map((node) => node.id));
  const edges: GraphEdge[] = [];
  positioned.forEach((node) => {
    if (node.parentQuestId && positionedIds.has(node.parentQuestId)) edges.push({ id: `parent:${node.parentQuestId}:${node.id}`, source: node.parentQuestId, target: node.id, kind: "parent" });
    const dependencyEdges = node.dependencyIds.filter((id) => positionedIds.has(id)).map((id) => ({ id: `dependency:${id}:${node.id}`, source: id, target: node.id, kind: "dependency" as const }));
    edges.push(...dependencyEdges);
  });

  const dependencyCycle = new Set<string>();
  const visitDependency = (id: string, path: Set<string>): void => {
    if (path.has(id)) { dependencyCycle.add(id); return; }
    const node = byId.get(id);
    if (!node) return;
    const next = new Set(path).add(id);
    node.dependencyIds.forEach((dependencyId) => visitDependency(dependencyId, next));
  };
  nodes.forEach((node) => visitDependency(node.id, new Set()));
  if (dependencyCycle.size) {
    warnings.push(`依存関係の循環を検出: ${[...dependencyCycle].sort().join(", ")}`);
    const warningEdge = [...edges].reverse().find((edge) => edge.kind === "dependency" && dependencyCycle.has(edge.source) && dependencyCycle.has(edge.target));
    if (warningEdge) {
      warningEdge.kind = "warning";
      warningEdge.id = `${warningEdge.id}:warning`;
    }
  }
  return { nodes: positioned, edges, warnings, width: Math.max(920, (columnValues.length || 1) * 236), height: Math.max(420, maxRows * 92 + 52) };
}

function edgePath(source: LayoutNode, target: LayoutNode): string {
  const fromX = source.x + source.width;
  const fromY = source.y + source.height / 2;
  const toX = target.x;
  const toY = target.y + target.height / 2;
  const middle = fromX + (toX - fromX) / 2;
  return `M ${fromX} ${fromY} C ${middle} ${fromY}, ${middle} ${toY}, ${toX} ${toY}`;
}

function QuestDependencyGraph({ model, actions }: GraphProps): ReactElement {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hideCompleted, setHideCompleted] = useState(model.hideCompleted);
  const [statusFilter, setStatusFilter] = useState(model.statusFilter || "all");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const graph = useMemo(() => layoutGraph(model.nodes, collapsed, hideCompleted, statusFilter), [model.nodes, collapsed, hideCompleted, statusFilter]);
  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const viewportRef = useRef<HTMLDivElement>(null);

  // v4.3: layoutGraph()'s canvas size is purely a function of node/column count, with no
  // regard for how much room the viewport actually has — a handful of nodes reads as mostly
  // whitespace, a wide graph immediately needs scrolling. Fit the initial view to whatever
  // space is available (within the existing 0.7-1.5 zoom range) whenever the graph's own size
  // changes; the layout coordinates themselves are untouched.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !graph.width || !graph.height) return;
    const fitX = viewport.clientWidth / graph.width;
    const fitY = viewport.clientHeight / graph.height;
    const fit = Number(Math.min(1.5, Math.max(0.7, Math.min(fitX, fitY))).toFixed(2));
    setZoom(fit);
    setPan({ x: 0, y: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.width, graph.height]);

  const collapseAll = (): void => setCollapsed(new Set(model.nodes.filter((node) => model.nodes.some((child) => child.parentQuestId === node.id)).map((node) => node.id)));
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest("button")) return;
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return;
    setPan({ x: drag.current.panX + event.clientX - drag.current.x, y: drag.current.panY + event.clientY - drag.current.y });
  };
  const stopDrag = (): void => { drag.current = null; };

  return (
    <section className="qf-island qf-graph-island" data-vf-id="DependencyGraph" aria-labelledby="qf-graph-title">
      <header className="qf-island-heading">
        <div><p className="qf-eyebrow">DEPENDENCY / WORK GRAPH</p><h3 id="qf-graph-title">{model.title}</h3><p>{model.subtitle}</p></div>
        <div className="qf-graph-controls" role="group" aria-label="Quest graph controls">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.7, Number((value - 0.1).toFixed(2))))} aria-label="Zoom out">−</button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(1.5, Number((value + 0.1).toFixed(2))))} aria-label="Zoom in">＋</button><button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} aria-label="Reset graph view">Reset</button>
        </div>
      </header>
      <div className="qf-graph-toolbar"><label><span>表示</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value)}><option value="all">すべてのQuest</option><option value="active">未完了</option><option value="working">進行中</option><option value="review">レビュー</option><option value="blocked">ブロック中</option><option value="completed">完了</option></select></label><label className="qf-check"><input type="checkbox" checked={hideCompleted} onChange={(event) => setHideCompleted(event.currentTarget.checked)} /><span>完了を非表示</span></label><span className="qf-graph-collapse-actions"><button type="button" onClick={collapseAll}>すべて閉じる</button><button type="button" onClick={() => setCollapsed(new Set())}>すべて開く</button></span><span className="qf-graph-legend"><i className="qf-graph-dot qf-graph-dot--active" />進行中 <i className="qf-graph-dot qf-graph-dot--review" />レビュー <i className="qf-graph-dot qf-graph-dot--done" />完了</span></div>
      {graph.warnings.length ? <div className="qf-graph-warning" role="status"><strong>Graph data warning</strong><span>{graph.warnings.join(" / ")}</span></div> : null}
      <div className="qf-graph-viewport" ref={viewportRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopDrag} onPointerCancel={stopDrag} role="region" aria-label="Quest dependency graph">
        <div className="qf-graph-canvas" style={{ width: graph.width, height: graph.height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <svg className="qf-graph-links" viewBox={`0 0 ${graph.width} ${graph.height}`} aria-hidden="true" focusable="false">
            {graph.edges.map((edge) => { const source = byId.get(edge.source); const target = byId.get(edge.target); return source && target ? <path key={edge.id} d={edgePath(source, target)} className={`qf-graph-edge qf-graph-edge--${edge.kind}`} /> : null; })}
          </svg>
          {graph.nodes.map((node) => (
            <button
              type="button"
              key={node.id}
              className={`qf-graph-node qf-graph-node--${statusClass(node.status)} qf-graph-node--kind-${node.kind || "side"} ${node.id === model.selectedId ? "is-selected" : ""}`}
              style={{ left: node.x, top: node.y, width: node.width, minHeight: node.height }}
              onClick={() => actions.onSelect(node.id)}
              aria-pressed={node.id === model.selectedId}
            >
              <span className="qf-graph-node__top">
                <span className={`qf-graph-node__kind qf-tone-${kindTone(node.kind)}`} title={kindLabel(node.kind)}>
                  <i className="qf-graph-kind-dot" aria-hidden="true" />
                  <small className="qf-mono">{node.code}</small>
                </span>
                <b>{node.statusLabel}</b>
              </span>
              <strong>{node.title}</strong>
              <span className="qf-graph-node__progress">
                <i style={{ width: `${Math.max(0, Math.min(100, node.progress))}%` }} />
                <small className="qf-mono">{node.progress}%</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <details className="qf-graph-accessible-list"><summary>グラフを一覧で読む</summary><div>{model.nodes.map((node) => <button type="button" key={node.id} onClick={() => actions.onSelect(node.id)}>{node.code} {node.title} / {node.statusLabel} / {node.progress}%</button>)}</div></details>
      <div className="qf-graph-footnote">親子関係と依存関係はQuestデータから再計算しています。表示位置は保存しません。</div>
    </section>
  );
}

export const questDependencyGraphIsland = createReactIsland<QuestGraphViewModel, QuestGraphActions>(QuestDependencyGraph);
