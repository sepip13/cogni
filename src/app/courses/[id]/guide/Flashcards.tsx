"use client";

import { useCallback, useEffect, useState } from "react";
import type { Flashcard, FlashcardRating } from "../types";

const RATINGS: { key: FlashcardRating; label: string; hint: string; color: string }[] = [
  { key: "again", label: "Again", hint: "1", color: "var(--high)" },
  { key: "hard", label: "Hard", hint: "2", color: "var(--med)" },
  { key: "good", label: "Good", hint: "3", color: "var(--accent)" },
  { key: "easy", label: "Easy", hint: "4", color: "var(--success)" },
];

interface FlashcardsResponse {
  cards: Flashcard[];
}

export function Flashcards({
  courseId,
  conceptKey,
  dueOnly,
  labelFor,
  onClose,
  onChanged,
  onJumpToConcept,
}: {
  courseId: string;
  conceptKey: string | null;
  dueOnly: boolean;
  labelFor: (key: string | null) => string;
  onClose: () => void;
  onChanged: () => void;
  onJumpToConcept: (key: string) => void;
}) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (dueOnly) qs.set("due", "1");
    if (conceptKey) qs.set("conceptKey", conceptKey);
    fetch(`/api/courses/${courseId}/flashcards?${qs.toString()}`)
      .then((r) => (r.ok ? (r.json() as Promise<FlashcardsResponse>) : Promise.reject()))
      .then((d) => setCards(d.cards))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [courseId, conceptKey, dueOnly]);

  const card = cards[idx];
  const done = loaded && idx >= cards.length && cards.length > 0;

  const rate = useCallback(
    (rating: FlashcardRating) => {
      const current = cards[idx];
      if (!current) return;
      // Optimistic: advance immediately; the review write is fast + fire-and-forget.
      fetch(`/api/courses/${courseId}/flashcards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: current.id, rating }),
      }).catch(() => {});
      setFlipped(false);
      setIdx((i) => i + 1);
    },
    [cards, idx, courseId]
  );

  // Tell the parent to refresh its counts once the session ends.
  useEffect(() => {
    if (done) onChanged();
  }, [done, onChanged]);

  // Keyboard: Space/Enter flips, 1–4 rate a flipped card, Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (!card) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      if (flipped) {
        const r = RATINGS.find((x) => x.hint === e.key);
        if (r) {
          e.preventDefault();
          rate(r.key);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, flipped, rate, onClose]);

  const remaining = Math.max(0, cards.length - idx);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Flashcard review"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(4, 7, 16, 0.62)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        className="fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 540,
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 18,
          padding: 22,
          boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span aria-hidden="true" style={{ fontSize: 18 }}>🃏</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {conceptKey ? labelFor(conceptKey) : "Flashcards"}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close review"
            style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {!loaded ? (
          <div className="skeleton" style={{ height: 220, borderRadius: 12 }} aria-busy="true" />
        ) : done || cards.length === 0 ? (
          <div style={{ textAlign: "center", padding: "36px 12px" }}>
            <div style={{ fontSize: 34, marginBottom: 12 }} aria-hidden="true">{cards.length === 0 ? "🗂️" : "✅"}</div>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
              {cards.length === 0 ? "No cards due" : "All caught up"}
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 20 }}>
              {cards.length === 0
                ? "Nothing to review here right now. Come back when cards are due."
                : `You reviewed ${cards.length} card${cards.length === 1 ? "" : "s"}. Nice work.`}
            </p>
            <button
              onClick={onClose}
              style={{ padding: "11px 24px", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "var(--bg)", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              Done
            </button>
          </div>
        ) : card ? (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, fontSize: 12, color: "var(--text-dim)" }}>
              <span style={{ fontFamily: "var(--font-jetbrains), monospace" }}>{remaining} left</span>
              <span style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10, fontWeight: 700, color: "var(--text-faint)" }}>
                {card.kind === "CLOZE" ? "Fill the blank" : "Recall"}
              </span>
            </div>

            <button
              onClick={() => setFlipped((f) => !f)}
              aria-label={flipped ? "Hide answer" : "Reveal answer"}
              style={{
                width: "100%",
                textAlign: "left",
                minHeight: 200,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 20,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <p style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.5, color: "var(--text)" }}>{card.front}</p>
              {flipped ? (
                <div
                  className="fade-in"
                  style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: "auto" }}
                >
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-dim)" }}>{card.back}</p>
                </div>
              ) : (
                <span style={{ marginTop: "auto", fontSize: 12, color: "var(--text-faint)" }}>
                  Tap or press Space to reveal
                </span>
              )}
            </button>

            <div style={{ minHeight: 30, marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              {card.conceptKey ? (
                <button
                  onClick={() => onJumpToConcept(card.conceptKey!)}
                  style={{ fontSize: 12, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  from: <span style={{ color: "var(--accent)" }}>{labelFor(card.conceptKey)}</span>
                </button>
              ) : (
                <span />
              )}
            </div>

            {flipped && (
              <div className="fade-in" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 6 }}>
                {RATINGS.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => rate(r.key)}
                    style={{
                      padding: "11px 6px",
                      background: "var(--surface-2)",
                      border: `1px solid ${r.color}`,
                      borderRadius: 10,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: r.color }}>{r.label}</span>
                    <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "var(--font-jetbrains), monospace" }}>{r.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
