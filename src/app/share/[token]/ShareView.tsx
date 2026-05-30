import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { ShareCourse, ShareCourseTopic } from "@/lib/share";

function fmtMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function subtopicText(st: unknown): string {
  if (typeof st === "string") return st;
  if (st && typeof st === "object" && "text" in st) {
    const t = (st as { text: unknown }).text;
    if (typeof t === "string") return t;
  }
  return "";
}

const PRIORITY_STYLES: Record<"HIGH" | "MED" | "LOW", { bg: string; color: string; border: string }> = {
  HIGH: { bg: "rgba(255,107,107,0.12)", color: "var(--high)", border: "rgba(255,107,107,0.3)" },
  MED: { bg: "rgba(251,191,36,0.12)", color: "var(--med)", border: "rgba(251,191,36,0.25)" },
  LOW: { bg: "rgba(96,165,250,0.12)", color: "var(--low)", border: "rgba(96,165,250,0.25)" },
};

function PriorityChip({ priority, label }: { priority: "HIGH" | "MED" | "LOW"; label: string }) {
  const c = PRIORITY_STYLES[priority];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 5,
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

function ShareHeader() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        background: "var(--nav-bg)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--border)",
        zIndex: 40,
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "0 24px",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }} aria-label="Cogni home">
          <span
            style={{
              width: 30,
              height: 30,
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              color: "var(--bg)",
              fontSize: 15,
            }}
            aria-hidden="true"
          >
            C
          </span>
          <span style={{ fontWeight: 800, fontSize: 19, letterSpacing: "-0.02em", color: "var(--text)" }}>
            Cogni
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-dim)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              padding: "4px 10px",
              borderRadius: 6,
            }}
          >
            Shared · read-only
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function NotReady({ name }: { name: string }) {
  return (
    <div style={{ maxWidth: 480, margin: "80px auto 0", textAlign: "center", padding: "0 24px" }}>
      <div style={{ fontSize: 36, marginBottom: 16 }} aria-hidden="true">⏳</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>{name}</h1>
      <p style={{ fontSize: 14, color: "var(--text-dim)" }}>
        This study plan is still being prepared. Check back shortly.
      </p>
    </div>
  );
}

function TopicCard({ topic }: { topic: ShareCourseTopic }) {
  const subtopics = Array.isArray(topic.subtopics) ? topic.subtopics : [];
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "18px 22px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: 13,
            color: "var(--text-faint)",
          }}
          aria-hidden="true"
        >
          {topic.num}
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{topic.title}</span>
        <PriorityChip priority={topic.priority} label={topic.priorityLabel ?? topic.priority} />
        <span
          style={{
            marginLeft: "auto",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "var(--font-jetbrains), monospace",
            color: "var(--text-dim)",
          }}
        >
          {fmtMinutes(topic.timeMinutes)}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.55, marginBottom: subtopics.length ? 12 : 0 }}>
        {topic.why}
      </p>
      {subtopics.length > 0 && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6, paddingLeft: 0 }}>
          {subtopics.map((st, i) => {
            const text = subtopicText(st);
            if (!text) return null;
            return (
              <li
                key={i}
                style={{
                  fontSize: 13,
                  color: "var(--text-dim)",
                  paddingLeft: 14,
                  borderLeft: "2px solid var(--border-strong)",
                  lineHeight: 1.5,
                }}
              >
                {text}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ShareView({
  token,
  course,
  includeSources,
}: {
  token: string;
  course: ShareCourse;
  includeSources: boolean;
}) {
  const days = daysUntil(course.examDate);
  const totalPrep = course.totalPrepTimeMinutes ?? 0;
  const highCount = course.topics.filter((t) => t.priority === "HIGH").length;

  if (course.status !== "READY") {
    return (
      <>
        <ShareHeader />
        <NotReady name={course.name} />
      </>
    );
  }

  const kpis = [
    { label: "Topics", value: String(course.topics.length), sub: `${highCount} high priority` },
    { label: "Prep time", value: fmtMinutes(totalPrep), sub: "total estimated" },
    {
      label: days !== null ? "Days left" : "Exam date",
      value: days !== null ? (days <= 0 ? "0" : String(days)) : "—",
      sub: days !== null ? (days <= 0 ? "Good luck! 🎯" : "until exam") : "Not set",
    },
  ];

  return (
    <>
      <ShareHeader />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 80px" }}>
        <section aria-labelledby="share-course-heading" className="fade-in">
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--accent)",
              marginBottom: 8,
            }}
          >
            Shared study plan
          </p>
          <h1 id="share-course-heading" style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 8 }}>
            {course.name}
            {course.code && (
              <span style={{ marginLeft: 10, fontSize: 15, fontWeight: 500, color: "var(--text-dim)", fontFamily: "var(--font-jetbrains), monospace" }}>
                {course.code}
              </span>
            )}
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-dim)" }}>
            {course.topics.length} topics · {fmtMinutes(totalPrep)} total prep
            {days !== null && (
              <>
                {" · "}
                <span style={{ color: days <= 3 ? "var(--high)" : days <= 7 ? "var(--med)" : "var(--text-dim)", fontWeight: days <= 7 ? 600 : 400 }}>
                  {days <= 0 ? "exam today!" : days === 1 ? "exam tomorrow" : `${days} days until exam`}
                </span>
              </>
            )}
          </p>
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: 12,
            margin: "28px 0",
          }}
        >
          {kpis.map((kpi) => (
            <div key={kpi.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-faint)", marginBottom: 6, fontWeight: 600 }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 }}>{kpi.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.015em", marginBottom: 4 }}>Study plan</h2>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
          Ranked by exam impact · highest priority first
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {course.topics.map((t) => (
            <TopicCard key={t.order} topic={t} />
          ))}
        </div>

        {includeSources && course.files.length > 0 && (
          <section style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Source materials</h2>
            <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
              Shared by the course owner
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {course.files.map((f) => {
                const href = f.blobUrl.startsWith("/api/files/")
                  ? f.blobUrl.replace("/api/files/", `/api/share/${token}/files/`)
                  : null;
                return (
                  <div
                    key={f.id}
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <span style={{ fontSize: 14, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.fileName}
                    </span>
                    {href && (
                      <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", flexShrink: 0 }}>
                        Open →
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <footer style={{ marginTop: 48, paddingTop: 20, borderTop: "1px solid var(--border)", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
            Built with{" "}
            <Link href="/" style={{ color: "var(--accent)", fontWeight: 600 }}>Cogni</Link> — turn your course
            materials into a personalized study plan.
          </p>
        </footer>
      </main>
    </>
  );
}
