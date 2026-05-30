"use client";

import ReactMarkdown from "react-markdown";
import type { GuideSection } from "../types";

function NumberBadge({ n }: { n: number }) {
  return (
    <span
      style={{
        width: 26,
        height: 26,
        flexShrink: 0,
        borderRadius: 8,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 700,
        fontFamily: "var(--font-jetbrains), monospace",
        color: "var(--text-dim)",
      }}
      aria-hidden="true"
    >
      {n}
    </span>
  );
}

function Spinner() {
  return (
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "2px solid var(--border-strong)",
        borderTopColor: "var(--accent)",
        animation: "spin 0.7s linear infinite",
        display: "inline-block",
        flexShrink: 0,
      }}
      aria-hidden="true"
    />
  );
}

function GenerateButton({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        padding: "9px 18px",
        background: busy ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
        color: busy ? "var(--text-dim)" : "var(--bg)",
        border: "none",
        borderRadius: 9,
        fontSize: 13,
        fontWeight: 700,
        cursor: busy ? "default" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

function SectionCard({
  index,
  section,
  onGenerate,
}: {
  index: number;
  section: GuideSection;
  onGenerate: (id: string) => void;
}) {
  return (
    <article
      id={`section-${section.conceptKey}`}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "18px 22px",
        scrollMarginTop: 80,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: section.status === "READY" ? 12 : 0 }}>
        <NumberBadge n={index} />
        <h3 style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", flex: 1, minWidth: 0 }}>
          {section.title}
        </h3>
        {section.status === "GENERATING" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text-dim)" }}>
            <Spinner /> Writing…
          </span>
        )}
      </div>

      {section.status === "READY" && section.contentMd ? (
        <div className="chat-markdown" style={{ fontSize: 14, lineHeight: 1.65, color: "var(--text)" }}>
          <ReactMarkdown>{section.contentMd}</ReactMarkdown>
        </div>
      ) : section.status === "PENDING" ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Not written yet.</span>
          <GenerateButton label="Generate this part" busy={false} onClick={() => onGenerate(section.id)} />
        </div>
      ) : section.status === "FAILED" ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--high)" }}>Couldn&apos;t write this part.</span>
          <GenerateButton label="Try again" busy={false} onClick={() => onGenerate(section.id)} />
        </div>
      ) : section.status === "GENERATING" ? (
        <div className="skeleton" style={{ height: 84, borderRadius: 10, marginTop: 12 }} aria-busy="true" />
      ) : null}
    </article>
  );
}

export function GuideReader({
  sections,
  onGenerate,
}: {
  sections: GuideSection[];
  onGenerate: (id: string) => void;
}) {
  if (sections.length === 0) return null;
  const readyCount = sections.filter((s) => s.status === "READY").length;

  return (
    <section aria-labelledby="guide-reader-heading" style={{ marginTop: 40 }}>
      <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
        <h2 id="guide-reader-heading" style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.015em" }}>
          Your study guide
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>
          Plain-language explanations in the right order · {readyCount}/{sections.length} written · generate each part as you go
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {sections.map((s, i) => (
          <SectionCard key={s.id} index={i + 1} section={s} onGenerate={onGenerate} />
        ))}
      </div>
    </section>
  );
}
