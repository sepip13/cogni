"use client";

import { signIn } from "next-auth/react";
import { useState, useTransition } from "react";

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

export function AdminLoginForm() {
  const [email, setEmail] = useState("admin@cogni.app");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Email is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    startTransition(async () => {
      const setupRes = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      const setupData = await setupRes.json().catch(() => ({}));

      if (!setupRes.ok) {
        setError(setupData.error ?? "Authentication failed.");
        return;
      }

      if (setupData.mode === "created") {
        setInfo("Admin account created. Signing in...");
      }

      const result = await signIn("credentials", {
        email: trimmedEmail,
        password,
        callbackUrl: "/admin",
        redirect: false,
      });

      if (result?.error) {
        setError("Sign-in failed. Check your credentials.");
      } else {
        window.location.href = "/admin";
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
            {error}
          </div>
        )}

        {info && (
          <div
            style={{
              background: "rgba(52, 211, 153, 0.1)",
              border: "1px solid rgba(52, 211, 153, 0.3)",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "var(--success)",
            }}
          >
            {info}
          </div>
        )}

        <div>
          <label htmlFor="admin-email" style={labelStyle}>
            Admin Email
          </label>
          <input
            id="admin-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            disabled={isPending}
            style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor="admin-password" style={labelStyle}>
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            disabled={isPending}
            style={inputStyle}
          />
        </div>

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
        >
          {isPending ? "Signing in..." : "Sign in to Admin"}
        </button>

        <p style={{ fontSize: 12, color: "var(--text-faint)", textAlign: "center", marginTop: 4 }}>
          First time? Enter your desired password to create the admin account.
        </p>
      </div>
    </form>
  );
}
