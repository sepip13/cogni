"use client";

import ReactMarkdown from "react-markdown";
import type { Briefing, GuideSectionStatus } from "../types";

const RADIUS = 18;

// ── Shared bits ───────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        color: "var(--text-faint)",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function Markdown({ children }: { children: string }) {
  return (
    <div className="chat-markdown" style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--text)" }}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

function PrimaryButton({
  children,
  busy,
  onClick,
}: {
  children: React.ReactNode;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      style={{
        padding: "12px 26px",
        background: busy ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
        color: busy ? "var(--text-dim)" : "var(--bg)",
        border: "none",
        borderRadius: 11,
        fontSize: 14.5,
        fontWeight: 700,
        cursor: busy ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-labelledby="start-here-heading"
      className="fade-in"
      style={{
        position: "relative",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: RADIUS,
        padding: 0,
        overflow: "hidden",
        marginBottom: 22,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          insetBlock: 0,
          insetInlineStart: 0,
          width: 4,
          background: "linear-gradient(180deg, var(--accent), var(--accent-2))",
        }}
      />
      {children}
    </section>
  );
}

// ── State: not generated yet (the CTA) ────────────────────────────────────────

function StartCta({ courseName, busy, onGenerate }: { courseName: string; busy: boolean; onGenerate: () => void }) {
  return (
    <Shell>
      <div
        style={{
          display: "flex",
          gap: 18,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "24px 26px 24px 30px",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            flexShrink: 0,
            background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
          }}
        >
          🚀
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 id="start-here-heading" style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 5 }}>
            Start here
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.6, maxWidth: 560 }}>
            Before the map, get your game plan for <strong style={{ color: "var(--text)" }}>{courseName}</strong>: what
            the exam wants, how it&apos;s graded, exactly how many parts to study, where to begin and end — and what to
            add if anything&apos;s missing.
          </p>
        </div>
        <PrimaryButton busy={busy} onClick={onGenerate}>
          {busy ? "Building…" : "Build my game plan"}
        </PrimaryButton>
      </div>
    </Shell>
  );
}

// ── State: generating ─────────────────────────────────────────────────────────

function GeneratingState() {
  return (
    <Shell>
      <div style={{ display: "flex", gap: 18, alignItems: "center", padding: "26px 26px 26px 30px" }}>
        <div
          className="pulse-glow"
          aria-hidden="true"
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            flexShrink: 0,
            background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
          }}
        >
          🧭
        </div>
        <div>
          <h2 id="start-here-heading" style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
            Building your game plan…
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.6 }}>
            Reading your rubric and exam info, then mapping it onto your parts. This takes about half a minute.
          </p>
        </div>
      </div>
    </Shell>
  );
}

// ── State: failed ─────────────────────────────────────────────────────────────

function FailedState({ error, busy, onGenerate }: { error: string | null; busy: boolean; onGenerate: () => void }) {
  return (
    <Shell>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: "22px 26px 22px 30px" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 id="start-here-heading" style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
            Couldn&apos;t build your game plan
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.6 }}>
            {error || "Something went wrong while reading your material. Please try again."}
          </p>
        </div>
        <PrimaryButton busy={busy} onClick={onGenerate}>
          {busy ? "Retrying…" : "Try again"}
        </PrimaryButton>
      </div>
    </Shell>
  );
}

// ── State: ready (the briefing) ───────────────────────────────────────────────

function AssessmentTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{value || "—"}</div>
    </div>
  );
}

function PartsCallout({ parts }: { parts: Briefing["parts"] }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "center",
        flexWrap: "wrap",
        background: "var(--accent-soft)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--accent)", lineHeight: 1 }}>
          {parts.total}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)" }}>parts</span>
      </div>
      <span
        style={{
          flexShrink: 0,
          fontSize: 12.5,
          fontWeight: 700,
          color: "var(--bg)",
          background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
          borderRadius: 999,
          padding: "5px 12px",
        }}
      >
        {parts.must_study} essential
      </span>
      <p style={{ flex: 1, minWidth: 200, fontSize: 13, color: "var(--text)", lineHeight: 1.55 }}>{parts.explanation}</p>
    </div>
  );
}

function PathStep({ tag, text, color }: { tag: string; text: string; color: string }) {
  return (
    <div style={{ flex: 1, minWidth: 220, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "13px 15px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color, marginBottom: 5 }}>
        {tag}
      </div>
      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.55 }}>{text || "—"}</div>
    </div>
  );
}

function MissingCard({ missing }: { missing: Briefing["sufficiency"]["missing"] }) {
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--high)", borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span aria-hidden="true" style={{ fontSize: 15 }}>⚠️</span>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>To make this plan exam-accurate, add:</h3>
      </div>
      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
        {missing.map((m, i) => (
          <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{ color: "var(--high)", fontWeight: 700, lineHeight: 1.5 }}>+</span>
            <div>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{m.material}</span>
              {m.why ? <span style={{ fontSize: 13, color: "var(--text-dim)" }}> — {m.why}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SufficientNote() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        background: "var(--surface-2)",
        border: "1px solid var(--success)",
        borderRadius: 12,
        padding: "12px 15px",
        fontSize: 13,
        color: "var(--text)",
      }}
    >
      <span aria-hidden="true">✓</span>
      You&apos;ve uploaded everything needed to plan accurately for the grade.
    </div>
  );
}

function Block({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "22px 26px 24px 30px" }}>{children}</div>;
}

function ReadyState({
  courseName,
  briefing,
  busy,
  onGenerate,
}: {
  courseName: string;
  briefing: Briefing;
  busy: boolean;
  onGenerate: () => void;
}) {
  const { assessment, parts, path, sufficiency } = briefing;
  return (
    <Shell>
      <Block>
        {/* Header + bottom line */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span aria-hidden="true" style={{ fontSize: 18 }}>🧭</span>
            <h2 id="start-here-heading" style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Start here: your game plan
            </h2>
          </div>
          {briefing.bottom_line ? (
            <p style={{ fontSize: 15.5, fontWeight: 600, color: "var(--text)", lineHeight: 1.55, letterSpacing: "-0.01em" }}>
              {briefing.bottom_line}
            </p>
          ) : null}
        </div>

        {/* Assessment tiles */}
        <div>
          <SectionLabel>The assessment</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            <AssessmentTile label="Format" value={assessment.format} />
            <AssessmentTile label="When" value={assessment.when} />
            <AssessmentTile label="Graded on" value={assessment.grading_basis} />
          </div>
        </div>

        {/* What it takes */}
        {briefing.what_it_takes ? (
          <div>
            <SectionLabel>What it takes to score well</SectionLabel>
            <Markdown>{briefing.what_it_takes}</Markdown>
          </div>
        ) : null}

        {/* Parts */}
        <div>
          <SectionLabel>How much of your guide to study</SectionLabel>
          <PartsCallout parts={parts} />
        </div>

        {/* Path */}
        <div>
          <SectionLabel>Where to start and finish</SectionLabel>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: path.why_this_order ? 10 : 0 }}>
            <PathStep tag="Start" text={path.start} color="var(--accent)" />
            <PathStep tag="Finish" text={path.finish} color="var(--success)" />
          </div>
          {path.why_this_order ? (
            <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.55 }}>{path.why_this_order}</p>
          ) : null}
        </div>

        {/* How to study */}
        {briefing.how_to_study ? (
          <div>
            <SectionLabel>How to work through it</SectionLabel>
            <Markdown>{briefing.how_to_study}</Markdown>
          </div>
        ) : null}

        {/* Sufficiency */}
        <div>
          <SectionLabel>Is your material enough?</SectionLabel>
          {sufficiency.sufficient || sufficiency.missing.length === 0 ? (
            <SufficientNote />
          ) : (
            <MissingCard missing={sufficiency.missing} />
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <button
            onClick={onGenerate}
            disabled={busy}
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--text-dim)",
              background: "none",
              border: "none",
              cursor: busy ? "default" : "pointer",
            }}
          >
            {busy ? "Rebuilding…" : "↻ Rebuild from latest material"}
          </button>
        </div>
      </Block>
    </Shell>
  );
}

// ── Entry ─────────────────────────────────────────────────────────────────────

export function StartHerePanel({
  courseName,
  status,
  briefing,
  error,
  busy,
  onGenerate,
}: {
  courseName: string;
  status: GuideSectionStatus;
  briefing: Briefing | null;
  error: string | null;
  busy: boolean;
  onGenerate: () => void;
}) {
  if (busy || status === "GENERATING") return <GeneratingState />;
  if (status === "READY" && briefing) {
    return <ReadyState courseName={courseName} briefing={briefing} busy={busy} onGenerate={onGenerate} />;
  }
  if (status === "FAILED") return <FailedState error={error} busy={busy} onGenerate={onGenerate} />;
  return <StartCta courseName={courseName} busy={busy} onGenerate={onGenerate} />;
}
