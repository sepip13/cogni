"use client";

import { signIn } from "next-auth/react";
import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";

export function SignInForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const error = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [emailError, setEmailError] = useState("");

  function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError("");

    startTransition(async () => {
      const res = await signIn("resend", {
        email: trimmed,
        callbackUrl,
        redirect: false,
      });

      if (res?.error) {
        setEmailError("Could not send the link. Please try again.");
      } else {
        setEmailSent(true);
      }
    });
  }

  if (emailSent) {
    return (
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <div
          style={{
            width: 48,
            height: 48,
            background: "rgba(52, 211, 153, 0.12)",
            border: "1px solid rgba(52, 211, 153, 0.3)",
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
            fontSize: 22,
          }}
          aria-hidden="true"
        >
          ✉️
        </div>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          Check your inbox
        </h2>
        <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.5 }}>
          We sent a sign-in link to <strong>{email}</strong>. Click it to
          continue.
        </p>
        <button
          type="button"
          onClick={() => setEmailSent(false)}
          style={{
            marginTop: 20,
            fontSize: 13,
            color: "var(--text-dim)",
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Auth error banner */}
      {error && (
        <div
          role="alert"
          style={{
            background: "rgba(255, 107, 107, 0.1)",
            border: "1px solid rgba(255, 107, 107, 0.3)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            color: "var(--high)",
          }}
        >
          Something went wrong. Please try again.
        </div>
      )}

      {/* Email magic link */}
      <form onSubmit={handleEmailSignIn} noValidate>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label
            htmlFor="email"
            style={{ fontSize: 13, fontWeight: 500, color: "var(--text-dim)" }}
          >
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@university.edu"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
            required
            disabled={isPending}
            style={{
              padding: "10px 14px",
              background: "var(--surface-2)",
              border: `1px solid ${emailError ? "var(--high)" : "var(--border-strong)"}`,
              borderRadius: 8,
              fontSize: 14,
              color: "var(--text)",
              outline: "none",
              width: "100%",
              fontFamily: "inherit",
              transition: "border-color var(--duration-fast)",
            }}
            aria-invalid={!!emailError}
            aria-describedby={emailError ? "email-error" : undefined}
          />
          {emailError && (
            <span
              id="email-error"
              role="alert"
              style={{ fontSize: 12, color: "var(--high)" }}
            >
              {emailError}
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "12px 20px",
            background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
            color: "var(--bg)",
            border: "none",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            transition: "opacity var(--duration-fast)",
            opacity: isPending ? 0.7 : 1,
          }}
          aria-busy={isPending}
        >
          {isPending ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
    </div>
  );
}
