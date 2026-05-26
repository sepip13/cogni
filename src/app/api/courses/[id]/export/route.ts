import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { StudyPlanDocument, type PdfTopic } from "@/lib/pdf-template";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id: courseId } = await params;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      userId: true,
      name: true,
      code: true,
      examDate: true,
      totalPrepTimeMinutes: true,
      topics: {
        select: {
          num: true,
          title: true,
          priority: true,
          priorityLabel: true,
          why: true,
          timeMinutes: true,
          pages: true,
          subtopics: true,
          practiceQuestions: true,
          order: true,
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!course || course.userId !== session.user.id) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (course.topics.length === 0) {
    return new Response(JSON.stringify({ error: "No topics — ingestion not complete" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  const topics: PdfTopic[] = course.topics.map((t) => ({
    num: t.num,
    title: t.title,
    priority: t.priority as "HIGH" | "MED" | "LOW",
    priorityLabel: t.priorityLabel ?? t.priority,
    why: t.why,
    timeMinutes: t.timeMinutes,
    pages: t.pages,
    subtopics: (t.subtopics as Array<{ text: string; time_minutes: number }>) ?? [],
    practiceQuestions: (t.practiceQuestions as Array<{ q: string; source: string }>) ?? [],
  }));

  const doc = createElement(StudyPlanDocument, {
    courseName: course.name,
    courseCode: course.code ?? null,
    examDate: course.examDate ? course.examDate.toISOString().split("T")[0] : null,
    totalPrepTimeMinutes: course.totalPrepTimeMinutes ?? 0,
    topics,
  }) as ReactElement<DocumentProps>;

  const buffer = await renderToBuffer(doc);

  const safeName = course.name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/ +/g, "-") || "study-plan";
  const filename = `cogni-${safeName}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.byteLength.toString(),
    },
  });
}
