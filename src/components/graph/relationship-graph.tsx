"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { entityTypeColor, formatEntityType } from "@/lib/entities";
import {
  relationshipEdgeLabel,
  type RelationshipTypeValue,
} from "@/lib/relationship-types";
import type { GraphEdge, GraphNode } from "@/server/services/relationships";

// Square SVG canvas; nodes sit on a circle inside it and labels splay outward,
// so the radius leaves room for text on either side.
const SIZE = 920;
const CENTER = SIZE / 2;
const RADIUS = 330;

type Placed = GraphNode & { x: number; y: number; angle: number };

function layout(nodes: GraphNode[]): Placed[] {
  const n = nodes.length;
  return nodes.map((node, i) => {
    // Start at the top (-90°) and walk clockwise so order is stable/predictable.
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
    return {
      ...node,
      angle,
      x: CENTER + RADIUS * Math.cos(angle),
      y: CENTER + RADIUS * Math.sin(angle),
    };
  });
}

/**
 * Basic, dependency-free relationship graph: entities placed on a circle with
 * their edges drawn between them (docs/11-roadmap.md M3 — "start simple"). Hover
 * a node to highlight its edges; click to open the entity. All data is already
 * visibility-scoped by the service.
 */
export function RelationshipGraph({
  campaignId,
  nodes,
  edges,
}: {
  campaignId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);

  const placed = useMemo(() => layout(nodes), [nodes]);
  const byId = useMemo(
    () => new Map(placed.map((p) => [p.id, p])),
    [placed],
  );

  // Distinct entity types present, for the legend.
  const legend = useMemo(() => {
    const seen = new Map<string, number>();
    for (const node of nodes) seen.set(node.type, (seen.get(node.type) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  const open = (id: string) =>
    router.push(`/campaigns/${campaignId}/entities/${id}`);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {legend.map(([type, count]) => (
          <span
            key={type}
            className="flex items-center gap-[6px] font-mono text-[10px] uppercase tracking-[.06em] text-[var(--ink-dim)]"
          >
            <span
              aria-hidden
              className="inline-block size-[8px] rounded-full"
              style={{ background: entityTypeColor(type) }}
            />
            {formatEntityType(type)}
            <span className="text-[var(--ink-faint)]">{count}</span>
          </span>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        <svg
          role="img"
          aria-label="Relationship graph"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="mx-auto h-full max-h-[78vh] w-full max-w-[920px]"
        >
          <defs>
            <marker
              id="rg-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-faint)" />
            </marker>
          </defs>

          {/* Edges first, so nodes sit on top. */}
          {edges.map((edge) => {
            const a = byId.get(edge.sourceId);
            const b = byId.get(edge.targetId);
            if (!a || !b) return null;
            const dim = active !== null && active !== a.id && active !== b.id;
            const highlight =
              active !== null && (active === a.id || active === b.id);
            const color = edge.secret
              ? "var(--hot)"
              : highlight
                ? "var(--accent)"
                : "var(--line-strong)";
            return (
              <line
                key={edge.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth={highlight ? 1.8 : 1}
                strokeDasharray={edge.secret ? "5 4" : undefined}
                strokeOpacity={dim ? 0.15 : 0.8}
                markerEnd="url(#rg-arrow)"
              >
                <title>
                  {a.name}{" "}
                  {relationshipEdgeLabel(edge.type as RelationshipTypeValue, "out")}{" "}
                  {b.name}
                  {edge.secret ? " · secret" : ""}
                </title>
              </line>
            );
          })}

          {/* Nodes */}
          {placed.map((node) => {
            const dim = active !== null && active !== node.id;
            // Splay labels outward from the circle center.
            const onRight = Math.cos(node.angle) >= 0;
            const lx = node.x + (onRight ? 11 : -11);
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={node.name}
                className="cursor-pointer"
                opacity={dim ? 0.3 : 1}
                onClick={() => open(node.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open(node.id);
                  }
                }}
                onMouseEnter={() => setActive(node.id)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(node.id)}
                onBlur={() => setActive(null)}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={6}
                  fill={entityTypeColor(node.type)}
                  stroke="var(--bg-1)"
                  strokeWidth={1.5}
                />
                {node.locked && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={9}
                    fill="none"
                    stroke="var(--sys)"
                    strokeWidth={1.2}
                  />
                )}
                <text
                  x={lx}
                  y={node.y}
                  textAnchor={onRight ? "start" : "end"}
                  dominantBaseline="middle"
                  className="font-mono"
                  fontSize={12}
                  fill={active === node.id ? "var(--ink)" : "var(--ink-dim)"}
                >
                  {node.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
