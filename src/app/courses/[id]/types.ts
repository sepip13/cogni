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

export interface GuideSection {
  id: string;
  order: number;
  conceptKey: string;
  title: string;
  status: GuideSectionStatus;
  contentMd: string | null;
}

export interface StudyGuideData {
  id: string;
  status: GuideStatus;
  language: string | null;
  mindMap: MindMap | null;
  outline: string[] | null;
  error: string | null;
  updatedAt: string;
  sections: GuideSection[];
}

// ── Exam trainer ──────────────────────────────────────────────────────────

export type TrialStatus = "PARSING" | "READY" | "FAILED";
export type MockStatus = "GENERATING" | "READY" | "FAILED";

export interface TrialQuestion {
  num?: string;
  text: string;
  type?: string;
  marks?: number | null;
}

export interface MockExamQuestion {
  q: string;
  type?: string;
  marks?: number | null;
  source?: string;
  expected_answer?: string;
  key_points?: string[];
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
