# Feature: Assignment Buddy — Deliverable Tracker + Rubric-Grounded Grading — Implementation Prompt

## Context

This is the `cogni` Next.js app (App Router, TypeScript, Prisma 7 + PostgreSQL, NextAuth v5). Read these facts before touching anything:

- **Working dir**: `cogni/` (paths below are relative to it).
- **Next.js is NOT the one you know** (`AGENTS.md`): read the relevant guide in `node_modules/next/dist/docs/` before writing route handlers/pages. Build: Next 16.2.6, React 19, Turbopack.
- **Read first**: `docs/study-guide-exam-trainer.md` — the design bible for this subsystem and the **quality thesis** this feature must honor (structure before prose, concept/criterion-scoped retrieval, hard grounding + gap-flagging, progressive on-demand generation, tiered models, everything cheap on free models).
- **Prisma 7**: client generated to `src/generated/prisma`; singleton `import { prisma } from "@/lib/prisma"`. Datasource read from `prisma.config.ts` (`dotenv/config` loads `.env`; export `DATABASE_URL` for CLI). **Migrations are additive** — `npx prisma db push` locally; on prod, apply additive SQL **before** deploying code (the deploy script runs no migration; the modified `submissions` GET selecting new columns would 500 otherwise). See `docs/explainers` and the flashcards migration for the exact dance.
- **Auth + ownership**: `import { auth } from "@/auth"`. The canonical triple-check used everywhere in this subsystem: `row.userId === session.user.id && row.courseId === courseId && row.course.userId === session.user.id` → else 404. The work page (`courses/[id]/work/[submissionId]/page.tsx`) re-checks at the page level and `redirect(\`/courses/${courseId}\`)`.
- **Styling**: inline styles referencing CSS tokens (`var(--accent)`, `var(--surface)`, `var(--surface-2)`, `var(--border)`, `var(--border-strong)`, `var(--text)`, `var(--text-dim)`, `var(--text-faint)`, `var(--accent-2)`, `var(--high)`, `var(--med)`, `var(--low)`, `var(--success)`, `var(--bg)`, `var(--accent-soft)`). **No hardcoded hex, no Tailwind classes in JSX.** Both themes (`<html data-theme="light">`) driven by tokens. Helper classes: `.fade-in`, `.skeleton`, `.pulse-glow`, `.fade-up-stagger`, `.feature-tile`, `@keyframes spin`. Use `color-mix(in oklab, var(--x) 14%, transparent)` for theme-correct tints (already used by `FeatureLauncher`).
- **LLM helpers** (`src/lib/freellm.ts`):
  - `freeLLMComplete(messages, { model?, temperature?, jsonMode?, maxTokens? }) → string` — light/interactive calls (grading, viva grade).
  - `freeLLMCompleteFailover(messages, { model, heavy, jsonMode, temperature, maxTokens, timeoutMs, label, validate }) → { text, model }` — **heavy background generation with model failover; use for extraction.** The `validate` callback (e.g. `t => parse(t).deliverables.length > 0`) discards a truncated/bad response and falls over to the next model. This is the only reliable path on the free proxy.
  - `freeLLMStream(messages, { model })` — streaming (reuse for the per-deliverable coach).
  - Model selection: `resolveModelForPlan(isPro, requested?)` (grading), `resolveLargeContextModel(isPro, requested?)` (extraction); `isProUser(userId)` from `@/lib/plan`. **Never hardcode a model string.**
- **JSON salvage** (`src/lib/llm-json.ts`): `stripFences`, `salvageArray(content, key)`, `chunkOnBoundaries(text, maxChars)`, `mapLimit(items, limit, fn)`, `normText`. Reuse for parsing every LLM JSON payload — the free proxy truncates.
- **Extraction template** (`src/lib/ingestion.ts` → `ingestCourse`): the canonical "read `Course.rawText` → `freeLLMCompleteFailover({ heavy, jsonMode, validate })` → `parse(stripFences(text))` → `createMany` → set status" pipeline, triggered by `POST` → `after(async () => …)` → `202`, with the client polling a status field every ~2.5s. **Copy this shape for deliverable extraction.**
- **On-demand generation pattern** (`guide/sections/[sectionId]/route.ts`, `flashcards/generate/route.ts`): auth → ownership 404 → `rateLimit("<feature>:<userId>", …)` → set a status to `GENERATING` → `after(async () => generate(...))` → `202 { ok:true }`. Client **polls** until done. `export const maxDuration = 120` (300 for big ingest).
- **File upload + parse**: `isAllowedUpload`, `saveSubmissionFile`/`saveCourseFile`, `MAX_FILE_BYTES` (`src/lib/uploads.ts`); `parseFile(buffer, mime)` (`src/lib/parse-file.ts`) now extracts **PDF/DOCX/PPTX/XLSX/CSV/TXT** (xlsx/csv just added — rubrics are commonly xlsx). Allowed extensions: `.pdf,.doc,.docx,.ppt,.pptx,.xlsx,.xls,.csv,.txt`.
- **Reminders are IN-APP ONLY.** `src/lib/email.ts` only sends signup verification codes over Gmail SMTP, which is **blocked on prod**. There is no Resend reminder path, no web push, no cron. Deliver reminders via: the `badge:number` prop on a `FeatureLauncher` tile (already wired for flashcards "N due"), an urgency-sorted tracker section, and a cross-course banner on the dashboard. **Do not build email/push.**

### What already exists (reuse — do NOT rebuild)

The **My Work / Submission** subsystem already does "upload work → grade against a rubric → coach → viva." Map (from `src/app/api/courses/[id]/submissions/**` and `src/app/courses/[id]/work/[submissionId]/**`):

- **Models** (`prisma/schema.prisma`): `Submission { kind: SubmissionKind, status: SubmissionStatus, parsedText, questions(Json), reviews[] }` and `SubmissionReview { scoreOutOf10: Float, rubricBreakdown(Json [{criterion,scored,max,comment}]), strengths, gaps, actionItems, summary, modelId }`. Enums: `SubmissionKind = ASSIGNMENT|PROJECT|PORTFOLIO|ESSAY|REPORT|OTHER`; `SubmissionStatus = IN_PROGRESS|READY_FOR_REVIEW|REVIEWED` (**`READY_FOR_REVIEW` is dead — never set by any route**).
- **The grader is inline in `submissions/[submissionId]/review/route.ts`** (no lib). System prompt: *"You are an examiner grading … against the course rubric … If the course material contains no explicit rubric, **infer reasonable criteria** …"*. **It grades against `course.rawText.slice(0, 60_000)` — there is NO structured rubric anywhere in the schema. The criteria are LLM-invented.** Output Zod `{score_out_of_10, rubric_breakdown[{criterion,scored,max,comment}], strengths[], gaps[], action_items[], summary}` → persisted as a `SubmissionReview`, sets `status=REVIEWED`. **This is the single biggest thing Assignment Buddy upgrades.**
- **Coach** (`coach/route.ts`): `freeLLMStream` chat scoped to one submission + rubric (rawText) + latest review gaps. History is client-side only. Reuse per-deliverable.
- **Examiner questions / viva** (`questions/route.ts` + `questions/grade/route.ts`): generate + cache `ExaminerQuestion[]` in `Submission.questions`; grade an answer → `VivaGrade` (**not persisted**). Reuse per-deliverable.
- **UI**: `MyWorkSection.tsx` (list, on `#my-work` anchor in `ReadyView.tsx`), `AddWorkForm.tsx` (title + `kind` select + file/paste), `work/[submissionId]/{page,WorkDetail,ReviewPanel,CoachPanel,VivaPrep}.tsx` (poll-while-parsing, `ScoreRing`, criterion rows, streaming coach, viva cards).
- **FeatureLauncher** (`src/app/courses/[id]/FeatureLauncher.tsx`): `Feature { key,title,desc,color,icon,href?,anchor?,featured?,badge? }`; 6 tiles today; `badge:number` renders a red "N due" pill. Add a 7th tile here.
- **Calendar** (`api/courses/[id]/calendar/route.ts`): purely derived from `Course.examDate` + `Topic[]` (no stored events). There is **no due-date storage** anywhere — `Submission` has no `dueDate`.

---

## Goal

**Assignment Buddy** is a proactive companion that makes a student never miss or under-prepare a graded deliverable. Two pillars:

1. **Detect & track every deliverable** (the "buddy" that reminds): read the course material (module guide, assignment brief, portfolio handbook, rubric file) and extract a structured list of **everything that must be prepared and submitted** — assignment, case study, presentation, reflection, report, portfolio component, exam — each with its **weight, due date, format, requirements, rubric, and grading method**. Track status, surface what's due (in-app), and turn each deliverable's rubric into a prep checklist.
2. **Grade against the ACTUAL rubric + grading method** (upgrade the generic grader): when the student submits work for a deliverable, grade it against **that deliverable's extracted rubric criteria and grading scheme** (percentage / points / bands like Pass·Merit·Distinction / letter / classification), map the result to the scheme's **band**, show **gap-to-next-band**, and **project the overall course grade** ("to reach a Distinction overall you need ≥65 on the Portfolio").

Honors the subsystem rule: **grounded, progressive, on-demand, cheap on free models.** Only **two** new LLM prompts (extraction P1, rubric-grounded grading P2); everything else reuses existing flows or is client-side math.

---

## Part 0 — Recommendations: aspects considered (ship the headline now; the rest build on the same data)

1. **Deliverable auto-detection (headline).** One grounded extraction call over `rawText` → the "everything you need to prepare" list. This is the unlock; every other feature reads this data.
2. **Rubric-grounded grading (headline).** Replace "grade against 60k of rawText with invented criteria" with "grade against THIS deliverable's real criteria + grading method." Real `max` per criterion, real band mapping. The difference between a toy and a tool.
3. **Gap-to-next-band.** Not just a mark — *"You're 4 marks below Distinction on 'Critical analysis'; here is exactly what's missing."* Comes free from grading against the rubric's band descriptors.
4. **Grade projection / what-if simulator.** Given each deliverable's `weight` + best score, compute the weighted current grade and the marks needed on remaining deliverables to hit each band. **Pure client-side math** — no LLM. The single most motivating surface for assessed courses.
5. **Rubric → interactive prep checklist.** Each deliverable's `requirements[]` + rubric criteria become tickable "have you done X?" items the student works through while drafting (client-side toggle, optionally persisted).
6. **In-app deadline reminders.** Urgency-sorted tracker + `badge` on the FeatureLauncher tile ("2 due") + a cross-course "what's due this week" banner on the dashboard. No email/push (blocked).
7. **Type-aware preparation & grading.** A presentation rubric ≠ an essay rubric. The extraction captures `kind` + format; the checklist and grading lens adapt (slides/structure/delivery for a presentation; analysis/recommendation for a case study; evidence/reflection for a portfolio).
8. **Readiness check before submit.** Run the grader on the current *draft* → predicted band + confidence + the top 3 fixes, before the real submission. Reuses P2; no new prompt.
9. **Portfolio evidence → outcome mapping (roadmap).** Map submitted pieces to the required learning outcomes/competencies and flag uncovered ones — the hardest part of portfolio courses.
10. **Draft diffing (roadmap).** v2 review vs v1 review → "you closed 2 of 3 gaps; +1.5 band." `SubmissionReview` already snapshots every run.
11. **Link to study guide + viva per deliverable.** Reuse the existing coach + examiner-questions flows, scoped to a deliverable, and deep-link its rubric concepts into the study guide.

**v1 ships: 1, 2, 3, 4, 5, 6, 7.** 8–11 are the roadmap (Part C), built on the same models.

---

## Part A — Deliverable detection + tracker

### A.1 Data model (Prisma — additive)

```prisma
model CourseDeliverable {
  id            String            @id @default(cuid())
  courseId      String
  course        Course            @relation(fields: [courseId], references: [id], onDelete: Cascade)
  title         String            // "Reflective Portfolio", "Case Study Analysis", "Group Presentation"
  kind          SubmissionKind    @default(ASSIGNMENT)   // reuse + extend the enum (below)
  status        DeliverableStatus @default(NOT_STARTED)
  source        DeliverableSource @default(EXTRACTED)
  weight        Float?            // % of final grade (0–100), null if not stated
  dueDate       DateTime?         // null if not stated
  format        String?           // "2500-word report", "15-min group presentation + slides"
  unit          String?           // "words" | "minutes" | "pages" | null
  unitLimit     Int?              // e.g. 2500
  description   String?           @db.Text   // plain-language: what it requires
  requirements  Json?             // string[] — concrete must-dos (checklist seeds)
  rubric        Json?             // [{ criterion, max, weight?, levels?: [{ band, descriptor, points? }] }]
  gradingScheme Json?             // { kind: "percentage"|"points"|"bands"|"letter", bands?: [{ name, min }], passMark?, totalPoints? }
  sourceRef     Json?             // [{ page }] — where in the material this came from
  confidence    Float?            // 0–1 extraction confidence (low → "please confirm")
  order         Int               @default(0)
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  submissions   Submission[]      // work submitted toward this deliverable

  @@index([courseId])
  @@index([courseId, dueDate])    // the "what's due" query
}

enum DeliverableStatus { NOT_STARTED IN_PROGRESS SUBMITTED GRADED }
enum DeliverableSource { EXTRACTED MANUAL }

// Extend the existing enum additively (DB: ALTER TYPE … ADD VALUE):
enum SubmissionKind { ASSIGNMENT PROJECT PORTFOLIO ESSAY REPORT CASE_STUDY PRESENTATION REFLECTION OTHER }
```

Modify:
- `Submission`: add `deliverableId String?` + `deliverable CourseDeliverable? @relation(...)` + `@@index([deliverableId])`. A submission optionally fulfills a deliverable; a deliverable's status is derived from its submissions (latest review).
- `Course`: add `deliverables CourseDeliverable[]` and `deliverablesStatus SectionStatus @default(PENDING)` (reuse the `SectionStatus` enum: `PENDING|GENERATING|READY|FAILED`) + `deliverablesError String? @db.Text` — drives the extraction poll, mirroring `StudyGuide.briefingStatus`.

Rationale for Json (not sub-tables) on `rubric`/`gradingScheme`/`requirements`: mirrors how `Submission.questions`, `StudyGuideSection.quiz`, `StudyGuide.mindMap` cache structured Json — cheap, one round-trip, validated with Zod on read. A structured `Rubric`/`RubricCriterion` table is a future refactor if users start editing criteria heavily.

### A.2 Extraction — `src/lib/deliverables.ts` → `extractDeliverables(courseId, model)`

Follow `ingestCourse` exactly. Route `POST /api/courses/[id]/deliverables/extract`: auth → course ownership → rate-limit (`deliverables:${userId}`, 10/hr) → `userHasJobCapacity` → set `course.deliverablesStatus = "GENERATING"` → `after(() => extractDeliverables(courseId, model))` → `202`. `export const maxDuration = 300`. Client polls the deliverables GET while `GENERATING`.

`extractDeliverables`:
1. Load `course.rawText`, `name`, `educationLevel`. If empty → mark `FAILED` ("add course materials first").
2. `chunkOnBoundaries(rawText, ~40_000)` if huge; otherwise one slice. Module guides/briefs are usually < 40k → one call.
3. **One** `freeLLMCompleteFailover({ model, heavy:true, jsonMode:true, timeoutMs:240_000, label:"deliverables", validate: t => DeliverablesSchema.safeParse(JSON.parse(stripFences(t))).success })`.
4. `stripFences` → parse → Zod `DeliverablesSchema`; on strict-parse fail, `salvageArray(cleaned, "deliverables")`.
5. **Idempotent**: replace `source:"EXTRACTED"` rows for the course in a `$transaction` (keep `MANUAL` rows). `createMany`. Set `deliverablesStatus="READY"`. On any error → `FAILED` (never throw — `after()` callback must not reject).

**Prompt P1 — deliverable + rubric extraction:**
```
SYSTEM:
You are an assessment analyst for {course} ({educationLevel}). From the COURSE MATERIAL
(module guide, assignment brief, portfolio handbook, marking rubric), extract EVERY
assessed deliverable the student must prepare and submit — assignments, case studies,
presentations, reflections, reports, portfolio components, exams. Ground EVERYTHING only
in the material; never invent a deliverable, a weight, or a date. If a detail is not
stated, use null — do NOT guess.
For EACH deliverable give:
  • title
  • kind: assignment|case_study|presentation|essay|report|portfolio|reflection|exam|other
  • weight: % of the final grade (number, or null)
  • due_date: ISO date (or null)
  • format: e.g. "2500-word report", "15-min group presentation + slides" (or null)
  • unit / unit_limit: "words"|"minutes"|"pages" + the number (or null)
  • description: one short plain-language paragraph of what it requires
  • requirements: the concrete must-dos a student must satisfy (string[])
  • rubric: the marking criteria that apply — for each: { criterion, max, weight (or null),
    levels: [{ band, descriptor }] when band descriptors are given (e.g. Pass/Merit/Distinction) }
  • page: the page where this is described (number or null)
Also return a course-level "grading_overview":
  { kind: "percentage"|"points"|"bands"|"letter", bands: [{ name, min }] (e.g. Distinction ≥70),
    pass_mark, notes }  — only what the material states; null fields otherwise.
If the material clearly contains NO assessment information, return { "deliverables": [], "grading_overview": null }.
Return JSON only:
{ "deliverables": [ { ... } ], "grading_overview": { ... } }
USER: <course name + educationLevel> + <rawText slice>
```

Set per-deliverable `confidence` from how complete the extracted fields are (e.g. has weight+rubric → high; title only → low) so the UI can prompt "please confirm". When the material has no rubric, leave `rubric: []` and flag low confidence — the student can **upload a rubric file (xlsx/PDF — now supported)** which re-runs extraction scoped to that file and attaches the criteria.

### A.3 Tracker API — `src/app/api/courses/[id]/deliverables/route.ts` (+ `[deliverableId]`)

- `GET` → `{ deliverables: DeliverableWithProgress[], status, counts }` where each deliverable carries its derived `bestScore`/`band` (from its submissions' latest reviews), `submissionCount`, and `daysUntilDue`. `counts = { total, dueSoon, overdue, graded }` for the badge. Also returns `deliverablesStatus` for the poll.
- `PATCH /[deliverableId]` → owner-checked edits: `status`, `dueDate`, `weight`, `title`, link/unlink a `submissionId`. (Lets students fix an extraction or add their own deliverable.)
- `POST /[deliverableId]` is unnecessary; `POST /api/courses/[id]/deliverables` (no id) = **manual add** (`source:"MANUAL"`). All owner-checked + rate-limited.

Derived status rule (compute, don't store-as-source-of-truth): `GRADED` if a linked submission has a review; else `SUBMITTED` if a linked submission exists; else the stored `NOT_STARTED|IN_PROGRESS` (user-set).

### A.4 UI

- **FeatureLauncher tile** (`FeatureLauncher.tsx`): add `{ key:"assignments", title:"Assignment buddy", desc:"Track + nail every deliverable", color:"var(--med)", icon:<IconClipboard/>, anchor:"assignment-buddy", badge: dueCount }`. Fetch the deliverable `counts` the same way the tile fetches flashcard `due`. `badge = overdue + dueSoon`.
- **Tracker section** `src/app/courses/[id]/AssignmentBuddy.tsx`, mounted in `ReadyView.tsx` inside `<div id="assignment-buddy" style={{ scrollMarginTop: 80 }}>` after `#my-work`. States mirror the guide: no deliverables → a "Find what I need to prepare" CTA (`POST /extract`); `GENERATING` → skeleton + "Reading your brief…"; `READY` → the list.
  - Each deliverable = a card: `kind` chip + title, a **due pill** colored by urgency (`var(--high)` overdue / `var(--med)` ≤7d / `var(--text-dim)` else), `weight` ("20% of grade"), a status pill, the best **band/score** if graded, and a progress ring of checklist completion. Sort by urgency (overdue → soonest due → unweighted last).
  - Expand → the **prep checklist** (`requirements[]` + rubric criteria as tickable items), the rubric criteria with `max`, a **"Prepare / Grade this"** button that creates/links a `Submission` (reuse `AddWorkForm`, pre-filled `kind` + `deliverableId`) and routes to the work detail page, and links to "Quiz me" (viva) + relevant study-guide concepts.
  - A **grade-projection strip** at the top: a horizontal bar of all weighted deliverables, current weighted total, and "On track for: {band}" + "To reach {nextBand}: average ≥{x} on the {n} remaining." Pure client math from weights + best scores (see B.3).
- **Dashboard banner** (`src/app/dashboard/CoursesClient.tsx`): a slim "Due this week" strip aggregating deliverables with `dueDate` across the user's courses (new `GET /api/deliverables/upcoming` or fold into `GET /api/courses`). One line per item → links to its course tracker. Hidden when empty.

---

## Part B — Rubric-grounded grading + grade projection

### B.1 Grading upgrade — `src/lib/grade-submission.ts` (extract the inline grader, then enrich)

Today the grader lives inline in `submissions/[submissionId]/review/route.ts` and grades against `course.rawText`. **Extract it to `src/lib/grade-submission.ts` and upgrade it to grade against a deliverable's structured rubric when one is linked.**

`gradeSubmission(submission, { deliverable?, courseName, rawText, model }) → ReviewResult`:
- If `submission.deliverableId` resolves to a deliverable **with a non-empty rubric**: ground the grade in that rubric's criteria (real `criterion` + `max` + band descriptors) and `gradingScheme`. Use **P2** (below). The `<rubric>` block is the structured rubric JSON, NOT 60k of rawText — far smaller, far more accurate.
- Else (no linked deliverable or no rubric): fall back to the **current** behavior verbatim (grade against `rawText`, invent criteria) — so existing My Work keeps working unchanged.
- Persist a `SubmissionReview`. **Additively widen the review** (see B.2) with `percentage` and `band`.

The review route becomes a thin caller of `gradeSubmission` (same auth, rate-limit, response). The existing `ReviewSchema` is preserved; new fields are optional.

**Prompt P2 — rubric-grounded grading:**
```
SYSTEM:
You are an examiner grading a student's {kind} for {course} against the OFFICIAL RUBRIC below.
Grade ONLY against the given criteria — do not invent criteria. For EACH criterion, award a
mark out of its real `max`, name the band it falls in (from the band descriptors when given),
and explain in one line why — quoting the rubric language. Then:
  • overall: total marks and a percentage,
  • band: map the percentage to the grading scheme ({scheme}); name the achieved band,
  • gap_to_next_band: the single criterion that, if improved, moves the work up a band, and
    the EXACT change needed (concrete, from the band descriptor),
  • strengths, gaps (what blocks full marks), action_items (ordered, concrete).
Ground every judgement in the student's actual work; cite where. Be specific, not generic.
Return JSON only:
{ "criteria": [{ "criterion", "scored", "max", "band", "comment" }],
  "total": { "scored", "max", "percentage" },
  "band": "...", "next_band": "...", "gap_to_next_band": "...",
  "strengths": [..], "gaps": [..], "action_items": [..], "summary": "..." }
USER: <rubric JSON> + <gradingScheme JSON> + <student work, parsedText sliced>
```
Map P2's output back onto `SubmissionReview`: `rubricBreakdown = criteria` (already `{criterion,scored,max,comment}` + `band`), `scoreOutOf10 = round(percentage/10, 1)` (keep for back-compat + the existing `ScoreRing`), new `percentage` + `band` + `gapToNextBand` columns, `strengths/gaps/actionItems/summary` as today.

### B.2 Review model widening (additive)

`SubmissionReview`: add `percentage Float?`, `band String?`, `nextBand String?`, `gapToNextBand String? @db.Text`. Keep `scoreOutOf10` (the existing `ScoreRing` + history chips read it; populate it as `percentage/10`). Client `SubmissionReview` type gains the optional fields; `RubricCriterion` gains optional `band?: string`.

### B.3 Grade projection (client-side, no LLM) — `src/lib/grade-projection.ts`

Pure function, unit-tested:
```ts
projectGrade(deliverables: { weight: number|null; bestPercentage: number|null }[],
             scheme: GradingScheme) → {
  weightedSoFar: number;      // Σ(weight·best)/Σ(weight of graded), as % of total
  weightAccountedFor: number; // Σ weight graded
  currentBand: string;        // band of weightedSoFar
  toNextBand: { band: string; requiredAvgOnRemaining: number } | null; // marks needed on ungraded weight
}
```
Drives the projection strip + each deliverable card's "needed mark". Handles missing weights (exclude from projection, show "weight not stated").

### B.4 UI

- **Work detail** (`work/[submissionId]/WorkDetail.tsx` + `ReviewPanel.tsx`): when the review has a `band`, render the **band** prominently (e.g. "Merit · 64%") next to the `ScoreRing`, a **gap-to-next-band** callout (`var(--med)` "→ Distinction needs: …"), and per-criterion rows already show `scored/max` (now real). The deliverable's rubric criteria render as the prep checklist above the upload (reuse from A.4).
- **Projection** lives in the tracker (A.4), reading every deliverable's latest review.

### B.5 Gating

- Grading **upgrades automatically** whenever a submission is linked to a deliverable that has a rubric — no toggle. Unlinked submissions keep the current generic grading. So the existing My Work UX is untouched; Assignment Buddy makes it rubric-accurate.

---

## Part C — Roadmap (build on the same data; do NOT build in v1)

Readiness check (run P2 on a draft → predicted band + top-3 fixes); draft diffing (compare two `SubmissionReview` snapshots); portfolio evidence→learning-outcome mapping (extract outcomes in P1, map submissions, flag gaps); a manual rubric editor; iCal export of due dates. Each is a thin addition over the v1 models.

---

## Decisions (aspects considered)

| Aspect | Decision (v1) | Why |
|---|---|---|
| **New model vs reuse** | New `CourseDeliverable`; **reuse** `Submission`+`SubmissionReview` for the work itself (add `deliverableId`) | A deliverable (the requirement) ≠ a submission (the artifact). One deliverable can have many draft submissions. |
| **Rubric storage** | Json on `CourseDeliverable` (`rubric`, `gradingScheme`, `requirements`) | Mirrors `Submission.questions` / `StudyGuideSection.quiz`; Zod-validated on read; a sub-table is a later refactor. |
| **Extraction** | One grounded `freeLLMCompleteFailover` over `rawText`, `after()`+poll, idempotent replace of `EXTRACTED` rows | Same battle-tested template as `ingestCourse`; cheap; survives the flaky proxy via failover+`validate`. |
| **Grading** | Extract the inline grader to `grade-submission.ts`; grade against the linked rubric when present, else current behavior | DRY + backward-compatible; rubric-grounding is the whole point but must not break existing My Work. |
| **Score model** | Keep `scoreOutOf10`; add optional `percentage`/`band`/`gapToNextBand` | Back-compat with `ScoreRing`/history; bands are what assessed courses actually use. |
| **Projection** | Pure client-side math in `grade-projection.ts` (unit-tested) | No LLM cost, instant, deterministic; the most motivating surface. |
| **Reminders** | In-app only: tile `badge`, urgency-sorted tracker, dashboard "due this week" banner | Email is blocked; no push/cron exists. |
| **Reused flows** | Per-deliverable coach + examiner-questions = existing `coach`/`questions` routes scoped via `deliverableId` | Zero new LLM surfaces for prep help. |
| **Cost** | 2 new LLM prompts total (P1 extraction, P2 grading); everything else reuses or is client math | The user's explicit concern: don't spend calls; free proxy is slow. |

---

## Files

Create:
```
src/lib/deliverables.ts                                   ← extractDeliverables() (mirrors ingestCourse)
src/lib/grade-submission.ts                               ← gradeSubmission() (extracted from review route + rubric-grounded P2)
src/lib/grade-projection.ts                               ← projectGrade() (pure, unit-tested)
src/app/api/courses/[id]/deliverables/route.ts            ← GET list/counts/status, POST manual add
src/app/api/courses/[id]/deliverables/extract/route.ts    ← POST extract (after()+202)
src/app/api/courses/[id]/deliverables/[deliverableId]/route.ts ← PATCH edit/link, DELETE
src/app/api/deliverables/upcoming/route.ts                ← GET cross-course "due this week" (dashboard banner)
src/app/courses/[id]/AssignmentBuddy.tsx                  ← tracker section (list, due pills, projection strip, checklist)
src/app/courses/[id]/DeliverableCard.tsx                  ← one deliverable card (expand → checklist + prepare/grade)
```
Modify:
```
prisma/schema.prisma                       ← CourseDeliverable + enums; Submission.deliverableId; Course.deliverables + deliverablesStatus/Error; widen SubmissionKind; widen SubmissionReview (percentage/band/nextBand/gapToNextBand)
src/app/api/courses/[id]/submissions/[submissionId]/review/route.ts ← call grade-submission.ts (no behavior change when unlinked)
src/app/api/courses/[id]/submissions/route.ts             ← accept optional deliverableId on create; derive a deliverable's status from its submissions
src/app/courses/[id]/types.ts                             ← CourseDeliverable, DeliverableStatus, GradingScheme, RubricCriterion(+band), SubmissionReview(+percentage/band), DeliverableWithProgress
src/app/courses/[id]/FeatureLauncher.tsx                  ← "Assignment buddy" tile + due badge (fetch counts)
src/app/courses/[id]/ReadyView.tsx                        ← <div id="assignment-buddy"><AssignmentBuddy/></div> after #my-work
src/app/courses/[id]/AddWorkForm.tsx                      ← optional deliverableId + extended kinds (CASE_STUDY/PRESENTATION/REFLECTION)
src/app/courses/[id]/work/[submissionId]/{WorkDetail,ReviewPanel}.tsx ← show band + gap-to-next-band; render deliverable rubric checklist
src/app/dashboard/CoursesClient.tsx                       ← "Due this week" banner
```

## Constraints

- **Read `node_modules/next/dist/docs/` before route/page edits** (AGENTS.md). Match handler signatures: `export async function POST(req: NextRequest, { params }: { params: Promise<{…}> })`, `await params`, `export const maxDuration`. Server pages may read `searchParams` (a Promise) — don't `setState` in an effect (React-19 lint blocks it; pass as a server prop, as the flashcards deep-link does).
- **TypeScript strict, no `any`.** Validate every LLM payload with **Zod**; `stripFences` + `salvageArray` for truncation; one clean error on failure, never crash the route; `after()` callbacks never throw.
- **Immutability**; inline styles + tokens only; both themes; compositor-friendly motion + honor `prefers-reduced-motion`.
- **Reuse over rebuild**: `ingestCourse` pattern, `freeLLMCompleteFailover`+`validate`, `Submission`/`SubmissionReview`, `coach`/`questions` flows, `AddWorkForm`, `FeatureLauncher` tile+badge, `parseFile` (incl. xlsx), `resolveModelForPlan`/`resolveLargeContextModel`, the triple ownership check. **Extract** the inline review grader rather than copy it.
- **No new dependencies.** Projection + checklist are hand-rolled. Reminders in-app only.
- **Cost discipline**: extraction + grading are the only LLM calls and are on-demand + rate-limited per user; no auto-extraction on course create (offer a CTA). Idempotent extraction (don't re-bill on every visit).
- **Files < 400 lines, functions < 50 lines.**

## Migrations & build order

1. **Schema + additive migration** — `CourseDeliverable`, `DeliverableStatus`, `DeliverableSource`; `Submission.deliverableId`; `Course.deliverables`/`deliverablesStatus`/`deliverablesError`; widen `SubmissionKind` (`ALTER TYPE … ADD VALUE 'CASE_STUDY' / 'PRESENTATION' / 'REFLECTION'`); widen `SubmissionReview` (`percentage`,`band`,`nextBand`,`gapToNextBand`). Apply additively: `prisma db push` locally; **on prod, run the additive SQL BEFORE deploying** (the deploy script runs no migration; the modified submissions/deliverables routes select new columns). Note: `ADD VALUE` to an enum can't run inside a transaction with other DDL in some setups — run enum `ADD VALUE` first, separately.
2. **`grade-submission.ts` extraction** (refactor the review route to call it; verify My Work grading is unchanged when unlinked) + **`grade-projection.ts`** (with a tiny unit check of the band math).
3. **Part A** — `deliverables.ts` (P1) + extract/list/patch routes + `AssignmentBuddy.tsx`/`DeliverableCard.tsx` + FeatureLauncher tile + ReadyView section + poll. Demoable: open a course → "Find what I need to prepare" → tracker of deliverables with weights/dates/rubrics.
4. **Part B** — wire `deliverableId` into submission create + `AddWorkForm`; rubric-grounded P2 in `grade-submission.ts`; band + gap-to-next-band in `ReviewPanel`/`WorkDetail`; projection strip. Demoable: prepare a deliverable → upload draft → graded against the real rubric with a band + "to reach Distinction…".
5. **Dashboard banner** + cross-course `upcoming` route.
6. `npm run build` (tsc) + lint clean; verify on a real course (e.g. the GEP portfolio course — module guide + the 3 .xlsx rubrics): extract deliverables, confirm the Portfolio/Case-study/Presentation appear with weights + rubric, grade a draft against the rubric, see the band + projection.

## Research notes (why these choices)

- The assessment-tracking pattern that works: **extract the spec once, track against it, grade against the real rubric** — not a generic "give feedback" call. Students fail assessed courses by misunderstanding requirements and weighting, not by writing badly; surfacing weight + due + band + "what moves you up a band" is where the value is.
- **Bands over raw marks**: UK/EU portfolio courses (the GEP case) grade in classifications/bands (Pass·Merit·Distinction, 2:1, etc.). A "7.4/10" is meaningless to that student; "Merit, 4 marks below Distinction on Critical Analysis" is actionable. The grading scheme must be a first-class extracted object.
- **Grounding the grade in a small structured rubric** (not 60k of rawText) both improves accuracy and slashes tokens — directly addressing the free-proxy reliability problem that has been failing large calls. Extraction + grading become small, cheap, reliable calls.
