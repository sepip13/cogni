"use client";

import { signIn } from "next-auth/react";
import { useState, useTransition, useRef } from "react";
import { useSearchParams } from "next/navigation";

type Mode = "signin" | "signup" | "verify";

const inputStyle: React.CSSProperties = {
  padding: "10px 14px",
  background: "var(--surface-2)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  fontSize: 14,
  color: "var(--text)",
  outline: "none",
  width: "100%",
  fontFamily: "inherit",
  transition: "border-color var(--duration-fast)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--text-dim)",
  display: "block",
  marginBottom: 6,
};

export function SignInForm() {
  const searchParams = useSearchParams();
  const callbackUrl  = searchParams.get("callbackUrl") ?? "/dashboard";
  const urlError     = searchParams.get("error");

  const [mode, setMode]           = useState<Mode>("signin");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [name, setName]           = useState("");
  const [code, setCode]           = useState(["", "", "", "", "", ""]);
  const [error, setError]         = useState("");
  const [info, setInfo]           = useState("");
  const [isPending, startTransition] = useTransition();
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setInfo("");
  }

  function handleCodeChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...code];
    next[index] = value.slice(-1);
    setCode(next);
    setError("");
    if (value && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }
  }

  function handleCodeKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  }

  function handleCodePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(""));
      codeRefs.current[5]?.focus();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    startTransition(async () => {
      if (mode === "signup") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmedEmail, password, name: name.trim() || undefined }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 409) {
          setError("Email already registered. Sign in instead.");
          return;
        }
        if (!res.ok) {
          setError(data.error ?? "Sign up failed. Please try again.");
          return;
        }

        if (data.needsVerification) {
          setMode("verify");
          setInfo("We sent a 6-digit code to " + trimmedEmail);
          return;
        }
      }

      const result = await signIn("credentials", {
        email: trimmedEmail,
        password,
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        setError(mode === "signup" ? "Account created but sign-in failed. Try signing in." : "Wrong email or password.");
      } else {
        window.location.href = callbackUrl;
      }
    });
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: fullCode }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Verification failed.");
        return;
      }

      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        setError("Verified! But sign-in failed. Try signing in manually.");
        setMode("signin");
      } else {
        window.location.href = callbackUrl;
      }
    });
  }

  async function handleResendCode() {
    setError("");
    setInfo("");
    startTransition(async () => {
      await fetch("/api/auth/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setInfo("New code sent!");
      setCode(["", "", "", "", "", ""]);
      codeRefs.current[0]?.focus();
    });
  }

  // ── Verification screen ──────────────────────────────────────────────────
  if (mode === "verify") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>&#9993;</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Check your email</h2>
          <p style={{ fontSize: 13, color: "var(--text-dim)" }}>{info}</p>
        </div>

        {error && (
          <div role="alert" style={{ background: "rgba(255, 107, 107, 0.1)", border: "1px solid rgba(255, 107, 107, 0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "var(--high)" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleVerify} noValidate>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 20 }}>
            {code.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { codeRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleCodeChange(i, e.target.value)}
                onKeyDown={(e) => handleCodeKeyDown(i, e)}
                onPaste={i === 0 ? handleCodePaste : undefined}
                disabled={isPending}
                style={{
                  width: 44,
                  height: 52,
                  textAlign: "center",
                  fontSize: 22,
                  fontWeight: 700,
                  background: "var(--surface-2)",
                  border: digit ? "2px solid var(--accent)" : "1px solid var(--border-strong)",
                  borderRadius: 10,
                  color: "var(--text)",
                  outline: "none",
                  fontFamily: "inherit",
                  transition: "border-color var(--duration-fast)",
                }}
                autoFocus={i === 0}
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={isPending || code.join("").length !== 6}
            style={{
              width: "100%",
              padding: "12px 20px",
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: "var(--bg)",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              cursor: isPending ? "default" : "pointer",
              opacity: isPending || code.join("").length !== 6 ? 0.5 : 1,
              transition: "opacity var(--duration-fast)",
            }}
          >
            {isPending ? "Verifying..." : "Verify & Sign in"}
          </button>
        </form>

        <div style={{ textAlign: "center" }}>
          <button
            type="button"
            onClick={handleResendCode}
            disabled={isPending}
            style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}
          >
            Resend code
          </button>
          <span style={{ color: "var(--text-faint)", margin: "0 8px" }}>|</span>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 13, cursor: "pointer", padding: 0 }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // ── Sign in / Sign up screen ─────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Google sign-in */}
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl })}
        disabled={isPending}
        style={{
          width: "100%",
          padding: "10px 16px",
          borderRadius: 10,
          border: "1px solid var(--border-strong)",
          background: "var(--surface)",
          cursor: isPending ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text)",
          transition: "background var(--duration-fast)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: "var(--border-strong)" }} />
        <span style={{ fontSize: 12, color: "var(--text-faint)", fontWeight: 500 }}>or</span>
        <div style={{ flex: 1, height: 1, background: "var(--border-strong)" }} />
      </div>

      {/* Mode toggle */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          background: "var(--surface-2)",
          borderRadius: 10,
          padding: 4,
          gap: 4,
        }}
      >
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            style={{
              padding: "8px 0",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all var(--duration-fast)",
              background: mode === m ? "var(--surface)" : "transparent",
              color: mode === m ? "var(--text)" : "var(--text-dim)",
              border: mode === m ? "1px solid var(--border-strong)" : "1px solid transparent",
            }}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {(error || urlError) && (
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
          {error || "Something went wrong. Please try again."}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Name — signup only */}
          {mode === "signup" && (
            <div>
              <label htmlFor="name" style={labelStyle}>Name <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>(optional)</span></label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isPending}
                style={inputStyle}
              />
            </div>
          )}

          {/* Email */}
          <div>
            <label htmlFor="email" style={labelStyle}>Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              required
              disabled={isPending}
              style={inputStyle}
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" style={labelStyle}>Password</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? "Min. 8 characters" : "Your password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              required
              disabled={isPending}
              style={inputStyle}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending}
            style={{
              marginTop: 4,
              width: "100%",
              padding: "12px 20px",
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: "var(--bg)",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              cursor: isPending ? "default" : "pointer",
              opacity: isPending ? 0.7 : 1,
              transition: "opacity var(--duration-fast)",
            }}
            aria-busy={isPending}
          >
            {isPending
              ? (mode === "signup" ? "Creating account..." : "Signing in...")
              : (mode === "signup" ? "Create account" : "Sign in")}
          </button>
        </div>
      </form>
    </div>
  );
}
