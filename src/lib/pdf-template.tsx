/**
 * @react-pdf/renderer template for the full study plan export.
 * Intentionally styled to be readable as a printed document.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a2e",
  },
  // Cover section
  coverTitle: { fontSize: 24, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  coverCode: { fontSize: 12, color: "#666", marginBottom: 4 },
  coverSub: { fontSize: 10, color: "#888", marginBottom: 32 },

  // Section heading
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
    marginTop: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    paddingBottom: 4,
  },

  // Topic card
  topicCard: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: "#f8f9ff",
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: "#7c5cff",
  },
  topicCardHigh: { borderLeftColor: "#ff6b6b" },
  topicCardMed:  { borderLeftColor: "#fbbf24" },
  topicCardLow:  { borderLeftColor: "#60a5fa" },

  topicHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 8 },
  topicNum: { fontSize: 9, color: "#888", fontFamily: "Courier" },
  topicTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", flex: 1 },
  priorityBadge: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  badgeHigh: { backgroundColor: "#fff0f0", color: "#ff6b6b" },
  badgeMed:  { backgroundColor: "#fffbeb", color: "#d97706" },
  badgeLow:  { backgroundColor: "#eff6ff", color: "#2563eb" },

  topicWhy: { fontSize: 9, color: "#555", marginBottom: 6, lineHeight: 1.5 },
  topicTime: { fontSize: 9, color: "#888" },

  // Subtopics
  subtopicList: { marginTop: 6, marginLeft: 10 },
  subtopicRow: { flexDirection: "row", gap: 6, marginBottom: 2 },
  subtopicBullet: { fontSize: 9, color: "#999" },
  subtopicText: { fontSize: 9, color: "#444", flex: 1, lineHeight: 1.4 },
  subtopicTime: { fontSize: 8, color: "#aaa", fontFamily: "Courier" },

  // Practice questions
  pqCard: { backgroundColor: "#f0f8ff", padding: 8, borderRadius: 3, marginBottom: 6 },
  pqLabel: { fontSize: 7, color: "#888", fontFamily: "Courier", marginBottom: 3 },
  pqText: { fontSize: 9, color: "#333", lineHeight: 1.5 },
  pqSource: { fontSize: 8, color: "#5eaad4", fontFamily: "Courier", marginTop: 3 },

  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#bbb",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 6,
  },
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface Subtopic { text: string; time_minutes: number }
interface PracticeQuestion { q: string; source: string }

export interface PdfTopic {
  num: string;
  title: string;
  priority: "HIGH" | "MED" | "LOW";
  priorityLabel: string;
  why: string;
  timeMinutes: number;
  pages: string | null;
  subtopics: Subtopic[];
  practiceQuestions: PracticeQuestion[];
}

export interface PdfProps {
  courseName: string;
  courseCode: string | null;
  examDate: string | null;
  totalPrepTimeMinutes: number;
  topics: PdfTopic[];
}

// ── Document ──────────────────────────────────────────────────────────────────

export function StudyPlanDocument({
  courseName,
  courseCode,
  examDate,
  totalPrepTimeMinutes,
  topics,
}: PdfProps) {
  const hours = Math.floor(totalPrepTimeMinutes / 60);
  const mins = totalPrepTimeMinutes % 60;
  const prepStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  const generated = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <Document
      title={`Cogni Study Plan — ${courseName}`}
      author="Cogni"
      creator="Cogni exam-prep"
    >
      <Page size="A4" style={S.page}>
        {/* Cover */}
        <Text style={S.coverTitle}>{courseName}</Text>
        {courseCode && <Text style={S.coverCode}>{courseCode}</Text>}
        <Text style={S.coverSub}>
          Cogni study plan · {topics.length} topics · {prepStr} total prep
          {examDate
            ? ` · Exam ${new Date(examDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
            : ""}
        </Text>

        {/* Topics */}
        <Text style={S.sectionTitle}>Study plan — ranked by exam impact</Text>

        {topics.map((t) => {
          const cardStyle =
            t.priority === "HIGH"
              ? [S.topicCard, S.topicCardHigh]
              : t.priority === "MED"
              ? [S.topicCard, S.topicCardMed]
              : [S.topicCard, S.topicCardLow];

          const badgeStyle =
            t.priority === "HIGH"
              ? [S.priorityBadge, S.badgeHigh]
              : t.priority === "MED"
              ? [S.priorityBadge, S.badgeMed]
              : [S.priorityBadge, S.badgeLow];

          return (
            <View key={t.num} style={cardStyle} wrap={false}>
              <View style={S.topicHeader}>
                <Text style={S.topicNum}>{t.num}</Text>
                <Text style={S.topicTitle}>{t.title}</Text>
                <Text style={badgeStyle}>{t.priorityLabel}</Text>
              </View>

              <Text style={S.topicWhy}>{t.why}</Text>
              <Text style={S.topicTime}>
                Est. {t.timeMinutes}min{t.pages ? ` · pp. ${t.pages}` : ""}
              </Text>

              {/* Subtopics */}
              {t.subtopics.length > 0 && (
                <View style={S.subtopicList}>
                  {t.subtopics.map((st, i) => (
                    <View key={i} style={S.subtopicRow}>
                      <Text style={S.subtopicBullet}>•</Text>
                      <Text style={S.subtopicText}>{st.text}</Text>
                      <Text style={S.subtopicTime}>{st.time_minutes}m</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Practice questions */}
              {t.practiceQuestions.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  {t.practiceQuestions.map((pq, i) => (
                    <View key={i} style={S.pqCard}>
                      <Text style={S.pqLabel}>Q{i + 1}</Text>
                      <Text style={S.pqText}>{pq.q}</Text>
                      <Text style={S.pqSource}>{pq.source}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text>Cogni — personalized exam prep</Text>
          <Text>Generated {generated}</Text>
        </View>
      </Page>
    </Document>
  );
}
