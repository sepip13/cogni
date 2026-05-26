"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { label: "Reading your course materials", detail: "parsing text…" },
  { label: "Mapping topics to grading rubric", detail: "identifying weights…" },
  { label: "Ranking by exam impact", detail: "scoring priorities…" },
  { label: "Building your study plan", detail: "writing plan…" },
];

export function ProcessingView({ name }: { name?: string }) {
  const [step, setStep] = useState(0);

  // Advance one step every 7 s so the UI reflects rough progress
  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }, 7000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        maxWidth: 540,
        margin: "72px auto 0",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          background: "var(--accent-soft)",
          borderRadius: 14,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent)",
          fontSize: 22,
          marginBottom: 20,
        }}
        aria-hidden="true"
      >
        ⚡
      </div>

      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          marginBottom: 8,
        }}
      >
        Cogni is reading{name ? ` ${name}` : " your course"}
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 36 }}>
        Usually takes 20–40 seconds…
      </p>

      {/* Step list */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "22px 24px",
          textAlign: "left",
        }}
      >
        {STEPS.map((s, i) => {
          const isDone = i < step;
          const isActive = i === step;
          return (
            <div
              key={s.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 0",
                borderBottom:
                  i < STEPS.length - 1 ? "1px solid var(--border)" : "none",
                opacity: isDone || isActive ? 1 : 0.3,
                transition: "opacity 0.4s",
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  border: isDone
                    ? "none"
                    : `2px solid ${isActive ? "var(--accent)" : "var(--border-strong)"}`,
                  borderTopColor: isActive ? "transparent" : undefined,
                  background: isDone ? "var(--success)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  animation: isActive ? "spin 0.8s linear infinite" : "none",
                  color: isDone ? "#0a0e1a" : undefined,
                  fontSize: 12,
                }}
                aria-hidden="true"
              >
                {isDone ? "✓" : null}
              </div>
              <span style={{ fontSize: 14, flex: 1 }}>{s.label}</span>
              {isActive && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-faint)",
                    fontFamily: "var(--font-jetbrains), monospace",
                  }}
                >
                  {s.detail}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Animated progress bar */}
      <div
        style={{
          marginTop: 24,
          height: 4,
          background: "var(--surface-2)",
          borderRadius: 2,
          overflow: "hidden",
        }}
        role="progressbar"
        aria-label="Processing progress"
        aria-valuenow={step + 1}
        aria-valuemax={STEPS.length}
      >
        <div
          style={{
            height: "100%",
            background: "linear-gradient(90deg, var(--accent), var(--accent-2))",
            width: `${((step + 1) / STEPS.length) * 100}%`,
            transition: "width 0.6s var(--ease-out-expo)",
          }}
        />
      </div>
      <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-faint)" }}>
        Step {step + 1} of {STEPS.length}
      </p>
    </div>
  );
}
