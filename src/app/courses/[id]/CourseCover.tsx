"use client";

import { useState } from "react";

// AI cover art for a course (FLUX.1-schnell via NVIDIA, ~3s). On-demand: a slim
// CTA until generated, then a wide banner with a glass "Regenerate" control.
export function CourseCover({
  courseId,
  courseName,
  initialUrl,
}: {
  courseId: string;
  courseName: string;
  initialUrl: string | null;
}) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/courses/${courseId}/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const b = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !b.url) {
        setError(b.error ?? "Couldn't generate a cover.");
        return;
      }
      setUrl(b.url);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!url) {
    return (
      <div
        className="fade-in"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          background: "var(--surface)",
          border: "1px dashed var(--border-strong)",
          borderRadius: 14,
          padding: "12px 16px",
          marginBottom: 22,
        }}
      >
        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
          Give this course a unique AI cover.
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {error && <span style={{ fontSize: 12, color: "var(--high)" }}>{error}</span>}
          <button
            onClick={generate}
            disabled={busy}
            style={{
              padding: "8px 16px",
              background: busy ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: busy ? "var(--text-dim)" : "var(--bg)",
              border: "none",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
              whiteSpace: "nowrap",
            }}
            aria-busy={busy}
          >
            {busy ? "Painting your cover…" : "✨ Generate cover"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fade-in"
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1344 / 768",
        maxHeight: 220,
        borderRadius: 16,
        overflow: "hidden",
        marginBottom: 22,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- served from our own /api/files route, not optimized */}
      <img
        src={url}
        alt={`Cover art for ${courseName}`}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.28), transparent 45%)",
          pointerEvents: "none",
        }}
      />
      <button
        onClick={generate}
        disabled={busy}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          padding: "6px 12px",
          background: "rgba(10,14,26,0.5)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          color: "rgba(255,255,255,0.95)",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          cursor: busy ? "default" : "pointer",
        }}
        aria-busy={busy}
      >
        {busy ? "Painting…" : "↻ Regenerate"}
      </button>
      {error && (
        <span style={{ position: "absolute", bottom: 8, left: 12, fontSize: 12, color: "rgba(255,255,255,0.95)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
