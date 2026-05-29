"use client";

import { useRouter } from "next/navigation";

export function UpgradeButton() {
  const router = useRouter();

  return (
    <div>
      <button
        onClick={() => router.push("/upgrade/checkout")}
        style={{
          display: "inline-block",
          padding: "14px 40px",
          background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
          color: "var(--bg)",
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 700,
          textDecoration: "none",
          border: "none",
          cursor: "pointer",
          marginBottom: 16,
          transition: "opacity 0.15s",
        }}
      >
        Upgrade to Pro — $9.99 / month →
      </button>
    </div>
  );
}
