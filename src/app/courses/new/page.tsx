import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { AppLayout } from "@/components/layout/AppLayout";
import { NewCourseForm } from "./NewCourseForm";

export const metadata: Metadata = {
  title: "New course — Cogni",
};

export default async function NewCoursePage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  return (
    <AppLayout>
      <div
        style={{
          maxWidth: 720,
          margin: "40px auto 0",
          padding: "0 24px 80px",
        }}
        className="fade-in"
      >
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
              marginBottom: 12,
            }}
          >
            Upload your{" "}
            <span className="grad-text">course materials</span>
          </h1>
          <p style={{ color: "var(--text-dim)", fontSize: 16, maxWidth: 480, margin: "0 auto" }}>
            Syllabus, slides, rubric, past exams — anything you have. Cogni
            reads it all and builds your personal study plan in ~30 seconds.
          </p>
        </div>

        <NewCourseForm />
      </div>
    </AppLayout>
  );
}
