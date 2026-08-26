import { useEffect, useMemo, useState, type ReactElement } from "react";
import { createReactIsland, type IslandProps } from "./bridge.ts";
import type { FormationMember, PartyFormationActions, PartyFormationViewModel } from "./types.ts";
import "./styles.css";

type PartyProps = IslandProps<PartyFormationViewModel, PartyFormationActions>;
type OrbitPoint = { x: number; y: number };
type RingMember = { kind: "member"; member: FormationMember; x: number; y: number };
type RingOverflow = { kind: "overflow"; count: number; x: number; y: number };
type RingSlot = RingMember | RingOverflow;

// Same canvas/core convention as IntegrationControlPlane.tsx so the three Golden Islands
// share one geometric idiom: a fixed hub, orbit rings computed from data, bezier links.
const canvas = { width: 1000, height: 520 };
const core = { x: 500, y: 260 };
const innerOrbit = { radiusX: 110, radiusY: 55 };
const outerOrbit = { radiusX: 400, radiusY: 205 };

// Party Formation agent-count scale policy (docs/ui-v4/CLAUDE_UI_HANDOFF.md, 4章):
// 1-5 = full formation, 6-8 = compact outer orbit, 9+ = primary agents + overflow slot.
const RING_PRIMARY_LIMIT = 8;
const COMPACT_THRESHOLD = 5;

function orbitPoints(count: number, radiusX: number, radiusY: number, startAngle = -Math.PI / 2): OrbitPoint[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const angle = startAngle + (Math.PI * 2 * index) / count;
    return { x: core.x + Math.cos(angle) * radiusX, y: core.y + Math.sin(angle) * radiusY };
  });
}

function linkPath(target: OrbitPoint): string {
  const dx = target.x - core.x;
  const dy = target.y - core.y;
  const length = Math.hypot(dx, dy) || 1;
  const midX = (core.x + target.x) / 2;
  const midY = (core.y + target.y) / 2;
  const bend = length * 0.1;
  const controlX = midX + (-dy / length) * bend;
  const controlY = midY + (dx / length) * bend;
  return `M ${core.x} ${core.y} Q ${controlX} ${controlY}, ${target.x} ${target.y}`;
}

function statusClass(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase() || "unknown";
}

function avatarFallback(member: FormationMember): string {
  return member.identity === "agent" ? member.name.slice(0, 2).toUpperCase() : member.identity === "astra" ? "AS" : "YOU";
}

function agentPriority(member: FormationMember): number {
  if (member.state === "working" || member.state === "active") return 0;
  if (member.state === "review" || member.state === "review_required") return 1;
  if (member.state === "blocked" || member.state === "error") return 2;
  return 3;
}

function isLiving(member: FormationMember): boolean {
  return member.state === "working" || member.state === "active";
}

function MemberCard({ member, selected, compact, onSelect }: { member: FormationMember; selected: boolean; compact: boolean; onSelect: () => void }): ReactElement {
  return (
    <button
      type="button"
      className={`qf-formation-member qf-formation-member--${member.identity} ${selected ? "is-selected" : ""} ${isLiving(member) ? "is-living" : ""} ${compact ? "is-compact" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="qf-formation-member__head">
        <span className="qf-formation-identity">{member.identityLabel}</span>
        <span className={`qf-formation-state qf-formation-state--${statusClass(member.state)}`}>{member.stateLabel}</span>
      </span>
      <span className="qf-formation-member__body">
        <span className="qf-avatar">
          {member.avatarSrc ? <img src={member.avatarSrc} alt="" loading="lazy" decoding="async" /> : <span aria-hidden="true">{avatarFallback(member)}</span>}
        </span>
        <span className="qf-formation-member__copy">
          <strong>{member.name}</strong>
          <small>{member.role}</small>
        </span>
      </span>
      {!compact && member.currentQuest ? <span className="qf-formation-current">{member.currentQuest}</span> : null}
      {!compact ? (
        <span className="qf-formation-metrics">
          {member.metrics.map((metric) => (
            <span key={`${member.id}-${metric.label}`} className={`qf-formation-metric qf-tone-${metric.tone || "neutral"}`}>
              <small>{metric.label}</small>
              <b className="qf-mono">{metric.value}</b>
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}

function OverflowNode({ count, onOpen }: { count: number; onOpen: () => void }): ReactElement {
  return (
    <button type="button" className="qf-formation-member qf-formation-member--overflow" onClick={onOpen}>
      <span className="qf-formation-overflow-count qf-mono">+{count}</span>
      <small>more agents</small>
    </button>
  );
}

function MemberRow({ member, onOpenQuest }: { member: FormationMember; onOpenQuest?: () => void }): ReactElement {
  return (
    <li className={`qf-member-row ${isLiving(member) ? "is-living" : ""}`}>
      <span className="qf-avatar qf-avatar--sm">
        {member.avatarSrc ? <img src={member.avatarSrc} alt="" loading="lazy" decoding="async" /> : <span aria-hidden="true">{avatarFallback(member)}</span>}
      </span>
      <span className="qf-member-row__identity">
        <strong>{member.name}</strong>
        <small>{member.identityLabel} / {member.role}</small>
      </span>
      <span className="qf-member-row__quest">{member.currentQuest || "—"}</span>
      <span className={`qf-formation-state qf-formation-state--${statusClass(member.state)}`}>{member.stateLabel}</span>
      <span className="qf-member-row__metrics">
        {member.metrics.map((metric) => (
          <span key={`${member.id}-row-${metric.label}`} className={`qf-tone-${metric.tone || "neutral"}`}>
            <small>{metric.label}</small> <b className="qf-mono">{metric.value}</b>
          </span>
        ))}
      </span>
      <button type="button" className="qf-member-row__action" onClick={onOpenQuest} disabled={!onOpenQuest}>Questを確認</button>
    </li>
  );
}

function PartyFormation({ model, actions }: PartyProps): ReactElement {
  const [selectedId, setSelectedId] = useState(model.members[0]?.id || "");
  const [tab, setTab] = useState<"formation" | "members">("formation");
  const selected = model.members.find((member) => member.id === selectedId) || model.members[0];
  const human = model.members.find((member) => member.identity === "human");
  const astra = model.members.find((member) => member.identity === "astra");
  const agents = model.members.filter((member) => member.identity === "agent");

  const sortedAgents = useMemo(() => [...agents].sort((a, b) => agentPriority(a) - agentPriority(b)), [agents]);
  const overflowCount = Math.max(0, sortedAgents.length - RING_PRIMARY_LIMIT);
  const ringAgents = overflowCount > 0 ? sortedAgents.slice(0, RING_PRIMARY_LIMIT) : sortedAgents;
  const ringSlotCount = ringAgents.length + (overflowCount > 0 ? 1 : 0);
  const isCompact = ringSlotCount > COMPACT_THRESHOLD;

  const innerPoints = useMemo(() => orbitPoints(2, innerOrbit.radiusX, innerOrbit.radiusY), []);
  // Outer ring starts at a rotational offset from the inner ring so agent nodes never sit
  // radially behind Human/Astra (same computed-geometry idiom, just phase-shifted).
  const outerPoints = useMemo(() => orbitPoints(ringSlotCount, outerOrbit.radiusX, outerOrbit.radiusY, -Math.PI / 2 + Math.PI / 5), [ringSlotCount]);

  const ringSlots: RingSlot[] = useMemo(() => {
    const slots: RingSlot[] = ringAgents.map((member, index) => ({ kind: "member", member, x: outerPoints[index]?.x ?? core.x, y: outerPoints[index]?.y ?? core.y }));
    if (overflowCount > 0) {
      const point = outerPoints[ringAgents.length] || { x: core.x, y: core.y };
      slots.push({ kind: "overflow", count: overflowCount, x: point.x, y: point.y });
    }
    return slots;
  }, [ringAgents, outerPoints, overflowCount]);

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const select = (member: FormationMember): void => {
    setSelectedId(member.id);
    actions.onSelectMember?.(member.id);
  };

  const allLinkPoints: OrbitPoint[] = [
    ...(human ? [innerPoints[0]] : []),
    ...(astra ? [innerPoints[1]] : []),
    ...ringSlots.map((slot) => ({ x: slot.x, y: slot.y })),
  ];

  return (
    <section className="qf-island qf-party-island" data-vf-id="FormationBoard" aria-labelledby="qf-party-formation-title">
      <header className="qf-island-heading">
        <div>
          <p className="qf-eyebrow">PARTY FORMATION / HUMAN + AI</p>
          <h3 id="qf-party-formation-title">{model.title}</h3>
          <p>{model.subtitle}</p>
        </div>
        <div className="qf-island-heading__meta">
          <span className="qf-sync-dot" />
          <span>{model.connectionLabel}</span>
        </div>
      </header>

      <nav className="qf-segmented" aria-label="Party view">
        <button type="button" className={tab === "formation" ? "is-active" : ""} onClick={() => setTab("formation")}>Formation</button>
        <button type="button" className={tab === "members" ? "is-active" : ""} onClick={() => setTab("members")}>Members <b className="qf-mono">{model.members.length}</b></button>
        <span aria-disabled="true">Social &amp; Invitations</span>
      </nav>

      {tab === "formation" ? (
        <div className="qf-party-layout">
          <div className="qf-formation-scene" aria-label="Party formation scene">
            <div className="qf-formation-scene__label">COMMANDER FORMATION</div>
            <svg className="qf-formation-links" viewBox={`0 0 ${canvas.width} ${canvas.height}`} aria-hidden="true" focusable="false">
              {allLinkPoints.map((point, index) => <path key={index} d={linkPath(point)} />)}
            </svg>
            <div className="qf-formation-banner" aria-hidden="true">QF</div>
            {human ? (
              <div className="qf-formation-position qf-formation-position--commander" style={{ left: `${(innerPoints[0].x / canvas.width) * 100}%`, top: `${(innerPoints[0].y / canvas.height) * 100}%` }}>
                <MemberCard member={human} selected={selected?.id === human.id} compact={false} onSelect={() => select(human)} />
              </div>
            ) : null}
            {astra ? (
              <div className="qf-formation-position qf-formation-position--companion" style={{ left: `${(innerPoints[1].x / canvas.width) * 100}%`, top: `${(innerPoints[1].y / canvas.height) * 100}%` }}>
                <MemberCard member={astra} selected={selected?.id === astra.id} compact={false} onSelect={() => select(astra)} />
              </div>
            ) : null}
            {ringSlots.map((slot) => (
              <div key={slot.kind === "member" ? slot.member.id : "overflow"} className={`qf-formation-position qf-formation-position--agent ${isCompact ? "is-compact" : ""}`} style={{ left: `${(slot.x / canvas.width) * 100}%`, top: `${(slot.y / canvas.height) * 100}%` }}>
                {slot.kind === "member"
                  ? <MemberCard member={slot.member} selected={selected?.id === slot.member.id} compact onSelect={() => select(slot.member)} />
                  : <OverflowNode count={slot.count} onOpen={() => setTab("members")} />}
              </div>
            ))}
            {!agents.length ? (
              <div className="qf-formation-empty">
                <strong>登録済みAgentがいません</strong>
                <span>{model.emptyAgentCopy}</span>
                <button type="button" onClick={actions.onOpenAgentRegistry}>Agent Registryを開く</button>
              </div>
            ) : null}
          </div>

          <aside className="qf-formation-inspector" aria-live="polite">
            <div className="qf-inspector-heading">
              <div><p className="qf-eyebrow">SELECTED MEMBER</p><h3>{selected?.name || "メンバーを選択"}</h3></div>
              <span className={`qf-formation-state qf-formation-state--${statusClass(selected?.state || "unknown")}`}>{selected?.stateLabel || "—"}</span>
            </div>
            {selected ? (
              <>
                <p className="qf-inspector-role">{selected.identityLabel} / {selected.role}</p>
                <dl className="qf-inspector-metrics">
                  {selected.metrics.map((metric) => <div key={metric.label}><dt>{metric.label}</dt><dd className="qf-mono">{metric.value}</dd></div>)}
                </dl>
                {selected.currentQuest ? <div className="qf-inspector-quest"><small>CURRENT QUEST</small><strong>{selected.currentQuest}</strong></div> : null}
                {selected.capabilities?.length ? <div className="qf-capabilities"><small>CAPABILITY</small><div>{selected.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div></div> : null}
              </>
            ) : <p className="qf-empty-copy">表示できるメンバーがありません。</p>}
            <div className="qf-inspector-note">Formationは作戦上の表示です。Social Partyの招待・退出・管理は既存のMembers画面から行います。</div>
          </aside>
        </div>
      ) : (
        <div className="qf-member-list-wrap">
          <ul className="qf-member-list">
            {model.members.map((member) => (
              <MemberRow key={member.id} member={member} onOpenQuest={actions.onOpenMemberQuest ? () => actions.onOpenMemberQuest?.(member.id) : undefined} />
            ))}
          </ul>
          {!agents.length ? <p className="qf-empty-copy">{model.emptyAgentCopy}</p> : null}
        </div>
      )}
    </section>
  );
}

export const partyFormationIsland = createReactIsland<PartyFormationViewModel, PartyFormationActions>(PartyFormation);
