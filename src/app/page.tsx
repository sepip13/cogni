import Link from "next/link";
import { auth } from "@/auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cogni — The Study Assistant That Actually Knows Your Course",
  description:
    "Upload your course materials and get a personalized, ranked study plan in under 90 seconds.",
};

// ── Static content ────────────────────────────────────────────────────────────

const STATS = [
  { num: "118",   desc: "Students surveyed" },
  { num: "89%",   desc: "Feel lost before exams" },
  { num: "4.33/5", desc: "Usefulness rating" },
  { num: "67%",   desc: "Willing to pay €4–7/mo" },
];

const QUOTES = [
  {
    text: "A few days before the exam, when there is too much material and no clear structure.",
    attr: "— Vu N., HU Student",
  },
  {
    text: "Too general and not specific enough for the course material.",
    attr: "— Vu N. on ChatGPT",
  },
  {
    text: "If it reads and knows my work — then yes.",
    attr: "— Jorrit, HU Student",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Upload your course",
    desc: "Drop your syllabus, slides, rubric, or past exams. Anything you have — Cogni reads it all.",
  },
  {
    num: "02",
    title: "Cogni analyzes",
    desc: "It maps every topic to the grading rubric, weights by exam likelihood, and builds your personalized plan.",
  },
  {
    num: "03",
    title: "Study what matters",
    desc: "Ranked topics, time estimates, and practice questions sourced directly from your course materials.",
  },
];

const FEATURES = [
  {
    title: "Reads your actual files",
    desc: "Not generic content. Cogni ingests your syllabus, slides, rubric, and past exams to understand what your specific course tests.",
  },
  {
    title: "Ranks by grade impact",
    desc: 'High-weight topics first. Knockout criteria flagged in red. No more wondering "is this even on the exam?"',
  },
  {
    title: "Realistic time estimates",
    desc: "How long each topic actually takes — calibrated to the depth your professor expects, not a generic average.",
  },
  {
    title: "Source-cited answers",
    desc: 'Every claim links back to the exact page in your course material. No hallucination. No "trust me" answers.',
  },
  {
    title: "Practice in your exam format",
    desc: "Viva-style, multiple choice, essay prompts — whatever your professor uses, Cogni generates practice in that exact format.",
  },
  {
    title: "Your data stays yours",
    desc: "Course files never train any model. Encrypted at rest. Auto-deleted after your exam if you want.",
  },
];

type CmpResult = "yes" | "no" | "partial";
const COMPARE: { feat: string; gpt: CmpResult; claude: CmpResult; notebook: CmpResult; cogni: CmpResult }[] = [
  { feat: "Reads your course files",    gpt: "no",      claude: "partial", notebook: "yes", cogni: "yes" },
  { feat: "Knows your grading rubric",  gpt: "no",      claude: "no",      notebook: "no",  cogni: "yes" },
  { feat: "Prioritizes by exam weight", gpt: "no",      claude: "no",      notebook: "no",  cogni: "yes" },
  { feat: "Generates a study plan",     gpt: "partial", claude: "partial", notebook: "no",  cogni: "yes" },
  { feat: "Source-cited answers",       gpt: "no",      claude: "partial", notebook: "yes", cogni: "yes" },
  { feat: "Built for exam prep",        gpt: "no",      claude: "no",      notebook: "no",  cogni: "yes" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function CmpCell({ v }: { v: CmpResult }) {
  const color = v === "yes" ? "var(--success)" : v === "no" ? "var(--high)" : "var(--text-dim)";
  const label = v === "yes" ? "✓ Yes" : v === "no" ? "✗ No" : "~ Partial";
  return (
    <div style={{ textAlign: "center", fontSize: 13, fontWeight: v === "yes" ? 700 : 400, color, opacity: v === "no" ? 0.65 : 1 }}>
      {label}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const session = await auth();
  const ctaHref  = session?.user ? "/dashboard" : "/auth/signin";
  const ctaLabel = session?.user ? "Go to dashboard →" : "Get started →";

  return (
    <div>

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          background: "rgba(10,14,26,0.88)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontWeight: 800,
              fontSize: 19,
              letterSpacing: "-0.02em",
            }}
          >
            <span
              style={{
                width: 30,
                height: 30,
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                borderRadius: 8,
                display: "inline-flex",
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
            Cogni
          </div>
          <Link
            href={ctaHref}
            style={{
              padding: "8px 18px",
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: "var(--bg)",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {ctaLabel}
          </Link>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        style={{
          padding: "100px 24px 60px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Radial glow behind headline */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -100,
            left: "50%",
            transform: "translateX(-50%)",
            width: 700,
            height: 700,
            background: "radial-gradient(circle, rgba(124,92,255,0.18) 0%, transparent 60%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              background: "rgba(94,234,212,0.1)",
              border: "1px solid rgba(94,234,212,0.3)",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--accent-2)",
              marginBottom: 28,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                background: "var(--accent-2)",
                borderRadius: "50%",
                display: "inline-block",
              }}
              aria-hidden="true"
            />
            Now testing with HU University students
          </div>

          <h1
            style={{
              fontSize: "clamp(40px, 7vw, 72px)",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              maxWidth: 950,
              margin: "0 auto 24px",
            }}
          >
            The study assistant that{" "}
            <span className="grad-text">actually knows your course.</span>
          </h1>

          <p
            style={{
              fontSize: "clamp(16px, 2.2vw, 22px)",
              color: "var(--text-dim)",
              maxWidth: 720,
              margin: "0 auto 44px",
              lineHeight: 1.5,
            }}
          >
            Cogni reads your real course materials, maps them to your exam, and builds a
            personalized study plan ranked by what actually moves your grade. No more
            cramming. No more guessing what&apos;s important.
          </p>

          <div
            style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}
          >
            <Link
              href={ctaHref}
              style={{
                padding: "16px 28px",
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                color: "var(--bg)",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: "-0.01em",
              }}
            >
              {ctaLabel}
            </Link>
            <a
              href="#how"
              style={{
                padding: "16px 28px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontWeight: 600,
                fontSize: 15,
                color: "var(--text)",
              }}
            >
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* ── Stats strip ───────────────────────────────────────────────────── */}
      <section
        style={{
          padding: "30px 24px 60px",
          textAlign: "center",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <p
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "var(--text-faint)",
              fontWeight: 600,
              marginBottom: 28,
            }}
          >
            Validated with HU University students · Sprint 3 data
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "clamp(24px, 5vw, 60px)",
              flexWrap: "wrap",
            }}
          >
            {STATS.map((s) => (
              <div key={s.num}>
                <div
                  className="grad-text"
                  style={{
                    fontSize: "clamp(28px, 4vw, 42px)",
                    fontWeight: 800,
                    letterSpacing: "-0.03em",
                    marginBottom: 4,
                  }}
                >
                  {s.num}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-dim)" }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Problem ───────────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h2
            style={{
              fontSize: "clamp(28px, 4vw, 42px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              marginBottom: 16,
              maxWidth: 800,
            }}
          >
            Every student knows the feeling.
            <br />
            Nobody&apos;s solving it.
          </h2>
          <p
            style={{
              fontSize: 18,
              color: "var(--text-dim)",
              maxWidth: 700,
              marginBottom: 56,
              lineHeight: 1.5,
            }}
          >
            100% of HU students already use ChatGPT, Claude, or NotebookLM for studying.
            None of those tools know what&apos;s actually in your course. So students still
            spend hours figuring out what to study before they can even start.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 20,
            }}
          >
            {QUOTES.map((q) => (
              <blockquote
                key={q.attr}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 16,
                  padding: "28px 28px 24px",
                  position: "relative",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: 52,
                    color: "var(--accent)",
                    lineHeight: 1,
                    position: "absolute",
                    top: 14,
                    right: 22,
                    opacity: 0.35,
                  }}
                >
                  &ldquo;
                </span>
                <p
                  style={{
                    fontSize: 16,
                    fontStyle: "italic",
                    lineHeight: 1.5,
                    marginBottom: 16,
                    color: "var(--text)",
                  }}
                >
                  {q.text}
                </p>
                <cite
                  style={{
                    fontSize: 12,
                    color: "var(--text-faint)",
                    fontFamily: "var(--font-jetbrains), monospace",
                    fontStyle: "normal",
                  }}
                >
                  {q.attr}
                </cite>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section
        id="how"
        style={{
          background: "var(--bg-2)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          padding: "80px 24px",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h2
            style={{
              fontSize: "clamp(28px, 4vw, 42px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            How Cogni works
          </h2>
          <p
            style={{
              textAlign: "center",
              color: "var(--text-dim)",
              fontSize: 17,
              marginBottom: 56,
            }}
          >
            Three steps. Five minutes. A real study plan.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 24,
            }}
          >
            {STEPS.map((step) => (
              <div
                key={step.num}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 16,
                  padding: 28,
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    width: 34,
                    height: 34,
                    background: "var(--surface-2)",
                    border: "1px solid var(--accent)",
                    color: "var(--accent)",
                    borderRadius: 8,
                    fontFamily: "var(--font-jetbrains), monospace",
                    fontWeight: 700,
                    fontSize: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 18,
                  }}
                >
                  {step.num}
                </div>
                <h3
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    letterSpacing: "-0.015em",
                    marginBottom: 8,
                  }}
                >
                  {step.title}
                </h3>
                <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.55 }}>
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h2
            style={{
              fontSize: "clamp(28px, 4vw, 42px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            Built on what students actually said
          </h2>
          <p
            style={{
              textAlign: "center",
              color: "var(--text-dim)",
              fontSize: 17,
              marginBottom: 56,
            }}
          >
            Every feature traces back to a real interview quote.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 20,
            }}
          >
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 16,
                  padding: 32,
                }}
              >
                {/* Number badge used as icon — keeps design consistent with step numbers */}
                <div
                  aria-hidden="true"
                  style={{
                    display: "inline-flex",
                    width: 44,
                    height: 44,
                    background: "rgba(124,92,255,0.12)",
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--accent)",
                    fontFamily: "var(--font-jetbrains), monospace",
                    fontWeight: 700,
                    fontSize: 13,
                    marginBottom: 18,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3
                  style={{
                    fontSize: 19,
                    fontWeight: 700,
                    letterSpacing: "-0.015em",
                    marginBottom: 10,
                  }}
                >
                  {f.title}
                </h3>
                <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.6 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Compare ───────────────────────────────────────────────────────── */}
      <section
        style={{
          background: "var(--bg-2)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          padding: "80px 24px",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h2
            style={{
              fontSize: "clamp(28px, 4vw, 42px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            Why not just use ChatGPT?
          </h2>
          <p
            style={{
              textAlign: "center",
              color: "var(--text-dim)",
              fontSize: 17,
              marginBottom: 56,
            }}
          >
            Existing AI is built for general questions. Cogni is built for one job: helping
            you ace your specific exam.
          </p>
          {/* overflow-x scroll keeps the table readable on narrow viewports */}
          <div style={{ overflowX: "auto" }}>
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                overflow: "hidden",
                minWidth: 560,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr 1.2fr",
                  padding: "14px 20px",
                  background: "var(--surface-2)",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--text-faint)",
                  fontWeight: 700,
                }}
              >
                <div>Feature</div>
                <div style={{ textAlign: "center" }}>ChatGPT</div>
                <div style={{ textAlign: "center" }}>Claude</div>
                <div style={{ textAlign: "center" }}>NotebookLM</div>
                <div style={{ textAlign: "center", color: "var(--accent)" }}>Cogni</div>
              </div>
              {COMPARE.map((row, i) => (
                <div
                  key={row.feat}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr 1fr 1.2fr",
                    padding: "16px 20px",
                    borderBottom:
                      i < COMPARE.length - 1 ? "1px solid var(--border)" : "none",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{row.feat}</div>
                  <CmpCell v={row.gpt} />
                  <CmpCell v={row.claude} />
                  <CmpCell v={row.notebook} />
                  <div
                    style={{
                      background: "rgba(124,92,255,0.05)",
                      borderLeft: "2px solid var(--accent)",
                      paddingLeft: 12,
                    }}
                  >
                    <CmpCell v={row.cogni} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA banner ────────────────────────────────────────────────────── */}
      <section
        style={{
          textAlign: "center",
          padding: "80px 24px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h2
            style={{
              fontSize: "clamp(30px, 5vw, 48px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              maxWidth: 800,
              margin: "0 auto 20px",
            }}
          >
            Stop guessing what to study.
            <br />
            <span className="grad-text">Start with Cogni.</span>
          </h2>
          <p
            style={{
              fontSize: 18,
              color: "var(--text-dim)",
              maxWidth: 600,
              margin: "0 auto 36px",
              lineHeight: 1.5,
            }}
          >
            Built by HU students for HU students. Validated on real exam prep pain points.
            Launching for the next exam season.
          </p>
          <Link
            href={ctaHref}
            style={{
              display: "inline-block",
              padding: "16px 32px",
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: "var(--bg)",
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: "-0.01em",
            }}
          >
            {ctaLabel}
          </Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{ padding: "40px 24px" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
            fontSize: 13,
            color: "var(--text-faint)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 22,
                height: 22,
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                borderRadius: 6,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                color: "var(--bg)",
                fontSize: 11,
              }}
              aria-hidden="true"
            >
              C
            </span>
            Cogni &middot; HU University
          </div>
          <div>Team L1J &middot; Sepehr &middot; Yang &middot; Siem &middot; Phuong &middot; Robbert</div>
        </div>
      </footer>

    </div>
  );
}
