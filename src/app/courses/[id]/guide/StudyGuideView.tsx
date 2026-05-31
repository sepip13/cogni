"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MindMapGraph } from "./MindMapGraph";
import { GuideReader } from "./GuideReader";
import { StartHerePanel } from "./StartHerePanel";
import { Flashcards } from "./Flashcards";
import type { FlashcardConceptCount, FlashcardCounts, GuideSection, MindMap, MindMapNode, StudyGuideData } from "../types";

const GUIDE_SCOPE_KEY = "__guide__"; // makingCards key for a whole-guide card generation

const POLL_MS = 2500;
const CLUSTER_COLORS = [
  "var(--accent)",
  "var(--accent-2)",
  "var(--low)",
  "var(--med)",
  "var(--success)",
  "var(--high)",
];

function clusterColorMap(mindMap: MindMap): Map<string, string> {
  const ids = Array.from(
    new Set(mindMap.clusters.map((c) => c.id).concat(mindMap.nodes.map((n) => n.cluster)))
  );
  const map = new Map<string, string>();
  ids.forEach((id, i) => map.set(id, CLUSTER_COLORS[i % CLUSTER_COLORS.length]));
  return map;
}

function ImportanceBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span style={{ width: 56, color: "var(--text-dim)" }}>{label}</span>
      <div style={{ display: "flex", gap: 3 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            style={{
              width: 14,
              height: 6,
              borderRadius: 2,
              background: i <= value ? color : "var(--surface-2)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ConceptAction({
  section,
  onGenerate,
  onJump,
}: {
  section: GuideSection | undefined;
  onGenerate: (id: string) => void;
  onJump: (conceptKey: string) => void;
}) {
  if (!section) return null;
  const base: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
  };
  if (section.status === "READY") {
    return (
      <button onClick={() => onJump(section.conceptKey)} style={{ ...base, background: "var(--surface-2)", border: "1px solid var(--border-strong)", color: "var(--text)" }}>
        Read this part ↓
      </button>
    );
  }
  if (section.status === "GENERATING") {
    return <button disabled style={{ ...base, background: "var(--surface-2)", color: "var(--text-dim)", cursor: "default" }}>Writing this part…</button>;
  }
  return (
    <button onClick={() => onGenerate(section.id)} style={{ ...base, background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "var(--bg)" }}>
      {section.status === "FAILED" ? "Try again" : "Generate this part"}
    </button>
  );
}

// Per-concept flashcard action: make cards when none exist, else review them.
function CardsAction({
  conceptKey,
  count,
  making,
  onMake,
  onReview,
}: {
  conceptKey: string;
  count: FlashcardConceptCount | null | undefined;
  making: boolean;
  onMake: (conceptKey: string) => void;
  onReview: (conceptKey: string, dueOnly: boolean) => void;
}) {
  const base: React.CSSProperties = {
    width: "100%",
    padding: "9px 14px",
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 8,
    background: "var(--surface-2)",
    border: "1px solid var(--border-strong)",
    color: "var(--text)",
  };
  if (making) {
    return <button disabled style={{ ...base, color: "var(--text-dim)", cursor: "default" }}>Making cards…</button>;
  }
  if (count && count.total > 0) {
    return (
      <button onClick={() => onReview(conceptKey, count.due > 0)} style={base}>
        🃏 Review cards{count.due > 0 ? ` · ${count.due} due` : ` · ${count.total}`}
      </button>
    );
  }
  return <button onClick={() => onMake(conceptKey)} style={base}>🃏 Make flashcards</button>;
}

function ConceptDetail({
  node,
  color,
  clusterTitle,
  section,
  conceptCount,
  making,
  onGenerate,
  onJump,
  onMakeCards,
  onReviewCards,
}: {
  node: MindMapNode;
  color: string;
  clusterTitle: string;
  section: GuideSection | undefined;
  conceptCount: FlashcardConceptCount | null | undefined;
  making: boolean;
  onGenerate: (id: string) => void;
  onJump: (conceptKey: string) => void;
  onMakeCards: (conceptKey: string) => void;
  onReviewCards: (conceptKey: string, dueOnly: boolean) => void;
}) {
  const pages = (node.sourceRefs ?? []).map((s) => s.page).filter(Boolean);
  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)" }}>
          {clusterTitle}
        </span>
      </div>
      <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 8 }}>{node.label}</h3>
      <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 16 }}>{node.summary}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        <ImportanceBar label="Exam" value={node.examImportance} color="var(--high)" />
        <ImportanceBar label="Learning" value={node.learningImportance} color="var(--accent)" />
      </div>
      {pages.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--text-faint)", fontFamily: "var(--font-jetbrains), monospace", marginBottom: 14 }}>
          Source: p.{pages.join(", ")}
        </p>
      )}
      <ConceptAction section={section} onGenerate={onGenerate} onJump={onJump} />
      <CardsAction
        conceptKey={node.id}
        count={conceptCount}
        making={making}
        onMake={onMakeCards}
        onReview={onReviewCards}
      />
    </div>
  );
}

function CenterState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 480, margin: "60px auto 0", textAlign: "center" }}>{children}</div>
  );
}

export function StudyGuideView({ courseId, courseName }: { courseId: string; courseName: string }) {
  const [guide, setGuide] = useState<StudyGuideData | null>(null);
  const [examStyleAvailable, setExamStyleAvailable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [briefingBusy, setBriefingBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flashCounts, setFlashCounts] = useState<FlashcardCounts | null>(null);
  const [review, setReview] = useState<{ conceptKey: string | null; dueOnly: boolean } | null>(null);
  const [makingCards, setMakingCards] = useState<Set<string>>(new Set());
  const makingBaseRef = useRef<Map<string, number>>(new Map());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchGuide = useCallback(() => {
    return fetch(`/api/courses/${courseId}/guide`)
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ guide: StudyGuideData | null; examStyleAvailable?: boolean }>)
          : Promise.reject()
      )
      .then((d) => {
        setGuide(d.guide);
        setExamStyleAvailable(!!d.examStyleAvailable);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [courseId]);

  useEffect(() => {
    fetchGuide();
  }, [fetchGuide]);

  // Poll while the map is being built, a section is being written, OR the game
  // plan is generating (covers a reload mid-generation in another tab).
  const busy =
    guide?.status === "ANALYZING" ||
    guide?.briefingStatus === "GENERATING" ||
    (guide?.sections.some((s) => s.status === "GENERATING" || s.quizStatus === "GENERATING") ?? false);
  useEffect(() => {
    if (!busy) return;
    pollRef.current = setInterval(fetchGuide, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [busy, fetchGuide]);

  // Flashcard counts drive the header due badge + the per-concept "Cards" button.
  const fetchCounts = useCallback(() => {
    return fetch(`/api/courses/${courseId}/flashcards`)
      .then((r) => (r.ok ? (r.json() as Promise<{ counts: FlashcardCounts }>) : Promise.reject()))
      .then((d) => setFlashCounts(d.counts))
      .catch(() => {});
  }, [courseId]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Card generation has no DB status, so we poll counts and clear a "making" key
  // once its concept's card total grows past the baseline captured at request time.
  const checkMaking = useCallback(async () => {
    const counts = await fetch(`/api/courses/${courseId}/flashcards`)
      .then((r) => (r.ok ? (r.json() as Promise<{ counts: FlashcardCounts }>) : Promise.reject()))
      .then((d) => d.counts)
      .catch(() => null);
    if (!counts) return;
    setFlashCounts(counts);
    const base = makingBaseRef.current;
    const still = new Set<string>();
    for (const [key, baseTotal] of base) {
      const current = key === GUIDE_SCOPE_KEY ? counts.total : counts.perConcept[key]?.total ?? 0;
      if (current > baseTotal) base.delete(key);
      else still.add(key);
    }
    setMakingCards(still);
  }, [courseId]);

  const makingActive = makingCards.size > 0;
  useEffect(() => {
    if (!makingActive) return;
    let attempts = 0;
    const id = setInterval(() => {
      attempts++;
      void checkMaking();
      if (attempts >= 40) {
        // ~2 min ceiling: stop waiting even if a generation silently failed.
        makingBaseRef.current.clear();
        setMakingCards(new Set());
      }
    }, 3000);
    return () => clearInterval(id);
  }, [makingActive, checkMaking]);

  function makeCards(conceptKey: string | null) {
    const key = conceptKey ?? GUIDE_SCOPE_KEY;
    const baseTotal = conceptKey ? flashCounts?.perConcept[conceptKey]?.total ?? 0 : flashCounts?.total ?? 0;
    makingBaseRef.current.set(key, baseTotal);
    setMakingCards((s) => new Set(s).add(key));
    fetch(`/api/courses/${courseId}/flashcards/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(conceptKey ? { conceptKey, scope: "concept" } : { scope: "guide" }),
    }).catch(() => {
      makingBaseRef.current.delete(key);
      setMakingCards((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    });
  }

  function generate(sectionId: string) {
    setGuide((g) =>
      g
        ? { ...g, sections: g.sections.map((s) => (s.id === sectionId ? { ...s, status: "GENERATING" } : s)) }
        : g
    );
    fetch(`/api/courses/${courseId}/guide/sections/${sectionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(() => fetchGuide())
      .catch(() => {});
  }

  // On-demand: write 1–2 exam-style questions for this one part, then poll until ready.
  function generateQuiz(sectionId: string) {
    setGuide((g) =>
      g
        ? { ...g, sections: g.sections.map((s) => (s.id === sectionId ? { ...s, quizStatus: "GENERATING" } : s)) }
        : g
    );
    fetch(`/api/courses/${courseId}/guide/sections/${sectionId}/quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(() => fetchGuide())
      .catch(() => {});
  }

  function runBriefing() {
    setBriefingBusy(true);
    setGuide((g) => (g ? { ...g, briefingStatus: "GENERATING", briefingError: null } : g));
    fetch(`/api/courses/${courseId}/guide/briefing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(async (r) => {
        const b = (await r.json().catch(() => ({}))) as { briefing?: StudyGuideData["briefing"]; error?: string };
        if (!r.ok || !b.briefing) {
          setGuide((g) => (g ? { ...g, briefingStatus: "FAILED", briefingError: b.error ?? "Couldn't build your game plan." } : g));
          return;
        }
        setGuide((g) => (g ? { ...g, briefing: b.briefing!, briefingStatus: "READY", briefingError: null } : g));
      })
      .catch(() => setGuide((g) => (g ? { ...g, briefingStatus: "FAILED", briefingError: "Network error — please try again." } : g)))
      .finally(() => setBriefingBusy(false));
  }

  function jumpTo(conceptKey: string) {
    requestAnimationFrame(() => {
      document.getElementById(`section-${conceptKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function create() {
    setCreating(true);
    setError("");
    fetch(`/api/courses/${courseId}/guide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(async (r) => {
        if (!r.ok) {
          const b = (await r.json().catch(() => ({}))) as { error?: string };
          setError(b.error ?? "Could not start the study guide.");
          return;
        }
        setGuide((g) => (g ? { ...g, status: "ANALYZING", error: null } : { id: "", status: "ANALYZING", language: null, mindMap: null, outline: null, briefing: null, briefingStatus: "PENDING", briefingError: null, error: null, updatedAt: "", sections: [] }));
      })
      .catch(() => setError("Network error — please try again."))
      .finally(() => setCreating(false));
  }

  const crumb = (
    <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-dim)", marginBottom: 22, flexWrap: "wrap" }}>
      <Link href="/dashboard" style={{ color: "var(--text-dim)" }}>My courses</Link>
      <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
      <Link href={`/courses/${courseId}`} style={{ color: "var(--text-dim)" }}>{courseName}</Link>
      <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
      <span style={{ color: "var(--text)" }} aria-current="page">Study guide</span>
    </nav>
  );

  if (!loaded) {
    return <div className="skeleton" style={{ height: 320, borderRadius: 16, marginTop: 40 }} aria-busy="true" />;
  }

  // No guide yet, or never built.
  if (!guide || (guide.status !== "ANALYZING" && !guide.mindMap && guide.status !== "FAILED")) {
    return (
      <div className="fade-in">
        {crumb}
        <CenterState>
          <div style={{ fontSize: 40, marginBottom: 14 }} aria-hidden="true">🧠</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 10 }}>Build your study guide</h1>
          <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 22 }}>
            Cogni reads all your material, maps how the concepts connect, and shows you what matters
            most — for the exam and for really understanding it. Start with the concept map.
          </p>
          {error && <p style={{ fontSize: 13, color: "var(--high)", marginBottom: 14 }}>{error}</p>}
          <button
            onClick={create}
            disabled={creating}
            style={{
              padding: "13px 28px",
              background: creating ? "var(--surface-2)" : "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: creating ? "var(--text-dim)" : "var(--bg)",
              border: "none",
              borderRadius: 11,
              fontSize: 15,
              fontWeight: 700,
              cursor: creating ? "default" : "pointer",
            }}
            aria-busy={creating}
          >
            {creating ? "Starting…" : "Create my study guide"}
          </button>
        </CenterState>
      </div>
    );
  }

  if (guide.status === "ANALYZING") {
    return (
      <div className="fade-in">
        {crumb}
        <CenterState>
          <div className="pulse-glow" style={{ width: 64, height: 64, margin: "0 auto 20px", borderRadius: 18, background: "linear-gradient(135deg, var(--accent), var(--accent-2))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }} aria-hidden="true">🧠</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Mapping your concepts…</h1>
          <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.6 }}>
            Reading the material and working out how everything fits together. This takes a moment.
          </p>
        </CenterState>
      </div>
    );
  }

  if (guide.status === "FAILED") {
    return (
      <div className="fade-in">
        {crumb}
        <CenterState>
          <div style={{ fontSize: 36, marginBottom: 14 }} aria-hidden="true">⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Couldn&apos;t build the map</h1>
          <p style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 20 }}>{guide.error || "Something went wrong. Try again."}</p>
          <button onClick={create} disabled={creating} style={{ padding: "12px 24px", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "var(--bg)", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            {creating ? "Retrying…" : "Try again"}
          </button>
        </CenterState>
      </div>
    );
  }

  // MAP_READY / GENERATING / READY → show the graph.
  const mindMap = guide.mindMap as MindMap;
  const colors = clusterColorMap(mindMap);
  const sectionByKey = new Map(guide.sections.map((s) => [s.conceptKey, s]));
  const selected = selectedId ? mindMap.nodes.find((n) => n.id === selectedId) ?? null : null;
  const selectedClusterTitle = selected
    ? mindMap.clusters.find((c) => c.id === selected.cluster)?.title ?? selected.cluster
    : "";

  return (
    <div className="fade-in">
      {crumb}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em", marginBottom: 6 }}>Study guide</h1>
          <p style={{ fontSize: 14, color: "var(--text-dim)" }}>
            {mindMap.nodes.length} concepts · {mindMap.clusters.length} clusters
            {guide.language ? ` · ${guide.language}` : ""} · tap a concept to explore
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {flashCounts && flashCounts.total > 0 ? (
            <button
              onClick={() => setReview({ conceptKey: null, dueOnly: true })}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 13, fontWeight: 700, color: "var(--text)", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              🃏 Flashcards
              {flashCounts.due > 0 && (
                <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "var(--high)", color: "var(--bg)", fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  {flashCounts.due}
                </span>
              )}
            </button>
          ) : (
            <button
              onClick={() => makeCards(null)}
              disabled={makingCards.has(GUIDE_SCOPE_KEY)}
              style={{ padding: "9px 16px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 13, fontWeight: 700, color: makingCards.has(GUIDE_SCOPE_KEY) ? "var(--text-dim)" : "var(--text)", cursor: makingCards.has(GUIDE_SCOPE_KEY) ? "default" : "pointer", whiteSpace: "nowrap" }}
            >
              {makingCards.has(GUIDE_SCOPE_KEY) ? "Making cards…" : "🃏 Make flashcards"}
            </button>
          )}
          <button onClick={create} disabled={creating} style={{ padding: "9px 18px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "var(--text)", cursor: "pointer", whiteSpace: "nowrap" }}>
            {creating ? "Rebuilding…" : "Rebuild map"}
          </button>
        </div>
      </div>

      <StartHerePanel
        courseName={courseName}
        status={guide.briefingStatus}
        briefing={guide.briefing}
        error={guide.briefingError}
        busy={briefingBusy}
        onGenerate={runBriefing}
      />

      <div className="topic-detail-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        {/* Graph */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 8, overflow: "hidden" }}>
          <MindMapGraph
            mindMap={mindMap}
            selectedId={selectedId}
            onSelect={setSelectedId}
            conceptCounts={flashCounts?.perConcept ?? null}
          />
        </div>

        {/* Side: detail + legend */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 20, minHeight: 160 }}>
            {selected ? (
              <ConceptDetail
                node={selected}
                color={colors.get(selected.cluster) ?? "var(--accent)"}
                clusterTitle={selectedClusterTitle}
                section={sectionByKey.get(selected.id)}
                conceptCount={flashCounts?.perConcept[selected.id]}
                making={makingCards.has(selected.id)}
                onGenerate={generate}
                onJump={jumpTo}
                onMakeCards={makeCards}
                onReviewCards={(ck, dueOnly) => setReview({ conceptKey: ck, dueOnly })}
              />
            ) : (
              <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, paddingTop: 8 }}>
                <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>Explore the map</div>
                Bigger circles matter more. Lines show how concepts connect. Tap any concept to see why
                it matters and where it&apos;s covered.
              </div>
            )}
          </div>

          {mindMap.clusters.length > 0 && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 10 }}>
                Clusters
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {mindMap.clusters.map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: colors.get(c.id) ?? "var(--accent)", flexShrink: 0 }} />
                    <span style={{ color: "var(--text)" }}>{c.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <GuideReader
        courseId={courseId}
        sections={guide.sections}
        examStyleAvailable={examStyleAvailable}
        onGenerate={generate}
        onQuiz={generateQuiz}
      />

      {review && (
        <Flashcards
          courseId={courseId}
          conceptKey={review.conceptKey}
          dueOnly={review.dueOnly}
          labelFor={(key) => (key ? mindMap.nodes.find((n) => n.id === key)?.label ?? key : "Flashcards")}
          onClose={() => setReview(null)}
          onChanged={fetchCounts}
          onJumpToConcept={(key) => {
            setReview(null);
            jumpTo(key);
          }}
        />
      )}
    </div>
  );
}
