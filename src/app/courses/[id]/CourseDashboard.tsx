"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProcessingView } from "./ProcessingView";
import { ReadyView } from "./ReadyView";
import type { CourseData } from "./types";

// ── Failed state ──────────────────────────────────────────────────────────────

function FailedView({
  name,
  fileNames,
  onRetry,
  retrying,
}: {
  name?: string;
  fileNames?: string[];
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div
      style={{
        maxWidth: 480,
        margin: "80px auto 0",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 16 }} aria-hidden="true">
        ⚠️
      </div>
      <h1
        style={{
          fontSize: 20,
          fontWeight: 700,
          marginBottom: 10,
          letterSpacing: "-0.02em",
        }}
      >
        Ingestion failed
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 16 }}>
        Something went wrong while building the study plan for{" "}
        <strong>{name}</strong>. You can try again — Cogni will re-run the full analysis.
      </p>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "16px 20px",
          textAlign: "left",
          marginBottom: 20,
          fontSize: 13,
          color: "var(--text-dim)",
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 8, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Common causes
        </div>
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          <li>Files too large or heavily formatted</li>
          <li>Unsupported format or scanned images without OCR</li>
          <li>AI service temporarily unavailable</li>
        </ul>
        <div style={{ marginTop: 12, fontWeight: 600, color: "var(--text)" }}>
          Try uploading fewer files or shorter documents.
        </div>
      </div>

      {fileNames && fileNames.length > 0 && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "12px 16px",
            textAlign: "left",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Uploaded files
          </div>
          {fileNames.map((fn, i) => (
            <div key={i} style={{ fontSize: 13, color: "var(--text-dim)", padding: "3px 0" }}>
              {fn}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onRetry}
        disabled={retrying}
        style={{
          padding: "12px 28px",
          background: retrying
            ? "var(--surface-2)"
            : "linear-gradient(135deg, var(--accent), var(--accent-2))",
          color: retrying ? "var(--text-dim)" : "var(--bg)",
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 14,
          cursor: retrying ? "default" : "pointer",
          transition: "all 0.15s",
          border: "none",
        }}
        aria-busy={retrying}
      >
        {retrying ? "Retrying…" : "Retry analysis"}
      </button>
    </div>
  );
}

// ── Skeleton shown while first fetch resolves ─────────────────────────────────

function InitialSkeleton() {
  return (
    <div style={{ paddingTop: 48 }} aria-busy="true" aria-label="Loading course">
      <div className="skeleton" style={{ height: 28, width: 220, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 14, width: 160, marginBottom: 36 }} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 28,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height: 72, borderRadius: 14, marginBottom: 10 }}
        />
      ))}
    </div>
  );
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export function CourseDashboard({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [course, setCourse] = useState<CourseData | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearPoller() {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  async function fetchCourse() {
    try {
      const res = await fetch(`/api/courses/${courseId}`);
      if (res.status === 404) {
        setFetchError(true);
        clearPoller();
        return;
      }
      if (!res.ok) return; // transient — keep polling
      const data: CourseData = await res.json();
      setCourse(data);
      if (data.status === "READY" || data.status === "FAILED") {
        clearPoller();
      }
    } catch {
      // Network hiccup — keep polling
    }
  }

  useEffect(() => {
    fetchCourse();
    intervalRef.current = setInterval(fetchCourse, 2000);
    return clearPoller;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function handleRetry() {
    setRetrying(true);
    try {
      await fetch(`/api/courses/${courseId}/process`, { method: "POST" });
      // Optimistically show PROCESSING while polling resumes
      setCourse((prev) => (prev ? { ...prev, status: "PROCESSING" } : prev));
      clearPoller();
      intervalRef.current = setInterval(fetchCourse, 2000);
    } catch {
      // Ignore — status stays FAILED, button re-enables
    } finally {
      setRetrying(false);
    }
  }

  if (fetchError) {
    return (
      <div style={{ maxWidth: 400, margin: "80px auto 0", textAlign: "center" }}>
        <p style={{ fontSize: 15, color: "var(--text-dim)", marginBottom: 20 }}>
          Course not found.
        </p>
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            padding: "10px 20px",
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          ← Back to dashboard
        </button>
      </div>
    );
  }

  if (!course) return <InitialSkeleton />;

  if (course.status === "PROCESSING") {
    return <ProcessingView name={course.name} />;
  }

  if (course.status === "FAILED") {
    return (
      <FailedView
        name={course.name}
        fileNames={course.files?.map((f) => f.fileName)}
        onRetry={handleRetry}
        retrying={retrying}
      />
    );
  }

  return <ReadyView course={course} />;
}
