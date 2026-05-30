"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MindMap } from "../types";

const W = 840;
const H = 500;
const PAD = 46;

// Cluster palette built only from theme tokens (works in both themes).
const CLUSTER_COLORS = [
  "var(--accent)",
  "var(--accent-2)",
  "var(--low)",
  "var(--med)",
  "var(--success)",
  "var(--high)",
];

interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  r: number;
  color: string;
  label: string;
}

function radiusFor(examImportance: number, learningImportance: number): number {
  return 11 + (examImportance + learningImportance) * 2.1; // ~15 … ~32
}

export function MindMapGraph({
  mindMap,
  selectedId,
  onSelect,
}: {
  mindMap: MindMap;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<SimNode[]>([]);
  const alphaRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  // Rendered snapshot (immutable copy of the physics state each frame). The
  // mutable simulation lives in simRef and is only touched in effects/handlers.
  const [frame, setFrame] = useState<SimNode[]>([]);
  const snapshot = useCallback(() => simRef.current.map((n) => ({ ...n })), []);

  const clusterColor = useMemo(() => {
    const ids = Array.from(new Set(mindMap.clusters.map((c) => c.id).concat(mindMap.nodes.map((n) => n.cluster))));
    const map = new Map<string, string>();
    ids.forEach((id, i) => map.set(id, CLUSTER_COLORS[i % CLUSTER_COLORS.length]));
    return map;
  }, [mindMap]);

  // Build the simulation nodes once per mind map. Deterministic ring seed (no
  // randomness) so there's no hydration flicker.
  useEffect(() => {
    const n = mindMap.nodes.length;
    simRef.current = mindMap.nodes.map((node, i) => {
      const angle = (i / Math.max(1, n)) * Math.PI * 2;
      return {
        id: node.id,
        x: W / 2 + Math.cos(angle) * (W / 3),
        y: H / 2 + Math.sin(angle) * (H / 3),
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        r: radiusFor(node.examImportance, node.learningImportance),
        color: clusterColor.get(node.cluster) ?? "var(--accent)",
        label: node.label,
      };
    });
    alphaRef.current = 1;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      for (let i = 0; i < 280; i++) stepOnce(mindMap, alphaRef, simRef.current);
      rafRef.current = requestAnimationFrame(() => setFrame(snapshot()));
      return;
    }

    const loop = () => {
      stepOnce(mindMap, alphaRef, simRef.current);
      setFrame(snapshot());
      if (alphaRef.current > 0.012 || dragRef.current) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mindMap, clusterColor, snapshot]);

  function reheat() {
    alphaRef.current = Math.max(alphaRef.current, 0.5);
    if (rafRef.current === null) {
      const loop = () => {
        stepOnce(mindMap, alphaRef, simRef.current);
        setFrame(snapshot());
        if (alphaRef.current > 0.012 || dragRef.current) {
          rafRef.current = requestAnimationFrame(loop);
        } else {
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(loop);
    }
  }

  function toSvg(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  }

  function onPointerDown(e: React.PointerEvent, id: string) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { id, moved: false };
    const p = toSvg(e.clientX, e.clientY);
    const node = simRef.current.find((nd) => nd.id === id);
    if (node) {
      node.fx = p.x;
      node.fy = p.y;
    }
    reheat();
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    drag.moved = true;
    const p = toSvg(e.clientX, e.clientY);
    const node = simRef.current.find((nd) => nd.id === drag.id);
    if (node) {
      node.fx = Math.max(PAD, Math.min(W - PAD, p.x));
      node.fy = Math.max(PAD, Math.min(H - PAD, p.y));
    }
    reheat();
  }

  function onPointerUp() {
    const drag = dragRef.current;
    if (!drag) return;
    const node = simRef.current.find((nd) => nd.id === drag.id);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    if (!drag.moved) onSelect(drag.id);
    dragRef.current = null;
    reheat();
  }

  const nodes = frame;
  const posById = new Map(nodes.map((n) => [n.id, n]));

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Concept mind map"
      style={{ display: "block", touchAction: "none", userSelect: "none", maxHeight: "70vh" }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* edges */}
      <g>
        {mindMap.edges.map((e, i) => {
          const a = posById.get(e.from);
          const b = posById.get(e.to);
          if (!a || !b) return null;
          const active = selectedId === e.from || selectedId === e.to;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={active ? "var(--accent)" : "var(--border-strong)"}
              strokeWidth={active ? 2 : 1}
              strokeOpacity={active ? 0.9 : 0.5}
              strokeDasharray={e.type === "prerequisite" ? "0" : e.type === "contrast" ? "2 5" : "0"}
            />
          );
        })}
      </g>

      {/* nodes */}
      <g>
        {nodes.map((n) => {
          const selected = selectedId === n.id;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              style={{ cursor: "pointer" }}
              onPointerDown={(e) => onPointerDown(e, n.id)}
            >
              <circle
                r={n.r}
                fill={n.color}
                fillOpacity={selected ? 0.95 : 0.22}
                stroke={n.color}
                strokeWidth={selected ? 3 : 1.5}
              />
              <text
                textAnchor="middle"
                y={n.r + 13}
                style={{
                  fontSize: 11,
                  fontWeight: selected ? 700 : 500,
                  fill: selected ? "var(--text)" : "var(--text-dim)",
                  pointerEvents: "none",
                }}
              >
                {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// ── Force simulation (one tick) ───────────────────────────────────────────────

const CHARGE = -13000;
const LINK_DIST = 160;
const LINK_STRENGTH = 0.04;
const GRAVITY = 0.018;
const FRICTION = 0.86;
const DECAY = 0.985;
const COLLISION_GAP = 18;

function stepOnce(
  mindMap: MindMap,
  alphaRef: { current: number },
  nodes: SimNode[]
): void {
  const alpha = alphaRef.current;

  // Repulsion (charge) — O(n²), fine for ≤30 nodes.
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let dist2 = dx * dx + dy * dy;
      if (dist2 < 1) {
        dx = (i - j) || 1;
        dy = 1;
        dist2 = 2;
      }
      const dist = Math.sqrt(dist2);
      const force = (CHARGE * alpha) / dist2;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }

  // Links (springs).
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of mindMap.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const diff = ((dist - LINK_DIST) / dist) * LINK_STRENGTH * alpha;
    a.vx += dx * diff;
    a.vy += dy * diff;
    b.vx -= dx * diff;
    b.vy -= dy * diff;
  }

  // Gravity to center + integrate.
  for (const n of nodes) {
    if (n.fx !== null && n.fy !== null) {
      n.x = n.fx;
      n.y = n.fy;
      n.vx = 0;
      n.vy = 0;
      continue;
    }
    n.vx += (W / 2 - n.x) * GRAVITY * alpha;
    n.vy += (H / 2 - n.y) * GRAVITY * alpha;
    n.vx *= FRICTION;
    n.vy *= FRICTION;
    n.x = Math.max(PAD, Math.min(W - PAD, n.x + n.vx));
    n.y = Math.max(PAD, Math.min(H - PAD, n.y + n.vy));
  }

  // Collision: hard-separate overlapping nodes — the biggest readability win.
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const min = a.r + b.r + COLLISION_GAP;
      if (dist < min) {
        const push = (min - dist) / 2;
        const ox = (dx / dist) * push;
        const oy = (dy / dist) * push;
        if (a.fx === null) {
          a.x = Math.max(PAD, Math.min(W - PAD, a.x - ox));
          a.y = Math.max(PAD, Math.min(H - PAD, a.y - oy));
        }
        if (b.fx === null) {
          b.x = Math.max(PAD, Math.min(W - PAD, b.x + ox));
          b.y = Math.max(PAD, Math.min(H - PAD, b.y + oy));
        }
      }
    }
  }

  alphaRef.current = alpha * DECAY;
}
