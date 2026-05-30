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
