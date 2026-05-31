"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CourseData } from "./types";

/* ── Bespoke line-style icons (theme-aware via currentColor) ───────────────────
   Drawn in code, not generated — instant, weightless, and consistent in both
   themes. Each pairs with a faint corner motif for a little depth. */

const SVG = {
  viewBox: "0 0 24 24",
  width: 24,
  height: 24,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function IconGuide() {
  return (
    <svg {...SVG} aria-hidden="true">
      <circle cx="6" cy="7" r="2.1" />
      <circle cx="18" cy="6" r="1.9" />
      <circle cx="13" cy="17.5" r="2.4" />
      <path d="M7.7 8.4l4 7.2M16.4 7.4l-2.7 8.1M8 7l8-1" />
    </svg>
  );
}

function IconCards() {
  return (
    <svg {...SVG} aria-hidden="true">
      <rect x="6.6" y="3.4" width="13" height="9" rx="2" transform="rotate(9 13 8)" />
      <rect x="3.5" y="9" width="13" height="11" rx="2" />
      <path d="M6.6 13h6.8M6.6 16h4" />
    </svg>
  );
}

function IconExam() {
  return (
    <svg {...SVG} aria-hidden="true">
      <rect x="5" y="3.5" width="14" height="17" rx="2.2" />
      <path d="M8 8l1.3 1.3L11.4 7" />
      <path d="M13.2 8.4h2.6M8 12.6h7.8M8 16.2h5" />
    </svg>
  );
}

function IconWork() {
  return (
    <svg {...SVG} aria-hidden="true">
      <path d="M7 3.5h6l4 4V19.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z" />
      <path d="M13 3.5V8h4" />
      <path d="M8.6 13.4l1.6 1.6 3.2-3.4" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg {...SVG} aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2.2" />
      <path d="M4 9.5h16M8.5 3.5v3.4M15.5 3.5v3.4" />
      <path d="M8 13h1.4M11.3 13h1.4M14.6 13h1.4M8 16.4h1.4M11.3 16.4h1.4" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg {...SVG} aria-hidden="true">
      <path d="M5 5.5h14A1.6 1.6 0 0 1 20.5 7v7.6A1.6 1.6 0 0 1 19 16.2h-8.4L6.5 19.6v-3.4H5A1.6 1.6 0 0 1 3.5 14.6V7A1.6 1.6 0 0 1 5 5.5z" />
      <path d="M8 9.5h8M8 12.4h5" />
    </svg>
  );
}

/* A faint concentric-arc motif bleeding from the bottom-right corner. Colored
   per feature, brightened on hover (see .feature-tile:hover .feature-motif). */
function Motif({ color }: { color: string }) {
  return (
    <svg
      className="feature-motif"
      aria-hidden="true"
      viewBox="0 0 100 100"
      style={{ position: "absolute", right: -26, bottom: -26, width: 104, height: 104, color, pointerEvents: "none" }}
    >
      <g fill="none" stroke="currentColor" strokeWidth={1.4}>
        <circle cx="50" cy="50" r="20" />
        <circle cx="50" cy="50" r="33" />
        <circle cx="50" cy="50" r="46" />
      </g>
    </svg>
  );
}

interface Feature {
  key: string;
  title: string;
  desc: string;
  color: string;
  icon: React.ReactNode;
  href?: string;
  anchor?: string;
  featured?: boolean;
  badge?: number;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function TileInner({ f }: { f: Feature }) {
  return (
    <>
      <Motif color={f.color} />
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: f.featured ? "var(--bg)" : f.color,
          background: f.featured
            ? "linear-gradient(135deg, var(--accent), var(--accent-2))"
            : "color-mix(in oklab, " + f.color + " 14%, transparent)",
          border: f.featured ? "none" : "1px solid color-mix(in oklab, " + f.color + " 30%, transparent)",
        }}
      >
        {f.icon}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)" }}>{f.title}</h3>
        {f.badge != null && f.badge > 0 && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "var(--bg)",
              background: "var(--high)",
              borderRadius: 9,
              padding: "1px 7px",
              lineHeight: 1.6,
            }}
          >
            {f.badge} due
          </span>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5, marginTop: 3 }}>{f.desc}</p>
    </>
  );
}

const TILE_STYLE: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: "18px 18px 20px",
  minHeight: 132,
  textDecoration: "none",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
  font: "inherit",
  width: "100%",
};

export function FeatureLauncher({ course }: { course: CourseData }) {
  const [due, setDue] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/courses/${course.id}/flashcards`)
      .then((r) => (r.ok ? (r.json() as Promise<{ counts?: { due?: number } }>) : Promise.reject()))
      .then((d) => {
        if (alive) setDue(d.counts?.due ?? 0);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [course.id]);

  const days = daysUntil(course.examDate);
  const cardsHref =
    due && due > 0 ? `/courses/${course.id}/guide?review=due` : `/courses/${course.id}/guide`;

  const features: Feature[] = [
    {
      key: "guide",
      title: "Study guide",
      desc: "Concept map + plain-language lessons",
      color: "var(--accent)",
      icon: <IconGuide />,
      href: `/courses/${course.id}/guide`,
      featured: true,
    },
    {
      key: "cards",
      title: "Flashcards",
      desc: "Active recall, spaced repetition",
      color: "var(--accent-2)",
      icon: <IconCards />,
      href: cardsHref,
      badge: due ?? undefined,
    },
    {
      key: "exams",
      title: "Exam trainer",
      desc: "Mock papers in your exam's style",
      color: "var(--low)",
      icon: <IconExam />,
      href: `/courses/${course.id}/exams`,
    },
    {
      key: "work",
      title: "My work",
      desc: "Get your assignments reviewed",
      color: "var(--success)",
      icon: <IconWork />,
      anchor: "my-work",
    },
    {
      key: "calendar",
      title: "Calendar",
      desc: days != null ? `${days <= 0 ? "Exam time" : `${days} days to your exam`}` : "Plan your study days",
      color: "var(--med)",
      icon: <IconCalendar />,
      href: `/courses/${course.id}/calendar`,
    },
    {
      key: "chat",
      title: "Ask Cogni",
      desc: "Chat with your own materials",
      color: "var(--accent)",
      icon: <IconChat />,
      href: `/courses/${course.id}/chat`,
    },
  ];

  return (
    <section aria-label="Course features" style={{ marginBottom: 28 }}>
      <div
        className="fade-up-stagger"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(214px, 1fr))", gap: 12 }}
      >
        {features.map((f) =>
          f.href ? (
            <Link key={f.key} href={f.href} className="feature-tile" style={TILE_STYLE}>
              <TileInner f={f} />
            </Link>
          ) : (
            <button
              key={f.key}
              type="button"
              className="feature-tile"
              style={TILE_STYLE}
              onClick={() =>
                document.getElementById(f.anchor ?? "")?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              <TileInner f={f} />
            </button>
          )
        )}
      </div>
    </section>
  );
}
