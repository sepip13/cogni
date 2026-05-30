# Cogni — Study Guide + Exam Trainer (design)

Two flagship learning features, designed so **free LLMs produce premium-feeling output**.
Decisions locked with Sepehr (2026-05-30):

- Study Guide = **new artifact** (not an extension of the study plan).
- Mind map = **graphical, user-facing, built now** (it's the navigation surface, not just an internal step).
- Generation = **progressive**: session 1 is produced immediately; each later section is generated **on click**.
- **No** automated self-critique/refine pass — quality comes from structure + grounding + small focused tasks.
- Models = **tiered + user choice**: PRO defaults to the strongest (or picks); FREE uses the free pool.
- Output language = **the language of the uploaded material**, written in an easy/simple register (not forced English).
- Build **both** features.

---

## 0. The quality thesis (why free models will feel premium)

A free model fails when you ask it to "write a full study guide" cold: it drifts, pads, and hallucinates. We avoid that with five structural moves — none of which add a critique pass:

1. **Structure before prose.** First extract a *grounded concept map* (JSON). Prose is generated **per concept**, never as one giant blob. The model always writes a small, well-scoped thing.
2. **Concept-scoped chunking + retrieval.** Each section prompt receives only the source slices relevant to that concept (+ its mind-map neighbors). Small, relevant context → less drift, fits even modest context windows.
3. **Hard grounding + gap-flagging.** Every prompt says: *use only the provided material; if something needed is missing, say so — never invent.* Cited claims, explicit "not covered in your slides" notes.
4. **Progressive, on-demand generation.** Session 1 instant; the rest on click. Keeps each call cheap/fast on free tiers and lets the user steer depth.
5. **Tiered models, but context is never the bottleneck.** Even the FREE pool has 1M-context models (`gemini-2.5-flash`). We always pick the **largest-context model in the user's tier**, so "huge presentations" fit in one analysis pass regardless of plan.

Everything below serves these five.

---

## 1. Data model (Prisma additions)

```prisma
model StudyGuide {
  id         String   @id @default(cuid())
  courseId   String   @unique           // one live guide per course (regenerable)
  course     Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  status     GuideStatus @default(ANALYZING)
  language   String?                     // detected from material
  mindMap    Json?                       // { nodes[], edges[], clusters[] }
  outline    Json?                       // ordered conceptIds → sections, teaching order
  modelId    String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  sections   StudyGuideSection[]
}

enum GuideStatus { ANALYZING MAP_READY GENERATING READY FAILED }

model StudyGuideSection {
  id          String  @id @default(cuid())
  guideId     String
  guide       StudyGuide @relation(fields: [guideId], references: [id], onDelete: Cascade)
  order       Int
  conceptKey  String                      // node id in the mind map
  title       String
  status      SectionStatus @default(PENDING)   // PENDING until the user generates it
  contentMd   String? @db.Text
  sources     Json?                        // [{ page, quote }]
  modelId     String?
  generatedAt DateTime?
  @@index([guideId])
}

enum SectionStatus { PENDING GENERATING READY FAILED }

// ── Exam trainer ──
model ExamTrial {
  id         String  @id @default(cuid())
  courseId   String
  course     Course  @relation(fields: [courseId], references: [id], onDelete: Cascade)
  fileName   String
  fileType   String?
  blobUrl    String?
  parsedText String? @db.Text
  questions  Json?                          // parsed [{ num, text, type, marks }]
  createdAt  DateTime @default(now())
  mockExams  MockExam[]
  @@index([courseId])
}

model MockExam {
  id         String  @id @default(cuid())
  courseId   String
  trialId    String?
  trial      ExamTrial? @relation(fields: [trialId], references: [id], onDelete: SetNull)
  title      String
  status     MockStatus @default(GENERATING)
  questions  Json                           // [{ q, type, marks, source, expected_answer, key_points }]
  modelId    String?
  createdAt  DateTime @default(now())
  @@index([courseId])
}

enum MockStatus { GENERATING READY FAILED }

// "Explain" is a chat thread anchored to ONE trial question (reuses the chat pattern).
model ExamExplainMessage {
  id        String  @id @default(cuid())
  trialId   String
  qIndex    Int                              // which trial question
  role      String                           // user | assistant
  content   String  @db.Text
  createdAt DateTime @default(now())
  @@index([trialId, qIndex])
}
```

Reuse, don't reinvent: upload/parse (`saveFileLocally`, `parseFile`), `Course.rawText` + `Topic[]` + priorities as analysis input, `resolveModelForPlan` + `/api/models` for model selection, the streaming chat shape for Explain, and the practice grade loop for the mock exam.

---

## 2. Pipeline A — Study Guide

```
Course READY ──▶ [Create study guide]
   │
   ├─ Step 1  CONCEPT MAP   (1 call, largest-ctx model)   rawText + topics/priorities → mindMap JSON + outline
   │            status: ANALYZING → MAP_READY            ← user sees the GRAPH immediately
   │
   ├─ Step 2  SESSION 1     auto-generate the first cluster's sections (top exam+learning importance)
   │            status: GENERATING → READY (partial)     ← first real content, fast
   │
   └─ Step 3  ON CLICK      "Generate this part" per concept/cluster → one focused, grounded call each
                            section.status PENDING → READY
```

- **Chunking = concept-based.** The outline groups concepts into clusters; a "section" = one concept (or a tight cluster). Step 1 decides the grouping so each generated section is a coherent, teachable unit.
- **Retrieval per section.** Before generating a section we slice `rawText` to the pages/snippets the concept node cites (`sourceRefs`) + immediate neighbors. The section call only sees that slice → grounded + small.
- **Mind map is the UI.** Clicking a node either jumps to its (READY) section or triggers its generation. Importance drives node size/color; clusters drive layout. This *is* the "session 1 now, next on click" UX.
- **Assembly + export.** Sections render in outline order in an in-app reader; reuse the existing PDF export.

## 3. Pipeline B — Exam Trainer

```
[Upload trial exam]  (any format, usually PDF)
   │
   ├─ Step 1  PARSE → SPLIT     parse → 1 call → questions[] {num,text,type,marks}
   │
   ├─ Step 2  SIMILAR EXAM      1 call grounded in trial + material → MockExam (gradable via existing practice loop)
   │
   └─ Step 3  EXPLAIN (per Q)   toggle on a trial question → streaming chat:
                                model answer → reasoning → "what you need to know" → keep chatting to develop it
```

- Explain is seeded with the question + the **mind-map importance** ("what you need to know" comes straight from Pipeline A) + retrieved material slices, then becomes an open chat thread (`ExamExplainMessage`).
- The generated mock exam plugs into the **existing** answer→grade loop (`freeLLMComplete`, `{score,verdict,feedback,...}`), so we get grading for free.

---

## 4. The prompts (the core of the quality strategy)

All use `freeLLMComplete(..., { jsonMode:true })` except the Explain stream. All validated with Zod; malformed → one retry then a clean error. `{lang}` = detected material language.

### P1 — Concept map extraction (JSON)
```
SYSTEM:
You are a curriculum analyst. From the COURSE MATERIAL, extract the concept map a
top student would build to master this course. Identify the key concepts, how
important each is (a) for the exam and (b) for genuine understanding, and how they
relate. Ground EVERYTHING only in the provided material — never invent a concept or
a page number. Group concepts into a few teachable clusters and give a sensible
teaching order (prerequisites before dependents).
Return JSON only:
{
  "language": "<the language of the material>",
  "nodes": [{ "id","label","summary",
              "examImportance":1-5,"learningImportance":1-5,
              "cluster","sourceRefs":[{"page"}] }],
  "edges": [{ "from","to","type":"prerequisite|related|contrast|example_of","label" }],
  "clusters": [{ "id","title","theme" }],
  "outline": ["conceptId in teaching order"]
}
USER: <rawText (sliced to model ctx)> + <existing topics & priorities as hints>
```

### P2 — Study-guide section (Markdown, easy language)
```
SYSTEM:
You are a brilliant teacher writing ONE section of a study guide for {course},
in simple, plain {lang} a struggling student can follow. Teach the concept
"{concept.label}" so it finally clicks. Use ONLY the material provided; connect it
to its related concepts: {neighbors}. If something needed is missing from the
material, say so in one line — do not invent.
Write, in this order:
1. Plain-language explanation (short sentences, no jargon without unpacking it).
2. One concrete worked example or analogy.
3. How it connects to {neighbors} — put the puzzle pieces together.
4. "Why it matters for the exam" (1-2 lines, grounded in the rubric if present).
5. "You must be able to…" — 2-3 concrete checks.
Cite pages like (p.N) when you use a fact from the material.
USER: <concept node> + <retrieved source slices for this concept> + <rubric excerpt>
```

### P3 — Similar exam generation (JSON)
```
SYSTEM:
You are an exam setter. Study the TRIAL EXAM's structure: question types, difficulty,
mark distribution, and phrasing style. Produce a NEW practice exam on the SAME course
material that mirrors that style with DIFFERENT questions (do not copy the trial).
Ground every question in the material; match the trial's count and type mix.
Return JSON only:
{ "title", "questions":[{ "q","type":"mcq|short|essay|numeric","marks",
                          "source","expected_answer","key_points":[string] }] }
USER: <parsed trial questions> + <course material (sliced)>
```

### P4 — Explain → chat (streaming, reasoning-first)
```
SYSTEM:
You are an examiner-tutor for {course}. The student is looking at THIS exam question:
"{question}". Using ONLY the course material and sound reasoning, walk them to the answer:
1. The model answer.
2. The step-by-step reasoning an examiner wants to see.
3. "What you need to know to nail this" — the key concepts, flagged by importance.
Cite the material (p.N). Be clear, practical, {lang}. Keep it tight.
The student can keep asking afterwards — help them DEVELOP their understanding, never just
restate. If the material doesn't cover something, say so.
USER (turn 1, auto): Explain this question.   then: open chat thread.
```

---

## 5. Models, language, validation

- **Model selection:** reuse `resolveModelForPlan` + `/api/models` (FREE/PRO tiers). For these features, default to the **largest-context model in the user's tier** (FREE → `gemini-2.5-flash` 1M; PRO → `gemini-3.5-flash` 1M or the user's pick). Expose the existing model picker on the guide/exam screens; default = best-for-tier.
- **Language:** P1 detects `language`; everything downstream is generated in that language, "easy/simple" register. Falls back to `preferredLanguage` then English.
- **Validation:** Zod on every JSON call; strip ```` ```json ```` fences; one retry on malformed; never crash the route; rate-limit generation per user.

## 6. UI

- **Course page:** when READY, a "Create study guide" CTA. While `ANALYZING`, a progress state; at `MAP_READY`, the **mind map graph** appears.
- **Guide page** (`/courses/[id]/guide`): left = mind map (graph: nodes sized by importance, colored by cluster, click → section); right = the reader with READY sections and a "Generate this part" button on PENDING ones.
- **Exam:** upload trial → mock exam in the practice UI; each trial question has an **Explain** toggle that opens the streaming chat panel.
- Mind-map graph: a lightweight dependency-free SVG/force layout (no new heavy dep) — nodes + edges + click; can upgrade later.

## 7. Build order (both, MVP-lean)

1. **Schema + migration** (`StudyGuide`, `StudyGuideSection`, `ExamTrial`, `MockExam`, `ExamExplainMessage`) — apply additively, same as the sharing migration.
2. **Concept map (P1)** — the shared backbone for both features. Endpoint + the graph render. This alone is demoable.
3. **Study guide sections (P2)** — session-1 auto + on-click generation + reader.
4. **Exam: parse/split + similar exam (P3)** — reuse practice grading.
5. **Explain → chat (P4)** — reuse streaming chat shape.
6. **Mind-map graphical polish.**

## 8. Decisions (resolved 2026-05-30)

- **Mock-exam question count = user-selectable.** The user picks how many questions
  the generated exam has (a control on the exam screen); default suggestion = the
  trial's count, but the user overrides it.
- **Mind map = beautiful force-directed graph** (polished, animated layout), not a
  plain node-link sketch.
- **Analysis input = `Course.rawText`** (the already-ingested material) + existing
  topics/priorities — no separate presentation ingest.
