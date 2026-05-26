import { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign in — Cogni",
};

export default function SignInPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            marginBottom: 36,
          }}
        >
          <span
            style={{
              width: 36,
              height: 36,
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
              borderRadius: 10,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              color: "var(--bg)",
              fontSize: 18,
            }}
            aria-hidden="true"
          >
            C
          </span>
          <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em" }}>
            Cogni
          </span>
        </div>

        {/* Card */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: "32px 28px",
          }}
        >
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              marginBottom: 8,
              textAlign: "center",
            }}
          >
            Sign in to Cogni
          </h1>
          <p
            style={{
              color: "var(--text-dim)",
              fontSize: 14,
              textAlign: "center",
              marginBottom: 28,
            }}
          >
            Upload your course materials and get a study plan in 90 seconds.
          </p>

          <Suspense fallback={<div style={{ height: 200 }} />}>
            <SignInForm />
          </Suspense>
        </div>

        <p
          style={{
            marginTop: 20,
            textAlign: "center",
            fontSize: 12,
            color: "var(--text-faint)",
          }}
        >
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
