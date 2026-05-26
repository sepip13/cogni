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
  const [isPendingEmail, startEmailTransition] = useTransition();
  const [isPendingGoogle, startGoogleTransition] = useTransition();
  const [emailError, setEmailError] = useState("");

  function handleGoogleSignIn() {
    startGoogleTransition(() => {
      signIn("google", { callbackUrl });
    });
  }

  function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError("");

    startEmailTransition(async () => {
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
          {error === "OAuthAccountNotLinked"
            ? "This email is already linked to another provider. Sign in with Google."
            : "Something went wrong. Please try again."}
        </div>
      )}

      {/* Google */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isPendingGoogle || isPendingEmail}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: "12px 20px",
          background: "var(--surface-2)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text)",
          cursor: "pointer",
          transition: "border-color var(--duration-fast), opacity var(--duration-fast)",
          opacity: isPendingGoogle ? 0.7 : 1,
          width: "100%",
        }}
        aria-busy={isPendingGoogle}
      >
        <GoogleIcon />
        {isPendingGoogle ? "Redirecting…" : "Continue with Google"}
      </button>

      {/* Divider */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          margin: "4px 0",
        }}
        aria-hidden="true"
      >
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>or</span>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>

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
            disabled={isPendingEmail}
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
          disabled={isPendingEmail || isPendingGoogle}
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
            opacity: isPendingEmail ? 0.7 : 1,
          }}
          aria-busy={isPendingEmail}
        >
          {isPendingEmail ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
