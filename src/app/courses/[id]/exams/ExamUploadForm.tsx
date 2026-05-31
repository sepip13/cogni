"use client";

import { useState } from "react";

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

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-faint)",
  marginBottom: 6,
};

export function ExamUploadForm({
  courseId,
  onCreated,
  onCancel,
}: {
  courseId: string;
  onCreated: (trialId: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = file !== null || pasteText.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const fd = new FormData();
      if (title.trim()) fd.set("title", title.trim());
      if (file) fd.set("file", file);
      if (pasteText.trim()) fd.set("pasteText", pasteText.trim());
      const res = await fetch(`/api/courses/${courseId}/exams/trials`, { method: "POST", body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Upload failed. Please try again.");
        return;
      }
      const data = (await res.json()) as { trialId: string };
      onCreated(data.trialId);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="fade-in"
      style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 14, padding: 20, marginBottom: 16, display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div>
        <label htmlFor="trial-title" style={labelStyle}>Title <span style={{ textTransform: "none", fontWeight: 500, color: "var(--text-faint)" }}>(optional)</span></label>
        <input id="trial-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 2024 midterm paper" maxLength={200} style={inputStyle} />
      </div>
      <div>
        <label htmlFor="trial-file" style={labelStyle}>Exam file <span style={{ textTransform: "none", fontWeight: 500, color: "var(--text-faint)" }}>(PDF, Word, Excel, or text · max 20 MB)</span></label>
        <input id="trial-file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xlsx,.xls,.csv,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ ...inputStyle, padding: "8px 12px", cursor: "pointer" }} />
      </div>
      <div>
        <label htmlFor="trial-paste" style={labelStyle}>Or paste the questions</label>
        <textarea id="trial-paste" value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste the trial exam questions…" rows={4} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      {error && <div role="alert" style={{ fontSize: 13, color: "var(--high)" }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel} disabled={submitting} style={{ padding: "10px 18px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 9, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Cancel</button>
        <button type="submit" disabled={!canSubmit || submitting} style={{ padding: "10px 22px", background: !canSubmit || submitting ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))", color: !canSubmit || submitting ? "var(--text-dim)" : "var(--bg)", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: !canSubmit || submitting ? "default" : "pointer" }} aria-busy={submitting}>
          {submitting ? "Uploading…" : "Upload exam"}
        </button>
      </div>
    </form>
  );
}
