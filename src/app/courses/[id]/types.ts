export interface TopicRow {
  id: string;
  num: string;
  title: string;
  priority: "HIGH" | "MED" | "LOW";
  priorityLabel: string;
  why: string;
  timeMinutes: number;
  pages: string | null;
  studied: boolean;
  order: number;
}

export interface CourseData {
  id: string;
  name: string;
  code: string | null;
  examDate: string | null;
  status: "PROCESSING" | "READY" | "FAILED";
  totalPrepTimeMinutes: number | null;
  topics: TopicRow[];
  files?: { fileName: string }[];
}

// ── Student work ("My Work") ──────────────────────────────────────────────

export type SubmissionKind =
  | "ASSIGNMENT"
  | "PROJECT"
  | "PORTFOLIO"
  | "ESSAY"
  | "REPORT"
  | "OTHER";

export type SubmissionStatus = "IN_PROGRESS" | "READY_FOR_REVIEW" | "REVIEWED";

export interface SubmissionListItem {
  id: string;
  title: string;
  kind: SubmissionKind;
  status: SubmissionStatus;
  fileName: string | null;
  latestScore: number | null;
  updatedAt: string;
}

export interface SubmissionDetail {
  id: string;
  title: string;
  kind: SubmissionKind;
  status: SubmissionStatus;
  fileName: string | null;
  fileType: string | null;
  blobUrl: string | null;
  pageCount: number | null;
  hasText: boolean;
  textPreview: string;
  textTruncated: boolean;
  hasQuestions: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RubricCriterion {
  criterion: string;
  scored: number;
  max: number;
  comment: string;
}

export interface SubmissionReview {
  id: string;
  scoreOutOf10: number;
  rubricBreakdown: RubricCriterion[];
  strengths: string[];
  gaps: string[];
  actionItems: string[];
  summary: string;
  modelId: string;
  createdAt: string;
}

// ── Personalized examiner questions ───────────────────────────────────────

export interface ExaminerQuestion {
  q: string;
  why_asked: string;
  key_points: string[];
  difficulty: "easy" | "medium" | "hard";
}

export interface VivaGrade {
  score: number;
  verdict: "correct" | "partially_correct" | "incorrect";
  feedback: string;
  missing_points: string[];
  strengths: string[];
}

// ── Sharing ───────────────────────────────────────────────────────────────

// ── Study guide / mind map ────────────────────────────────────────────────

export interface MindMapNode {
  id: string;
  label: string;
  summary: string;
  examImportance: number;
  learningImportance: number;
  cluster: string;
  sourceRefs?: { page?: string | number }[];
}

export interface MindMapEdge {
  from: string;
  to: string;
  type: "prerequisite" | "related" | "contrast" | "example_of";
  label?: string;
}

export interface MindMapCluster {
  id: string;
  title: string;
  theme?: string;
}

export interface MindMap {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  clusters: MindMapCluster[];
}

export type GuideStatus = "ANALYZING" | "MAP_READY" | "GENERATING" | "READY" | "FAILED";
export type GuideSectionStatus = "PENDING" | "GENERATING" | "READY" | "FAILED";

// ── "Start here" game plan ────────────────────────────────────────────────
export interface BriefingMissing {
  material: string;
  why: string;
}

export interface Briefing {
  bottom_line: string;
  assessment: { format: string; when: string; grading_basis: string };
  what_it_takes: string;
  parts: { total: number; must_study: number; explanation: string };
  path: { start: string; finish: string; why_this_order: string };
  how_to_study: string;
  sufficiency: { sufficient: boolean; missing: BriefingMissing[] };
}

// One cached, gradable question for the on-demand per-section quiz (same shape
// as a mock-exam question — it plugs into the same grade loop).
export interface SectionQuizQuestion {
  q: string;
  type?: string;
  marks?: number | null;
  source?: string;
  expected_answer?: string;
  key_points?: string[];
  options?: string[]; // multiple-choice answer choices (1 correct)
  answer?: string; // exact text of the correct option
}

export interface GuideSection {
  id: string;
  order: number;
  conceptKey: string;
  title: string;
  status: GuideSectionStatus;
  contentMd: string | null;
  quizStatus: GuideSectionStatus;
  quiz: SectionQuizQuestion[] | null;
}

export interface StudyGuideData {
  id: string;
  status: GuideStatus;
  language: string | null;
  mindMap: MindMap | null;
  outline: string[] | null;
  briefing: Briefing | null;
  briefingStatus: GuideSectionStatus;
  briefingError: string | null;
  error: string | null;
  updatedAt: string;
  sections: GuideSection[];
}

// ── Flashcards (active recall from the concept map) ───────────────────────

export type FlashcardKind = "QA" | "CLOZE";
export type FlashcardRating = "again" | "hard" | "good" | "easy";

export interface Flashcard {
  id: string;
  conceptKey: string | null;
  front: string;
  back: string;
  kind: FlashcardKind;
  sourceRef: { page?: string | number }[] | null;
  dueAt: string;
}

export interface FlashcardConceptCount {
  total: number;
  due: number;
  lapses: number;
}

export interface FlashcardCounts {
  total: number;
  due: number;
  perConcept: Record<string, FlashcardConceptCount>;
}

// ── Exam trainer ──────────────────────────────────────────────────────────

export type TrialStatus = "PARSING" | "READY" | "FAILED";
export type MockStatus = "GENERATING" | "READY" | "FAILED";

export interface TrialQuestion {
  num?: string;
  text: string;
  type?: string;
  marks?: number | null;
  options?: string[]; // answer choices, when the parsed question is multiple-choice
}

export interface MockExamQuestion {
  q: string;
  type?: string;
  marks?: number | null;
  source?: string;
  expected_answer?: string;
  key_points?: string[];
  options?: string[]; // multiple-choice answer choices (1 correct)
  answer?: string; // exact text of the correct option
}

export interface MockExamSummary {
  id: string;
  title: string;
  status: MockStatus;
  questions: MockExamQuestion[] | null;
  error: string | null;
  createdAt: string;
}

export interface ExamTrialData {
  id: string;
  title: string;
  status: TrialStatus;
  fileName: string | null;
  questions: TrialQuestion[] | null;
  error: string | null;
  createdAt: string;
  mockExams: MockExamSummary[];
}

export interface ExamGrade {
  score: number;
  verdict: "correct" | "partially_correct" | "incorrect";
  feedback: string;
  missing_points: string[];
  strengths: string[];
}

export type SharePermission = "VIEW" | "COMMENT";

export interface ShareLink {
  token: string;
  url: string;
  permission: SharePermission;
  publicNoAuth: boolean;
  includeSources: boolean;
  expiresAt: string | null;
  viewCount: number;
  createdAt: string;
}
