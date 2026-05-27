"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".txt"];
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
]);
const MAX_FILES = 10;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB — must match server

interface SelectedFile {
  file: File;
  id: string;
}

type SubmitState = "idle" | "uploading" | "error";

const MODELS = [
  { id: "free",   label: "Free AI",  desc: "Gemini / Groq",  pro: false },
  { id: "haiku",  label: "Haiku",    desc: "Fast (~10s)",    pro: true  },
  { id: "sonnet", label: "Sonnet",   desc: "Balanced (~30s)", pro: true  },
  { id: "opus",   label: "Opus",     desc: "Best (~2min)",   pro: true  },
] as const;

type ModelChoice = (typeof MODELS)[number]["id"];

interface NewCourseFormProps {
  userPlan: "FREE" | "PRO";
}

export function NewCourseForm({ userPlan }: NewCourseFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [model, setModel] = useState<ModelChoice>(userPlan === "PRO" ? "haiku" : "free");
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const rejected: string[] = [];

    const valid = arr.filter((f) => {
      const ext = "." + (f.name.split(".").pop()?.toLowerCase() ?? "");
      const extOk = ALLOWED_EXTENSIONS.includes(ext);
      const mimeOk = ALLOWED_MIMES.has(f.type);
      if (!extOk && !mimeOk) {
        rejected.push(`${f.name} (unsupported type)`);
        return false;
      }
      if (f.size > MAX_FILE_BYTES) {
        rejected.push(`${f.name} (exceeds 20 MB)`);
        return false;
      }
      return true;
    });

    if (rejected.length > 0) {
      setErrorMsg(`Skipped: ${rejected.join(", ")}`);
    }

    setFiles((prev) => {
      const combined = [
        ...prev,
        ...valid.map((f) => ({ file: f, id: crypto.randomUUID() })),
      ].slice(0, MAX_FILES);
      return combined;
    });
  }, []);

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const name = courseName.trim() || "Untitled Course";
    if (files.length === 0 && !pasteText.trim()) {
      setErrorMsg("Add at least one file or paste your course material.");
      return;
    }

    setSubmitState("uploading");
    setErrorMsg("");

    const formData = new FormData();
    formData.append("name", name);
    formData.append("model", model);
    if (examDate) formData.append("examDate", examDate);
    if (pasteText.trim()) formData.append("pasteText", pasteText.trim());
    for (const { file } of files) formData.append("files", file);

    try {
      const res = await fetch("/api/courses", { method: "POST", body: formData });

      if (res.status === 429) {
        const body = await res.json();
        setErrorMsg(body.error ?? "Daily limit reached. Try again tomorrow.");
        setSubmitState("error");
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error ?? "Upload failed. Please try again.");
        setSubmitState("error");
        return;
      }

      const { courseId } = await res.json();
      router.push(`/courses/${courseId}`);
    } catch {
      setErrorMsg("Network error — please check your connection and try again.");
      setSubmitState("error");
    }
  }

  const uploading = submitState === "uploading";

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Course name */}
      <div style={{ marginBottom: 20 }}>
        <label
          htmlFor="courseName"
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-dim)",
            marginBottom: 8,
          }}
        >
          Course name{" "}
            <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>
              (optional — auto-detected from material)
            </span>
        </label>
        <input
          id="courseName"
          type="text"
          placeholder="e.g. Marketing Research Methods"
          value={courseName}
          onChange={(e) => setCourseName(e.target.value)}
          disabled={uploading}
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
          }}
        />
      </div>

      {/* Exam date */}
      <div style={{ marginBottom: 24 }}>
        <label
          htmlFor="examDate"
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-dim)",
            marginBottom: 8,
          }}
        >
          Exam date{" "}
          <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>
            (optional — enables calendar view)
          </span>
        </label>
        <input
          id="examDate"
          type="date"
          value={examDate}
          onChange={(e) => setExamDate(e.target.value)}
          disabled={uploading}
          style={{
            padding: "11px 14px",
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            fontSize: 14,
            color: "var(--text)",
            fontFamily: "inherit",
            outline: "none",
            colorScheme: "dark",
          }}
        />
      </div>

      {/* Model selector */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <label
            style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)" }}
          >
            AI Model
          </label>
          {userPlan === "FREE" && (
            <a
              href="/upgrade"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--accent)",
                background: "var(--accent-soft)",
                padding: "2px 8px",
                borderRadius: 20,
                textDecoration: "none",
                letterSpacing: "0.02em",
              }}
            >
              ✦ Upgrade to Pro
            </a>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          {MODELS.map((m) => {
            const locked = m.pro && userPlan === "FREE";
            const selected = model === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  if (locked) { router.push("/upgrade"); return; }
                  setModel(m.id);
                }}
                disabled={uploading}
                title={locked ? "Pro plan required — click to upgrade" : undefined}
                style={{
                  padding: "10px 6px",
                  borderRadius: 10,
                  border: selected
                    ? "2px solid var(--accent)"
                    : "1px solid var(--border-strong)",
                  background: locked
                    ? "var(--surface)"
                    : selected
                    ? "var(--surface-2)"
                    : "var(--surface)",
                  cursor: uploading ? "default" : "pointer",
                  transition: "all 0.15s",
                  textAlign: "center",
                  opacity: locked ? 0.55 : 1,
                  position: "relative",
                }}
              >
                {locked && (
                  <span
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      fontSize: 10,
                      lineHeight: 1,
                    }}
                    aria-hidden="true"
                  >
                    🔒
                  </span>
                )}
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: selected ? "var(--accent)" : "var(--text)",
                  }}
                >
                  {m.label}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
                  {m.desc}
                </div>
              </button>
            );
          })}
        </div>
        {userPlan === "FREE" && (
          <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
            Free plan uses Gemini 2.5 Flash · Groq · OpenRouter
          </p>
        )}
      </div>

      {/* Dropzone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop files here or click to select"
        onClick={() => !uploading && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            !uploading && fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragOver ? "var(--accent)" : "var(--border-strong)"}`,
          borderRadius: 16,
          padding: "40px 32px",
          background: isDragOver ? "var(--surface-2)" : "var(--surface)",
          transition: "all 0.2s",
          cursor: uploading ? "default" : "pointer",
          textAlign: "center",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            background: "var(--accent-soft)",
            borderRadius: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent)",
            marginBottom: 14,
            fontSize: 22,
          }}
          aria-hidden="true"
        >
          ↑
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
          Drop files here or <span style={{ color: "var(--accent)" }}>browse</span>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 10 }}>
          Syllabus, slides, rubric, past exams — up to {MAX_FILES} files
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          PDF · DOC · DOCX · PPT · PPTX · TXT
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
          onClick={(e) => e.stopPropagation()}
          style={{ display: "none" }}
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          {files.map(({ file, id }) => (
            <div
              key={id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-jetbrains), monospace",
                  fontSize: 10,
                  background: "var(--surface-2)",
                  padding: "2px 6px",
                  borderRadius: 4,
                  color: "var(--accent-2)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  flexShrink: 0,
                }}
              >
                {file.name.split(".").pop()?.toUpperCase()}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {file.name}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-faint)", flexShrink: 0 }}>
                {(file.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={() => removeFile(id)}
                disabled={uploading}
                style={{
                  color: "var(--text-faint)",
                  fontSize: 16,
                  lineHeight: 1,
                  padding: "2px 4px",
                  borderRadius: 4,
                  flexShrink: 0,
                }}
                aria-label={`Remove ${file.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Paste text toggle */}
      <button
        type="button"
        onClick={() => setShowPaste((v) => !v)}
        style={{
          fontSize: 13,
          color: "var(--text-dim)",
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 16 }}>{showPaste ? "▾" : "▸"}</span>
        Or paste course material as text
      </button>

      {showPaste && (
        <textarea
          placeholder="Paste your syllabus, notes, or any course text here…"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={6}
          disabled={uploading}
          style={{
            width: "100%",
            padding: "12px 14px",
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            fontSize: 13,
            color: "var(--text)",
            fontFamily: "inherit",
            resize: "vertical",
            outline: "none",
            marginBottom: 16,
          }}
        />
      )}

      {/* Error */}
      {errorMsg && (
        <div
          role="alert"
          style={{
            background: "rgba(255,107,107,0.1)",
            border: "1px solid rgba(255,107,107,0.3)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            color: "var(--high)",
            marginBottom: 16,
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={uploading}
        style={{
          width: "100%",
          padding: "14px 24px",
          background: uploading
            ? "var(--surface-2)"
            : "linear-gradient(135deg, var(--accent), var(--accent-2))",
          color: uploading ? "var(--text-dim)" : "var(--bg)",
          border: "none",
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 700,
          cursor: uploading ? "default" : "pointer",
          transition: "all 0.15s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
        aria-busy={uploading}
      >
        {uploading ? (
          <>
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: "2px solid var(--border-strong)",
                borderTopColor: "var(--accent)",
                animation: "spin 0.7s linear infinite",
                display: "inline-block",
              }}
              aria-hidden="true"
            />
            Uploading…
          </>
        ) : (
          "Build my study plan →"
        )}
      </button>
    </form>
  );
}
