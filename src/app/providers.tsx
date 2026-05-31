"use client";

import { SessionProvider } from "next-auth/react";
import { FeedbackSurveyPrompt } from "@/components/feedback/FeedbackSurveyPrompt";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <FeedbackSurveyPrompt />
    </SessionProvider>
  );
}
