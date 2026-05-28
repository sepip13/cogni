"use client";

import { useState } from "react";

const LANGUAGES = [
  { value: "English",                label: "English" },
  { value: "Persian",                label: "فارسی (Persian)" },
  { value: "Spanish",                label: "Spanish" },
  { value: "French",                 label: "French" },
  { value: "German",                 label: "German" },
  { value: "Italian",                label: "Italian" },
  { value: "Portuguese",             label: "Portuguese" },
  { value: "Dutch",                  label: "Dutch" },
  { value: "Russian",                label: "Russian" },
  { value: "Chinese (Simplified)",   label: "Chinese (Simplified)" },
  { value: "Chinese (Traditional)",  label: "Chinese (Traditional)" },
  { value: "Japanese",               label: "Japanese" },
  { value: "Korean",                 label: "Korean" },
  { value: "Arabic",                 label: "Arabic" },
  { value: "Hindi",                  label: "Hindi" },
  { value: "Turkish",                label: "Turkish" },
  { value: "Polish",                 label: "Polish" },
  { value: "Swedish",                label: "Swedish" },
  { value: "Norwegian",              label: "Norwegian" },
  { value: "Danish",                 label: "Danish" },
  { value: "Finnish",                label: "Finnish" },
] as const;

interface LanguageSettingsFormProps {
  currentLanguage: string;
}

export function LanguageSettingsForm({ currentLanguage }: LanguageSettingsFormProps) {
  const [language, setLanguage] = useState(currentLanguage);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredLanguage: language }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage({ type: "err", text: body.error ?? "Save failed" });
        return;
      }

      setMessage({ type: "ok", text: "Saved" });
    } catch {
      setMessage({ type: "err", text: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: 12,
        padding: 24,
        maxWidth: 480,
      }}
    >
      <label
        htmlFor="language"
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-dim)",
          marginBottom: 8,
        }}
      >
        Study plan language
      </label>
      <p
        style={{
          fontSize: 13,
          color: "var(--text-faint)",
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        AI-generated topics, explanations, and practice questions will be in this language.
      </p>
      <select
        id="language"
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        disabled={saving}
        style={{
          width: "100%",
          padding: "11px 14px",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          fontSize: 15,
          color: "var(--text)",
          fontFamily: "inherit",
          outline: "none",
          marginBottom: 16,
        }}
      >
        {LANGUAGES.map((l) => (
          <option key={l.value} value={l.value}>{l.label}</option>
        ))}
      </select>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || language === currentLanguage}
          style={{
            padding: "10px 24px",
            background:
              saving || language === currentLanguage
                ? "var(--surface-2)"
                : "linear-gradient(135deg, var(--accent), var(--accent-2))",
            color:
              saving || language === currentLanguage
                ? "var(--text-dim)"
                : "var(--bg)",
            border: "none",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor:
              saving || language === currentLanguage ? "default" : "pointer",
            transition: "all 0.15s",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>

        {message && (
          <span
            style={{
              fontSize: 13,
              color: message.type === "ok" ? "var(--accent)" : "var(--high)",
            }}
          >
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
