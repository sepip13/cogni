import { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { AdminLoginForm } from "./AdminLoginForm";

export const metadata: Metadata = { title: "Admin Login — Cogni" };

export default async function AdminLoginPage() {
  const session = await auth();
  if (session?.user?.email && isAdmin(session.user.email)) {
    redirect("/admin");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
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
          >
            C
          </span>
          <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em" }}>
            Cogni
          </span>
        </div>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: "32px 28px",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "var(--accent-soft)",
              color: "var(--accent)",
              borderRadius: 20,
              padding: "3px 12px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            Admin Access
          </div>

          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              marginBottom: 8,
            }}
          >
            Admin Login
          </h1>
          <p
            style={{
              color: "var(--text-dim)",
              fontSize: 14,
              marginBottom: 28,
            }}
          >
            Sign in with your admin credentials. If this is your first time, an admin account will be created automatically.
          </p>

          <AdminLoginForm />
        </div>
      </div>
    </div>
  );
}
