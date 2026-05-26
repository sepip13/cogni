"use client";

import Link from "next/link";

interface Props {
  courseId: string;
  courseName: string;
  fileName: string;
  fileType: string;
  blobUrl: string;
  parsedText: string;
  citedPage: number | null;
}

function isPdf(fileType: string, fileName: string): boolean {
  return (
    fileType.includes("pdf") ||
    fileName.toLowerCase().endsWith(".pdf")
  );
}

export function SourceViewer({
  courseId,
  courseName,
  fileName,
  fileType,
  blobUrl,
  parsedText,
  citedPage,
}: Props) {
  // PDFs: use an iframe with the blob URL; browsers' built-in PDF viewer
  // supports the #page=N fragment for jumping to the cited page.
  const iframeUrl = isPdf(fileType, fileName)
    ? `${blobUrl}${citedPage ? `#page=${citedPage}` : ""}`
    : null;

  return (
    <div className="fade-in">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "var(--text-dim)",
          marginBottom: 20,
        }}
      >
        <Link href="/dashboard" style={{ color: "var(--text-dim)" }}>My courses</Link>
        <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
        <Link href={`/courses/${courseId}`} style={{ color: "var(--text-dim)" }}>{courseName}</Link>
        <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
        <span style={{ color: "var(--text)" }} aria-current="page">{fileName}</span>
      </nav>

      {/* File header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "18px 22px",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            background: "rgba(94,234,212,0.1)",
            border: "1px solid rgba(94,234,212,0.3)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent-2)",
            flexShrink: 0,
            fontSize: 16,
          }}
          aria-hidden="true"
        >
          📄
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--text-faint)",
              marginBottom: 2,
              fontWeight: 600,
            }}
          >
            {fileName.split(".").pop()?.toUpperCase()} · Source file
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {fileName}
          </div>
        </div>
        {citedPage && (
          <div
            style={{
              padding: "4px 10px",
              background: "var(--accent-soft)",
              border: "1px solid rgba(124,92,255,0.3)",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--accent)",
              fontWeight: 600,
              fontFamily: "var(--font-jetbrains), monospace",
              flexShrink: 0,
            }}
          >
            p.{citedPage}
          </div>
        )}
        <a
          href={blobUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "8px 14px",
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text)",
            flexShrink: 0,
            textDecoration: "none",
          }}
        >
          Open ↗
        </a>
      </div>

      {/* Content area */}
      {iframeUrl ? (
        // PDF: browser inline viewer — supports #page=N in Chrome/Firefox/Safari
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <iframe
            src={iframeUrl}
            title={`PDF viewer — ${fileName}`}
            style={{ width: "100%", height: "80vh", border: "none", display: "block" }}
          />
        </div>
      ) : (
        // PPTX / DOCX / text — show extracted text
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "28px 32px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-faint)",
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            Extracted text
          </div>
          <pre
            style={{
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: 13,
              lineHeight: 1.7,
              color: "var(--text-dim)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              margin: 0,
              maxHeight: "70vh",
              overflowY: "auto",
            }}
          >
            {parsedText || "No text extracted from this file."}
          </pre>
        </div>
      )}
    </div>
  );
}
