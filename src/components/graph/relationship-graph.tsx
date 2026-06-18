"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Lock } from "lucide-react";

import {
  DispositionBar,
  dispositionColor,
} from "@/components/ui/disposition-bar";
import { entityTypeColor, formatEntityType } from "@/lib/entities";
import {
  relationshipEdgeLabel,
  type RelationshipTypeValue,
} from "@/lib/relationship-types";
import type { GraphEdge, GraphNode } from "@/server/services/relationships";

// World-space canvas the force simulation runs in; the SVG scales to fit.
const W = 1200;
const H = 820;
const MIN_SIMULATION_ALPHA = 0.02;

type SimNode = GraphNode & {
  px: number;
  py: number;
  vx: number;
  vy: number;
  r: number;
  pinned: boolean;
};

type RelationshipGraphProps = {
  campaignId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

function seedLayout(nodes: GraphNode[], degree: Map<string, number>): SimNode[] {
  const n = nodes.length;
  return nodes.map((node, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
    return {
      ...node,
      px: W / 2 + 320 * Math.cos(angle),
      py: H / 2 + 320 * Math.sin(angle),
      vx: 0,
      vy: 0,
      r: 13 + Math.min(10, (degree.get(node.id) ?? 0) * 2),
      pinned: false,
    };
  });
}

/**
 * Force-directed relationship graph (docs/design/mockup/screen-graph.jsx): a
 * draggable, pan/zoomable node-link diagram with a connections side panel. Type
 * and secret-edge filters live in the toolbar. All data arrives already
 * visibility-scoped from the service; nothing is faked.
 */
export function RelationshipGraph(props: RelationshipGraphProps) {
  const graphKey =
    props.nodes.map((n) => n.id).join(",") +
    "|" +
    props.edges.map((e) => e.id).join(",");

  return <RelationshipGraphInner key={graphKey} {...props} />;
}

function RelationshipGraphInner({ campaignId, nodes, edges }: RelationshipGraphProps) {
  // Degree per node sizes the circles and seeds a stable starting layout.
  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of edges) {
      d.set(e.sourceId, (d.get(e.sourceId) ?? 0) + 1);
      d.set(e.targetId, (d.get(e.targetId) ?? 0) + 1);
    }
    return d;
  }, [edges]);

  // Seed positions on a circle, then let the simulation settle through state
  // updates so React renders from immutable snapshots.
  const [simNodes, setSimNodes] = useState<SimNode[]>(() =>
    seedLayout(nodes, degree),
  );
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const [sel, setSel] = useState<string>(() => nodes[0]?.id ?? "");
  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    () => new Set(nodes.map((n) => n.type)),
  );
  const [showSecret, setShowSecret] = useState(true);
  const [simulationRun, setSimulationRun] = useState(0);

  const drag = useRef<string | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  // Force simulation: repulsion + edge springs + centering, with damping.
  useEffect(() => {
    if (nodes.length === 0) return;

    let raf = 0;
    let alpha = 1;
    const step = () => {
      setSimNodes((current) => {
        if (current.length === 0) return current;

        const ns = current.map((node) => ({ ...node }));
        const byId = new Map(ns.map((node) => [node.id, node]));

        for (let i = 0; i < ns.length; i++) {
          for (let j = i + 1; j < ns.length; j++) {
            const a = ns[i];
            const b = ns[j];
            const dx = a.px - b.px;
            const dy = a.py - b.py;
            const d2 = dx * dx + dy * dy || 1;
            const d = Math.sqrt(d2);
            const rep = 9000 / d2;
            const fx = (dx / d) * rep;
            const fy = (dy / d) * rep;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          }
        }

        for (const e of edges) {
          const a = byId.get(e.sourceId);
          const b = byId.get(e.targetId);
          if (!a || !b) continue;
          const dx = b.px - a.px;
          const dy = b.py - a.py;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const k = 0.012 * (d - 190);
          const fx = (dx / d) * k;
          const fy = (dy / d) * k;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }

        for (const n of ns) {
          n.vx += (W / 2 - n.px) * 0.0016;
          n.vy += (H / 2 - n.py) * 0.0016;
          if (!n.pinned && drag.current !== n.id) {
            n.vx *= 0.86;
            n.vy *= 0.86;
            n.px += n.vx * alpha;
            n.py += n.vy * alpha;
          } else {
            n.vx = 0;
            n.vy = 0;
          }
        }
        return ns;
      });

      alpha *= 0.992;
      if (alpha > MIN_SIMULATION_ALPHA) {
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [edges, nodes.length, simulationRun]);

  // Screen → world coordinate transform for pointer interactions.
  const toWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const ctm = typeof svg.getScreenCTM === "function" ? svg.getScreenCTM() : null;
    if (ctm && typeof svg.createSVGPoint === "function") {
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const local = point.matrixTransform(ctm.inverse());
      return { x: (local.x - view.x) / view.k, y: (local.y - view.y) / view.k };
    }

    const rect = svg.getBoundingClientRect();
    const scale = Math.max(rect.width / W, rect.height / H);
    const renderedWidth = W * scale;
    const renderedHeight = H * scale;
    const offsetX = (rect.width - renderedWidth) / 2;
    const offsetY = (rect.height - renderedHeight) / 2;
    const sx = (clientX - rect.left - offsetX) / scale;
    const sy = (clientY - rect.top - offsetY) / scale;
    return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
  };

  const onPointerDownNode = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    drag.current = id;
    setSimNodes((current) =>
      current.map((node) => (node.id === id ? { ...node, pinned: true } : node)),
    );
    setSel(id);
  };
  const onPointerDownBg = (e: React.PointerEvent) => {
    pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    setIsPanning(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current) {
      const w = toWorld(e.clientX, e.clientY);
      const id = drag.current;
      setSimNodes((current) =>
        current.map((node) =>
          node.id === id ? { ...node, px: w.x, py: w.y, vx: 0, vy: 0 } : node,
        ),
      );
    } else if (pan.current) {
      const p = pan.current;
      setView((v) => ({ ...v, x: p.vx + (e.clientX - p.x), y: p.vy + (e.clientY - p.y) }));
    }
  };
  const onPointerUp = () => {
    const wasDragging = drag.current !== null;
    drag.current = null;
    pan.current = null;
    setIsPanning(false);
    if (wasDragging) {
      setSimulationRun((current) => current + 1);
    }
  };
  const zoom = (f: number) =>
    setView((v) => ({ ...v, k: Math.min(2.4, Math.max(0.4, v.k * f)) }));

  const nodeById = useMemo(
    () => new Map(simNodes.map((node) => [node.id, node])),
    [simNodes],
  );

  const visibleNode = (n: { type: string }) => activeTypes.has(n.type);
  const visibleEdge = (e: GraphEdge) => {
    const a = nodeById.get(e.sourceId);
    const b = nodeById.get(e.targetId);
    return (
      (showSecret || !e.secret) &&
      !!a &&
      !!b &&
      activeTypes.has(a.type) &&
      activeTypes.has(b.type)
    );
  };

  const neighbors = (id: string) => {
    const s = new Set<string>();
    for (const e of edges) {
      if (e.sourceId === id) s.add(e.targetId);
      if (e.targetId === id) s.add(e.sourceId);
    }
    return s;
  };
  const active = hover ?? sel;
  const nbrs = active ? neighbors(active) : null;

  const toggleType = (t: string) =>
    setActiveTypes((s) => {
      const next = new Set(s);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const typesPresent = useMemo(() => {
    const seen = new Map<string, number>();
    for (const n of nodes) seen.set(n.type, (seen.get(n.type) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [nodes]);
  const hasSecret = useMemo(() => edges.some((e) => e.secret), [edges]);

  const selNode = nodeById.get(sel) ?? simNodes[0];
  const selEdges = edges.filter(
    (e) => selNode && (e.sourceId === selNode.id || e.targetId === selNode.id),
  );

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* CANVAS */}
      <div className="relative min-w-0 overflow-hidden">
        {/* Toolbar: type filters + secret toggle */}
        <div className="pointer-events-none absolute inset-x-4 top-3 z-[5] flex flex-wrap items-center gap-2">
          <span className="kicker dim pointer-events-auto">Relationship graph</span>
          <div className="pointer-events-auto ml-auto flex flex-wrap gap-[5px]">
            {typesPresent.map(([type, count]) => {
              const on = activeTypes.has(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  aria-pressed={on}
                  className="inline-flex items-center gap-[6px] border px-2 py-[3px] font-mono text-[9.5px] uppercase tracking-[.06em] transition-colors"
                  style={{
                    background: on ? "var(--bg-2)" : "transparent",
                    color: on ? "var(--ink-dim)" : "var(--ink-faint)",
                    borderColor: on ? "var(--line-strong)" : "var(--line)",
                    opacity: on ? 1 : 0.5,
                  }}
                >
                  <span
                    aria-hidden
                    className="inline-block size-[8px] rounded-full"
                    style={{ background: entityTypeColor(type) }}
                  />
                  {formatEntityType(type)}
                  <span className="text-[var(--ink-faint)]">{count}</span>
                </button>
              );
            })}
            {hasSecret && (
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                aria-pressed={showSecret}
                title="Toggle secret edges"
                className="inline-flex items-center gap-[6px] border bg-[var(--bg-2)] px-2 py-[3px] font-mono text-[9.5px] uppercase tracking-[.06em]"
                style={{
                  color: showSecret ? "var(--hot)" : "var(--ink-faint)",
                  borderColor: showSecret
                    ? "color-mix(in srgb, var(--hot) 40%, transparent)"
                    : "var(--line)",
                }}
              >
                {showSecret ? (
                  <Eye aria-hidden size={11} />
                ) : (
                  <EyeOff aria-hidden size={11} />
                )}
                Secret
              </button>
            )}
          </div>
        </div>

        <svg
          ref={svgRef}
          role="img"
          aria-label="Relationship graph"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid slice"
          className="block h-full w-full"
          style={{
            cursor: isPanning ? "grabbing" : "grab",
            background:
              "radial-gradient(120% 100% at 50% 0%, var(--bg-1), var(--bg))",
          }}
          onPointerDown={onPointerDownBg}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={(e) => zoom(e.deltaY < 0 ? 1.12 : 0.89)}
        >
          <defs>
            <marker
              id="rg-arrow"
              markerWidth="9"
              markerHeight="9"
              refX="8"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L8,3 L0,6" fill="var(--ink-faint)" />
            </marker>
            <pattern id="rg-grid" width="44" height="44" patternUnits="userSpaceOnUse">
              <path
                d="M44 0H0V44"
                fill="none"
                stroke="var(--ink)"
                strokeOpacity={0.035}
                strokeWidth="1"
              />
            </pattern>
          </defs>

          <rect
            x="-2000"
            y="-2000"
            width="6000"
            height="6000"
            fill="url(#rg-grid)"
            transform={`translate(${view.x},${view.y}) scale(${view.k})`}
          />
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {/* Edges */}
            {edges.map((edge) => {
              if (!visibleEdge(edge)) return null;
              const a = nodeById.get(edge.sourceId);
              const b = nodeById.get(edge.targetId);
              if (!a || !b) return null;
              const dim =
                active !== null && active !== edge.sourceId && active !== edge.targetId;
              const onActive = active === edge.sourceId || active === edge.targetId;
              const disp = edge.disposition;
              return (
                <g key={edge.id} style={{ opacity: dim ? 0.12 : 1 }}>
                  <line
                    x1={a.px}
                    y1={a.py}
                    x2={b.px}
                    y2={b.py}
                    stroke={edge.secret ? "var(--hot)" : dispositionColor(disp)}
                    strokeWidth={Math.max(1, Math.abs(disp ?? 0) / 45 + 0.7)}
                    strokeDasharray={edge.secret ? "5 4" : undefined}
                    markerEnd="url(#rg-arrow)"
                    opacity={0.7}
                  >
                    <title>
                      {a.name}{" "}
                      {relationshipEdgeLabel(
                        edge.type as RelationshipTypeValue,
                        "out",
                      )}{" "}
                      {b.name}
                      {edge.secret ? " · secret" : ""}
                    </title>
                  </line>
                  {onActive && (
                    <text
                      x={(a.px + b.px) / 2}
                      y={(a.py + b.py) / 2 - 4}
                      textAnchor="middle"
                      className="font-mono"
                      fontSize={10}
                      fill={edge.secret ? "var(--hot)" : "var(--ink-dim)"}
                      style={{ pointerEvents: "none" }}
                    >
                      {relationshipEdgeLabel(
                        edge.type as RelationshipTypeValue,
                        "out",
                      )}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {simNodes.map((node) => {
              if (!visibleNode(node)) return null;
              const isActive = active === node.id;
              const isNbr = nbrs?.has(node.id) ?? false;
              const dim = active !== null && !isActive && !isNbr;
              const color = entityTypeColor(node.type);
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.px},${node.py})`}
                  role="button"
                  tabIndex={0}
                  aria-label={node.name}
                  className="cursor-pointer"
                  style={{ opacity: dim ? 0.25 : 1 }}
                  onPointerDown={(e) => onPointerDownNode(e, node.id)}
                  onMouseEnter={() => setHover(node.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(node.id)}
                  onBlur={() => setHover(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSel(node.id);
                    }
                  }}
                >
                  <circle
                    r={node.r + 4}
                    fill="none"
                    stroke={color}
                    strokeWidth={isActive ? 2 : 0}
                    opacity={0.5}
                  />
                  <circle r={node.r} fill="var(--bg-1)" stroke={color} strokeWidth={2} />
                  <circle
                    r={Math.max(2, node.r - 5)}
                    fill={color}
                    opacity={node.type === "NPC" ? 0.18 : 0.32}
                  />
                  {node.locked && (
                    <circle
                      r={node.r + 7}
                      fill="none"
                      stroke="var(--sys)"
                      strokeWidth={1.2}
                      strokeDasharray="3 3"
                    />
                  )}
                  <text
                    y={node.r + 15}
                    textAnchor="middle"
                    fontSize={13}
                    fontWeight={600}
                    fill={isActive ? "var(--ink)" : "var(--ink-dim)"}
                    style={{ pointerEvents: "none" }}
                  >
                    {node.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Zoom + hint */}
        <div className="absolute bottom-3 left-4 flex items-center gap-2">
          <div className="flex border border-[var(--line-strong)] bg-[var(--bg-1)]">
            {(
              [
                ["−", 0.85],
                ["+", 1.18],
              ] as const
            ).map(([label, f]) => (
              <button
                key={label}
                type="button"
                aria-label={f > 1 ? "Zoom in" : "Zoom out"}
                onClick={() => zoom(f)}
                className="h-7 w-[30px] text-[16px] text-[var(--ink-dim)] hover:text-[var(--ink)]"
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setSimNodes((current) =>
                current.map((node) => ({ ...node, pinned: false })),
              );
              setView({ x: 0, y: 0, k: 1 });
              setSimulationRun((current) => current + 1);
            }}
            className="hud-tag cursor-pointer bg-[var(--bg-1)]"
          >
            Reset layout
          </button>
          <span className="font-mono text-[10px] text-[var(--ink-faint)]">
            drag node · drag bg to pan · scroll to zoom
          </span>
        </div>
      </div>

      {/* CONNECTIONS PANEL */}
      <div className="hidden min-h-0 flex-col border-l border-[var(--line)] bg-[var(--bg-1)] lg:flex">
        {selNode && (
          <>
            <div className="border-b border-[var(--line)] px-[18px] py-4">
              <div className="mb-2 flex items-center gap-[9px]">
                <span
                  aria-hidden
                  className="inline-block size-[11px] rounded-full"
                  style={{ background: entityTypeColor(selNode.type) }}
                />
                <span className="font-mono text-[10px] uppercase tracking-[.1em] text-[var(--ink-faint)]">
                  {formatEntityType(selNode.type)}
                </span>
                {selNode.locked && (
                  <Lock aria-hidden size={12} style={{ color: "var(--sys)" }} />
                )}
              </div>
              <h2 className="font-display text-xl font-semibold">{selNode.name}</h2>
              <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-[var(--ink-faint)]">
                <span>{selEdges.length} connections</span>
                <Link
                  href={`/campaigns/${campaignId}/entities/${selNode.id}`}
                  className="inline-flex items-center gap-1 uppercase tracking-[.06em] text-[var(--accent)] hover:underline"
                >
                  Open
                  <ArrowRight aria-hidden size={11} />
                </Link>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-[14px] py-3">
              {selEdges.length === 0 && (
                <p className="px-1 text-[12px] text-[var(--ink-faint)]">
                  No connections.
                </p>
              )}
              {selEdges.map((e) => {
                const out = e.sourceId === selNode.id;
                const other = nodeById.get(out ? e.targetId : e.sourceId);
                if (!other) return null;
                const disp = e.disposition ?? 0;
                return (
                  <button
                    key={e.id}
                    type="button"
                    aria-label={`Select ${other.name} connection`}
                    onClick={() => setSel(other.id)}
                    className="mb-[6px] block w-full border border-[var(--line)] px-[11px] py-[10px] text-left transition-colors hover:border-[var(--line-strong)]"
                  >
                    <div className="mb-[6px] flex items-center gap-[7px]">
                      <ArrowRight
                        aria-hidden
                        size={12}
                        className={out ? "" : "rotate-180"}
                        style={{ color: "var(--ink-faint)" }}
                      />
                      <span
                        className="font-mono text-[10px] uppercase tracking-[.04em]"
                        style={{ color: e.secret ? "var(--hot)" : "var(--accent)" }}
                      >
                        {relationshipEdgeLabel(
                          e.type as RelationshipTypeValue,
                          out ? "out" : "in",
                        )}
                        {e.secret ? " · secret" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block size-[8px] shrink-0 rounded-full"
                        style={{ background: entityTypeColor(other.type) }}
                      />
                      <span className="text-[13px] font-semibold">{other.name}</span>
                    </div>
                    {e.disposition != null && <DispositionBar disposition={disp} />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
