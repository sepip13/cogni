"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ReviewPanel } from "./ReviewPanel";
import { CoachPanel } from "./CoachPanel";
import { VivaPrep } from "./VivaPrep";
import type { SubmissionDetail, SubmissionKind, SubmissionReview } from "../../types";

interface DetailResponse {
  submission: SubmissionDetail;
  reviews: SubmissionReview[];
  courseName: string;
}

const KIND_LABELS: Record<SubmissionKind, string> = {
  ASSIGNMENT: "Assignment",
  PROJECT: "Project",
  PORTFOLIO: "Portfolio",
  ESSAY: "Essay",
  REPORT: "Report",
  OTHER: "Other",
};

const PARSE_POLL_MS = 3000;
const MAX_PARSE_POLLS = 30;

export function WorkDetail({ courseId, submissionId }: { courseId: string; submissionId: string }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const pollCount = useRef(0);

  const fetchDetail = useCallback(() => {
    return fetch(`/api/courses/${courseId}/submissions/${submissionId}`)
      .then((r) => (r.ok ? (r.json() as Promise<DetailResponse>) : Promise.reject(new Error("load failed"))))
      .then((json) => setData(json))
      .catch(() => setLoadError(true));
  }, [courseId, submissionId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // A file uploaded moments ago may still be parsing in the background — poll
  // until readable text appears (bounded), so the review button can light up.
  const stillParsing = !!data && !!data.submission.fileName && !data.submission.hasText;
  useEffect(() => {
    if (!stillParsing) return;
    if (pollCount.current >= MAX_PARSE_POLLS) return;
    const t = setInterval(() => {
      pollCount.current += 1;
      if (pollCount.current >= MAX_PARSE_POLLS) clearInterval(t);
      fetchDetail();
    }, PARSE_POLL_MS);
    return () => clearInterval(t);
  }, [stillParsing, fetchDetail]);

  async function runReview() {
    setReviewing(true);
    setReviewError("");
    try {
      const res = await fetch(`/api/courses/${courseId}/submissions/${submissionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setReviewError(body.error ?? "Review failed. Please try again.");
        return;
      }
      const { review } = (await res.json()) as { review: SubmissionReview };
      setData((prev) =>
        prev
          ? { ...prev, reviews: [review, ...prev.reviews], submission: { ...prev.submission, status: "REVIEWED" } }
          : prev
      );
    } catch {
      setReviewError("Network error — please try again.");
    } finally {
      setReviewing(false);
    }
  }

  if (loadError) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-dim)" }}>
        Could not load this work.{" "}
        <Link href={`/courses/${courseId}`} style={{ color: "var(--accent)" }}>
          Back to course
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ paddingTop: 40 }} aria-busy="true">
        <div className="skeleton" style={{ height: 32, width: 240, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />
      </div>
    );
  }

  const { submission, reviews, courseName } = data;
  const latest = reviews[0] ?? null;

  return (
    <div className="fade-in">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-dim)", marginBottom: 22, flexWrap: "wrap" }}
      >
        <Link href="/dashboard" style={{ color: "var(--text-dim)" }}>My courses</Link>
        <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
        <Link href={`/courses/${courseId}`} style={{ color: "var(--text-dim)" }}>{courseName}</Link>
        <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
        <span style={{ color: "var(--text)" }} aria-current="page">{submission.title}</span>
      </nav>

      {/* Header */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", marginBottom: 26 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.2 }}>
              {submission.title}
            </h1>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--accent)",
                background: "var(--accent-soft)",
                border: "1px solid var(--border)",
                padding: "3px 9px",
                borderRadius: 6,
              }}
            >
              {KIND_LABELS[submission.kind]}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
            {submission.fileName ? submission.fileName : "Pasted text"}
            {submission.pageCount ? ` · ${submission.pageCount} pages` : ""}
            {submission.blobUrl && (
              <>
                {" · "}
                <a href={submission.blobUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontWeight: 600 }}>
                  Open file
                </a>
              </>
            )}
          </p>
        </div>

        <button
          onClick={runReview}
          disabled={reviewing || !submission.hasText}
          style={{
            padding: "11px 22px",
            background: reviewing || !submission.hasText ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
            color: reviewing || !submission.hasText ? "var(--text-dim)" : "var(--bg)",
            border: "none",
            borderRadius: 9,
            fontSize: 14,
            fontWeight: 700,
            cursor: reviewing || !submission.hasText ? "default" : "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
          aria-busy={reviewing}
        >
          {reviewing ? "Reviewing…" : latest ? "Re-review against rubric" : "Review against rubric"}
        </button>
      </div>

      {stillParsing && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 20,
            fontSize: 13,
            color: "var(--text-dim)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              border: "2px solid var(--border-strong)",
              borderTopColor: "var(--accent)",
              animation: "spin 0.7s linear infinite",
              display: "inline-block",
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
          Reading your file… this updates automatically when it&apos;s ready.
        </div>
      )}

      {reviewError && (
        <div
          role="alert"
          style={{
            background: "rgba(255,107,107,0.1)",
            border: "1px solid rgba(255,107,107,0.3)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            color: "var(--high)",
            marginBottom: 20,
          }}
        >
          {reviewError}
        </div>
      )}

      {/* Latest review (or an invitation to run the first one) */}
      {latest ? (
        <div style={{ marginBottom: 22 }}>
          <ReviewPanel review={latest} />
          {reviews.length > 1 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                History
              </span>
              {reviews.map((r, i) => (
                <span
                  key={r.id}
                  style={{
                    fontSize: 12,
                    fontFamily: "var(--font-jetbrains), monospace",
                    color: i === 0 ? "var(--text)" : "var(--text-dim)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "3px 9px",
                  }}
                  title={new Date(r.createdAt).toLocaleString()}
                >
                  {r.scoreOutOf10.toFixed(1)}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            background: "var(--surface)",
            border: "1px dashed var(--border-strong)",
            borderRadius: 16,
            padding: "26px 24px",
            marginBottom: 22,
            textAlign: "center",
            color: "var(--text-dim)",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
            No review yet
          </div>
          <div style={{ fontSize: 13 }}>
            Run a rubric review to see your score out of 10, a per-criterion breakdown, and exactly
            what&apos;s missing for full marks.
          </div>
        </div>
      )}

      {/* Coach + Viva, side by side on desktop */}
      <div
        className="topic-detail-grid"
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}
      >
        <CoachPanel
          key={latest?.id ?? "no-review"}
          courseId={courseId}
          submissionId={submissionId}
          actionItems={latest?.actionItems ?? []}
        />
        <VivaPrep
          courseId={courseId}
          submissionId={submissionId}
          initialHasQuestions={submission.hasQuestions}
          canGenerate={submission.hasText}
        />
      </div>
    </div>
  );
}
