"use client";

import { useEffect } from "react";
import { useFeedbackSurvey } from "@/hooks/useFeedbackSurvey";

/**
 * Polite, non-modal corner card inviting the user to the interview Google Form.
 * Mounted once globally (see providers.tsx). All visibility / persistence logic
 * lives in useFeedbackSurvey — this component is pure presentation.
 */
export function FeedbackSurveyPrompt() {
  const { visible, takeSurvey, snooze, dismissForever } = useFeedbackSurvey();

  // Esc dismisses for now (= "Maybe later"), matching the × close affordance.
  useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") snooze();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, snooze]);

  if (!visible) return null;

  return (
    <div className="fb-survey">
      <div
        role="region"
        aria-label="Feedback request"
        className="fade-in"
        style={{
          width: 360,
          maxWidth: "100%",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 14,
          padding: 18,
          boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)" }}>
            Got a minute to shape Cogni?
          </h2>
          <button
            onClick={snooze}
            aria-label="Dismiss"
            style={{
              fontSize: 20,
              lineHeight: 1,
              color: "var(--text-dim)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 2,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 14 }}>
          We&rsquo;re running quick interviews to make Cogni better — it takes about a
          minute, and your answers would mean a lot.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={takeSurvey}
            style={{
              flex: 1,
              padding: "10px 14px",
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: "var(--bg)",
              border: "none",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Take the survey
          </button>
          <button
            onClick={snooze}
            style={{
              padding: "10px 14px",
              background: "var(--surface-2)",
              color: "var(--text-dim)",
              border: "1px solid var(--border-strong)",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Maybe later
          </button>
        </div>

        <button
          onClick={dismissForever}
          style={{
            marginTop: 10,
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-faint)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 2,
          }}
        >
          Don&rsquo;t show this again
        </button>
      </div>
    </div>
  );
}
