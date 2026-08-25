import { useEffect, useMemo, useState, type ReactElement } from "react";
import { createReactIsland, type IslandProps } from "./bridge.ts";
import type { IntegrationControlPlaneActions, IntegrationControlPlaneViewModel, IntegrationNode } from "./types.ts";
import "./styles.css";

type IntegrationProps = IslandProps<IntegrationControlPlaneViewModel, IntegrationControlPlaneActions>;
type Point = { x: number; y: number };
type PositionedNode = IntegrationNode & { x: number; y: number; width: number; height: number };

const canvas = { width: 1000, height: 520, center: { x: 500, y: 260, width: 176, height: 132 } };

function nodePositions(nodes: IntegrationNode[]): PositionedNode[] {
  const radiusX = 330;
  const radiusY = 170;
  const start = -Math.PI / 2;
  return nodes.map((node, index) => {
    const angle = start + (Math.PI * 2 * index) / Math.max(1, nodes.length);
    return { ...node, x: 500 + Math.cos(angle) * radiusX - 92, y: 260 + Math.sin(angle) * radiusY - 44, width: 184, height: 88 };
  });
}

function anchorFor(node: PositionedNode, center: typeof canvas.center): { from: Point; to: Point } {
  const nodeCenter = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  const centerPoint = { x: center.x + center.width / 2, y: center.y + center.height / 2 };
  const horizontal = Math.abs(nodeCenter.x - centerPoint.x) > Math.abs(nodeCenter.y - centerPoint.y);
  if (horizontal && nodeCenter.x < centerPoint.x) return { from: { x: center.x, y: centerPoint.y }, to: { x: node.x + node.width, y: nodeCenter.y } };
  if (horizontal) return { from: { x: center.x + center.width, y: centerPoint.y }, to: { x: node.x, y: nodeCenter.y } };
  if (nodeCenter.y < centerPoint.y) return { from: { x: centerPoint.x, y: center.y }, to: { x: nodeCenter.x, y: node.y + node.height } };
  return { from: { x: centerPoint.x, y: center.y + center.height }, to: { x: nodeCenter.x, y: node.y } };
}

function statusClass(status: string): string {
  return status.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
}

function pathFor(from: Point, to: Point): string {
  const bend = Math.abs(to.x - from.x) > Math.abs(to.y - from.y) ? Math.abs(to.x - from.x) * 0.42 : Math.abs(to.y - from.y) * 0.42;
  if (Math.abs(to.x - from.x) > Math.abs(to.y - from.y)) {
    const direction = to.x >= from.x ? 1 : -1;
    return `M ${from.x} ${from.y} C ${from.x + bend * direction} ${from.y}, ${to.x - bend * direction} ${to.y}, ${to.x} ${to.y}`;
  }
  const direction = to.y >= from.y ? 1 : -1;
  return `M ${from.x} ${from.y} C ${from.x} ${from.y + bend * direction}, ${to.x} ${to.y - bend * direction}, ${to.x} ${to.y}`;
}

function NodeCard({ node, selected, onSelect }: { node: PositionedNode; selected: boolean; onSelect: () => void }): ReactElement {
  return (
    <button type="button" className={`qf-network-node qf-network-node--${statusClass(node.status)} ${selected ? "is-selected" : ""}`} style={{ left: `${(node.x / canvas.width) * 100}%`, top: `${(node.y / canvas.height) * 100}%` }} onClick={onSelect} aria-pressed={selected}>
      <span className="qf-network-node__head"><b>{node.name}</b><small>{node.statusLabel}</small></span>
      <span className="qf-network-node__copy qf-mono">{node.endpoint}</span>
      <span className="qf-network-node__meta"><small>{node.auth || node.type}</small><small className="qf-mono">{node.latency || "—"}</small></span>
    </button>
  );
}

function IntegrationControlPlane({ model, actions }: IntegrationProps): ReactElement {
  const [selectedId, setSelectedId] = useState(model.selectedId || model.nodes[0]?.id || "");
  const positioned = useMemo(() => nodePositions(model.nodes), [model.nodes]);
  const selectedNode = model.nodes.find((node) => node.id === selectedId) || model.nodes[0];

  useEffect(() => {
    if (model.selectedId && model.selectedId !== selectedId) setSelectedId(model.selectedId);
  }, [model.selectedId, selectedId]);

  const select = (id: string): void => {
    setSelectedId(id);
    actions.onSelect(id);
  };

  return (
    <section className="qf-island qf-integrations-island" data-vf-id="IntegrationNetwork" aria-labelledby="qf-integration-title">
      <header className="qf-island-heading">
        <div><p className="qf-eyebrow">INTEGRATION CONTROL PLANE</p><h3 id="qf-integration-title">{model.title}</h3><p>{model.subtitle}</p></div>
        <div className="qf-island-heading__actions"><div className="qf-island-heading__meta"><span>CONNECTED <b>{model.connectedCount}</b></span><span>PREVIEW <b>{model.previewCount}</b></span><span>SAFE RULE <b>{model.safeRuleCount}</b></span></div><button type="button" className="qf-primary-action" onClick={() => selectedNode && actions.onOpenSettings(selectedNode.id)}>選択中の設定を開く</button></div>
      </header>
      <div className="qf-network-legend" aria-label="接続状態の凡例">
        <span><i className="qf-legend-dot qf-legend-dot--connected" />接続済み</span><span><i className="qf-legend-dot qf-legend-dot--syncing" />同期中</span><span><i className="qf-legend-dot qf-legend-dot--early-access" />準備中</span><span><i className="qf-legend-dot qf-legend-dot--error" />エラー</span>
      </div>
      <div className="qf-network-canvas" style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}>
        <svg viewBox={`0 0 ${canvas.width} ${canvas.height}`} className="qf-network-links" aria-hidden="true" focusable="false">
          {positioned.map((node) => {
            const anchor = anchorFor(node, canvas.center);
            return <path key={node.id} d={pathFor(anchor.from, anchor.to)} className={`qf-network-link qf-network-link--${statusClass(node.status)}`} />;
          })}
        </svg>
        <div className="qf-network-core"><span className="qf-network-core__mark">QF</span><strong>QUESTFORGE</strong><small>Core Orchestrator</small></div>
        {positioned.map((node) => <NodeCard key={node.id} node={node} selected={selectedNode?.id === node.id} onSelect={() => select(node.id)} />)}
      </div>
      <div className="qf-network-table-wrap">
        <div className="qf-network-table-heading"><div><p className="qf-eyebrow">CONNECTION TABLE</p><h4>実際の接続状態</h4></div><span>{model.tableRows.length}件</span></div>
        <div className="qf-network-table" role="table" aria-label="Integration connection table">
          <div className="qf-network-table__row qf-network-table__row--head" role="row"><span>連携名</span><span>種類</span><span>Endpoint / Resource</span><span>状態</span><span>Latency</span><span>操作</span></div>
          {model.tableRows.map((row) => <button type="button" role="row" key={row.id} className={`qf-network-table__row ${row.id === selectedNode?.id ? "is-selected" : ""}`} onClick={() => select(row.id)}><span>{row.name}</span><span>{row.type}</span><span className="qf-mono">{row.endpoint}</span><span><i className={`qf-status-dot qf-status-dot--${statusClass(row.status)}`} />{row.statusLabel}</span><span className="qf-mono">{row.latency || "—"}</span><span>詳細 →</span></button>)}
        </div>
        <aside className="qf-network-inspector" aria-live="polite">
          <p className="qf-eyebrow">SELECTED ADAPTER</p>
          <h4>{selectedNode?.name || "Adapterを選択"}</h4>
          {selectedNode ? <dl><div><dt>状態</dt><dd><i className={`qf-status-dot qf-status-dot--${statusClass(selectedNode.status)}`} />{selectedNode.statusLabel}</dd></div><div><dt>Endpoint / Resource</dt><dd className="qf-mono">{selectedNode.endpoint}</dd></div><div><dt>認証アカウント</dt><dd>{selectedNode.auth || "—"}</dd></div><div><dt>Latency</dt><dd className="qf-mono">{selectedNode.latency || "—"}</dd></div></dl> : <p className="qf-empty-copy">表示できるAdapterがありません。</p>}
          <p className="qf-network-inspector__note">接続状態はAdapterの正規応答から更新されます。未設定ProviderをConnectedとして補完しません。</p>
        </aside>
      </div>
    </section>
  );
}

export const integrationControlPlaneIsland = createReactIsland<IntegrationControlPlaneViewModel, IntegrationControlPlaneActions>(IntegrationControlPlane);
