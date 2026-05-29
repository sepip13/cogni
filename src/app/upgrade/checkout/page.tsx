"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Stage = "connecting" | "error" | "redirecting";

export default function CheckoutPage() {
  const [stage, setStage] = useState<Stage>("connecting");
  const [countdown, setCountdown] = useState(4);
  const router = useRouter();

  useEffect(() => {
    // After 2.4s — show error
    const errorTimer = setTimeout(() => setStage("error"), 2400);
    return () => clearTimeout(errorTimer);
  }, []);

  useEffect(() => {
    if (stage !== "error") return;

    // Countdown then redirect
    const interval = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(interval);
          setStage("redirecting");
          router.replace("/dashboard");
        }
        return n - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [stage, router]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg, #0a0a0f)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: "24px",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 440,
        background: "var(--surface, #131318)",
        border: "1px solid var(--border-strong, rgba(255,255,255,0.08))",
        borderRadius: 20,
        padding: "40px 36px",
        textAlign: "center",
      }}>

        {/* Stripe-style lock + logo row */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          marginBottom: 32,
          opacity: 0.5,
          fontSize: 13,
          color: "var(--text-dim, #888)",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span>Secure checkout</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>Powered by Stripe</span>
        </div>

        {stage === "connecting" && (
          <>
            {/* Animated spinner */}
            <div style={{ marginBottom: 28, position: "relative", display: "inline-flex" }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                border: "3px solid rgba(255,255,255,0.06)",
                borderTopColor: "var(--accent, #7c6aff)",
                animation: "spin 0.9s linear infinite",
              }} />
              <div style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
              }}>
                💳
              </div>
            </div>

            <h2 style={{
              fontSize: 20,
              fontWeight: 700,
              color: "var(--text, #f0f0f5)",
              marginBottom: 10,
              letterSpacing: "-0.02em",
            }}>
              Connecting to payment gateway
            </h2>
            <p style={{
              fontSize: 14,
              color: "var(--text-dim, #888)",
              lineHeight: 1.6,
              marginBottom: 32,
            }}>
              Please wait while we prepare your secure checkout session…
            </p>

            {/* Fake progress bar */}
            <div style={{
              height: 3,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 99,
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                background: "linear-gradient(90deg, var(--accent, #7c6aff), var(--accent-2, #a78bfa))",
                borderRadius: 99,
                animation: "progress 2.4s ease-out forwards",
              }} />
            </div>
          </>
        )}

        {(stage === "error" || stage === "redirecting") && (
          <>
            {/* Error icon */}
            <div style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
              fontSize: 26,
            }}>
              ⚠️
            </div>

            <h2 style={{
              fontSize: 20,
              fontWeight: 700,
              color: "var(--text, #f0f0f5)",
              marginBottom: 10,
              letterSpacing: "-0.02em",
            }}>
              Payment gateway unavailable
            </h2>
            <p style={{
              fontSize: 14,
              color: "var(--text-dim, #888)",
              lineHeight: 1.6,
              marginBottom: 28,
            }}>
              Our payment provider is temporarily unavailable. No charges have been made.
              Please try again later.
            </p>

            {/* Countdown badge */}
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "var(--surface-2, rgba(255,255,255,0.04))",
              border: "1px solid var(--border-strong, rgba(255,255,255,0.08))",
              borderRadius: 99,
              padding: "8px 18px",
              fontSize: 13,
              color: "var(--text-dim, #888)",
            }}>
              <span style={{
                width: 20,
                height: 20,
                background: "var(--accent, #7c6aff)",
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                color: "#fff",
              }}>
                {countdown}
              </span>
              Returning to dashboard…
            </div>
          </>
        )}

      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes progress {
          0%   { width: 0%; }
          60%  { width: 72%; }
          90%  { width: 88%; }
          100% { width: 92%; }
        }
      `}</style>
    </div>
  );
}
