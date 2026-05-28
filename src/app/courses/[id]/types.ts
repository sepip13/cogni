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
