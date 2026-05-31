"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  FEEDBACK_FORM_URL,
  LOCAL_KEY,
  LOCAL_KEY_ANON,
  SHOW_DELAY_MS,
  SURVEY_CAMPAIGN,
  SURVEY_ENABLED,
  applyAction,
  buildFormUrl,
  freshState,
  isCampaignStopped,
  isSurfaceAllowed,
  type SurveyAction,
  type SurveyState,
} from "@/lib/feedback-survey";

function readLocal(key: string): SurveyState {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw) as Partial<SurveyState>;
    return { ...freshState(), ...parsed };
  } catch {
    return freshState();
  }
}

function writeLocal(key: string, state: SurveyState): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // private mode / quota — the in-memory hide still applies for this session
  }
}

export interface FeedbackSurvey {
  visible: boolean;
  formUrl: string;
  takeSurvey: () => void;
  snooze: () => void;
  dismissForever: () => void;
}

/**
 * Decides whether to surface the interview prompt and persists the user's
 * choice. Signed-in users are gated server-side (account age, engagement, the
 * 24 h throttle) with a localStorage mirror for no-flash; logged-out visitors
 * use a localStorage-only store. Never shows more than once per 24 h.
 */
export function useFeedbackSurvey(): FeedbackSurvey {
  const { status } = useSession();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  const keyRef = useRef<string>(LOCAL_KEY_ANON);
  const authedRef = useRef(false);
  const scheduledRef = useRef(false);

  const record = useCallback((action: SurveyAction) => {
    const key = keyRef.current;
    const next = applyAction(readLocal(key), action, Date.now());
    writeLocal(key, next);
    if (authedRef.current) {
      fetch("/api/user/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, campaign: SURVEY_CAMPAIGN }),
        keepalive: true,
      }).catch(() => {
        /* optimistic — the local mirror already records the choice */
      });
    }
  }, []);

  useEffect(() => {
    if (status === "loading" || scheduledRef.current) return;
    if (!SURVEY_ENABLED || !FEEDBACK_FORM_URL) return;
    if (!isSurfaceAllowed(pathname)) return;

    const authed = status === "authenticated";
    const key = authed ? LOCAL_KEY : LOCAL_KEY_ANON;
    authedRef.current = authed;
    keyRef.current = key;

    // No-flash / no-spam gate: a local stopper ends it before any network call.
    if (isCampaignStopped(readLocal(key), Date.now())) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = () => {
      scheduledRef.current = true;
      timer = setTimeout(() => {
        if (cancelled) return;
        setVisible(true);
        record("shown");
      }, SHOW_DELAY_MS);
    };

    if (authed) {
      fetch("/api/user/survey")
        .then((r) => (r.ok ? (r.json() as Promise<{ eligible?: boolean }>) : Promise.reject(new Error("ineligible"))))
        .then((data) => {
          if (!cancelled && data.eligible) schedule();
        })
        .catch(() => {
          /* ignore — simply don't show */
        });
    } else {
      schedule();
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [status, pathname, record]);

  const takeSurvey = useCallback(() => {
    const source = authedRef.current ? "Cogni app" : "Cogni landing page";
    window.open(buildFormUrl(FEEDBACK_FORM_URL, source), "_blank", "noopener,noreferrer");
    record("complete");
    setVisible(false);
  }, [record]);

  const snooze = useCallback(() => {
    record("snooze");
    setVisible(false);
  }, [record]);

  const dismissForever = useCallback(() => {
    record("dismiss");
    setVisible(false);
  }, [record]);

  return { visible, formUrl: FEEDBACK_FORM_URL, takeSurvey, snooze, dismissForever };
}
