"use client";

import { useState } from "react";
import type { SubmissionKind } from "./types";

const KIND_OPTIONS: { value: SubmissionKind; label: string }[] = [
  { value: "ASSIGNMENT", label: "Assignment" },
  { value: "PROJECT", label: "Project" },
  { value: "PORTFOLIO", label: "Portfolio" },
  { value: "ESSAY", label: "Essay" },
  { value: "REPORT", label: "Report" },
  { value: "CASE_STUDY", label: "Case study" },
  { value: "PRESENTATION", label: "Presentation" },
  { value: "REFLECTION", label: "Reflection" },
  { value: "OTHER", label: "Other" },
];

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-faint)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--surface-2)",
  border: "1px solid var(--border-strong)",
  borderRadius: 9,
  fontSize: 14,
  color: "var(--text)",
  fontFamily: "inherit",
  outline: "none",
};

export function AddWorkForm({
  courseId,
  onCancel,
  onCreated,
  deliverableId,
  initialKind = "ASSIGNMENT",
  initialTitle = "",
}: {
  courseId: string;
  onCancel: () => void;
  onCreated: (submissionId: string) => void;
  /** When set, the created submission is linked to this deliverable (rubric-graded). */
  deliverableId?: string;
  initialKind?: SubmissionKind;
  initialTitle?: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [kind, setKind] = useState<SubmissionKind>(initialKind);
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = title.trim().length > 0 && (file !== null || pasteText.trim().length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const fd = new FormData();
      fd.set("title", title.trim());
      fd.set("kind", kind);
      if (deliverableId) fd.set("deliverableId", deliverableId);
      if (file) fd.set("file", file);
      if (pasteText.trim()) fd.set("pasteText", pasteText.trim());

      const res = await fetch(`/api/courses/${courseId}/submissions`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Upload failed. Please try again.");
        return;
      }
      const data = (await res.json()) as { submissionId: string };
      onCreated(data.submissionId);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="fade-in"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: 14,
        padding: 20,
        marginBottom: 14,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12 }}>
        <div>
          <label htmlFor="work-title" style={fieldLabel}>
            Title
          </label>
          <input
            id="work-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Final research report — draft 2"
            maxLength={200}
            style={inputStyle}
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="work-kind" style={fieldLabel}>
            Type
          </label>
          <select
            id="work-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as SubmissionKind)}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="work-file" style={fieldLabel}>
          File <span style={{ textTransform: "none", fontWeight: 500, color: "var(--text-faint)" }}>(PDF, Word, PowerPoint, Excel, or text · max 20 MB)</span>
        </label>
        <input
          id="work-file"
          type="file"
          accept=".pdf,.doc,.docx,.ppt,.pptx,.xlsx,.xls,.csv,.txt"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ ...inputStyle, padding: "8px 12px", cursor: "pointer" }}
        />
      </div>

      <div>
        <label htmlFor="work-paste" style={fieldLabel}>
          Or paste your work{" "}
          <span style={{ textTransform: "none", fontWeight: 500, color: "var(--text-faint)" }}>
            (instead of, or in addition to, a file)
          </span>
        </label>
        <textarea
          id="work-paste"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste the text of your assignment, essay, or report…"
          rows={4}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: "rgba(255,107,107,0.1)",
            border: "1px solid rgba(255,107,107,0.3)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            color: "var(--high)",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          style={{
            padding: "10px 18px",
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: 9,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text)",
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit || submitting}
          style={{
            padding: "10px 22px",
            background:
              !canSubmit || submitting
                ? "var(--surface-2)"
                : "linear-gradient(135deg, var(--accent), var(--accent-2))",
            color: !canSubmit || submitting ? "var(--text-dim)" : "var(--bg)",
            border: "none",
            borderRadius: 9,
            fontSize: 13,
            fontWeight: 700,
            cursor: !canSubmit || submitting ? "default" : "pointer",
          }}
          aria-busy={submitting}
        >
          {submitting ? "Uploading…" : "Add work"}
        </button>
      </div>
    </form>
  );
}
