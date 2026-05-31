/**
 * Feedback / interview survey prompt — config + shared rules.
 *
 * Pure, framework-agnostic helpers so the server route (DB-backed, signed-in)
 * and the client hook (localStorage, signed-in mirror + anonymous) enforce ONE
 * rule set: campaign stoppers, the once-per-day throttle, and the prompt cap.
 */

// Active campaign — bump to re-prompt everyone for a new interview round.
export const SURVEY_CAMPAIGN = "interview-2026-06";

// Public form URL (set in env; swap without code changes). Empty = feature off.
export const FEEDBACK_FORM_URL = process.env.NEXT_PUBLIC_FEEDBACK_FORM_URL ?? "";
export const SURVEY_ENABLED =
  process.env.NEXT_PUBLIC_FEEDBACK_SURVEY_ENABLED !== "false" && FEEDBACK_FORM_URL.length > 0;

// Optional Google Forms prefill — records "came from the site" on every response.
// This is the entry id of a short-answer question on the form (e.g. "Source").
// Accepts "entry.123456789" or just "123456789". Empty = the link opens unchanged.
export const FEEDBACK_FORM_SOURCE_ENTRY = process.env.NEXT_PUBLIC_FEEDBACK_FORM_SOURCE_ENTRY ?? "";

// Eligibility / frequency tunables.
export const MIN_HOURS_BETWEEN_PROMPTS = 24; // once-per-day hard throttle
export const SNOOZE_DAYS = 1; // "Maybe later" → back tomorrow
export const MAX_PROMPTS_PER_CAMPAIGN = 5;
export const MIN_ACCOUNT_AGE_HOURS = 24; // signed-in: don't ask brand-new accounts
export const REQUIRE_ENGAGEMENT = true; // signed-in: require >= 1 created course
export const SHOW_DELAY_MS = 8000; // delay after mount before showing

export const LOCAL_KEY = "cogni:survey:v1"; // signed-in mirror
export const LOCAL_KEY_ANON = "cogni:survey:anon:v1"; // logged-out store

// Surfaces where the prompt may appear. Allow-list only — keeps it off every
// mid-task / auth / checkout page without dynamic-route guessing.
//   "/"          → public landing page (anonymous visitors)
//   "/dashboard" → the signed-in hub
export const ALLOWED_EXACT_PATHS = ["/", "/dashboard"];

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type SurveyStatusValue = "NONE" | "SNOOZED" | "COMPLETED" | "DISMISSED";
export type SurveyAction = "shown" | "snooze" | "dismiss" | "complete";

/** Canonical state shape shared by client + server (timestamps as epoch ms). */
export interface SurveyState {
  campaign: string | null;
  status: SurveyStatusValue;
  count: number;
  lastShownAt: number | null;
  snoozedUntil: number | null;
  actionedAt: number | null;
}

export function freshState(): SurveyState {
  return {
    campaign: SURVEY_CAMPAIGN,
    status: "NONE",
    count: 0,
    lastShownAt: null,
    snoozedUntil: null,
    actionedAt: null,
  };
}

/** Only `/` and `/dashboard` may host the prompt. */
export function isSurfaceAllowed(pathname: string): boolean {
  return ALLOWED_EXACT_PATHS.includes(pathname);
}

/**
 * Appends a Google Forms prefill param so each response records where the
 * visitor came from. Returns the base URL unchanged when no entry id is
 * configured (graceful no-op). `source` is a short tag, e.g. "Cogni app".
 */
export function buildFormUrl(baseUrl: string, source: string): string {
  const entry = FEEDBACK_FORM_SOURCE_ENTRY.trim();
  if (!baseUrl || !entry) return baseUrl;
  const field = entry.startsWith("entry.") ? entry : `entry.${entry}`;
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("usp", "pp_url");
    url.searchParams.set(field, source);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

/**
 * True when the prompt must NOT show for the active campaign: permanently
 * actioned, snoozed, capped, or shown within the last 24 h (once-per-day).
 * A state from a previous campaign is treated as fresh (not stopped).
 */
export function isCampaignStopped(state: SurveyState, now: number): boolean {
  if (state.campaign !== SURVEY_CAMPAIGN) return false;
  if (state.status === "COMPLETED" || state.status === "DISMISSED") return true;
  if (state.count >= MAX_PROMPTS_PER_CAMPAIGN) return true;
  if (state.snoozedUntil !== null && state.snoozedUntil > now) return true;
  if (state.lastShownAt !== null && now - state.lastShownAt < MIN_HOURS_BETWEEN_PROMPTS * HOUR_MS) {
    return true;
  }
  return false;
}

/**
 * Apply a user action immutably, resetting first when the stored state belongs
 * to a previous campaign (so a campaign bump re-enables a fresh round).
 */
export function applyAction(state: SurveyState, action: SurveyAction, now: number): SurveyState {
  const base = state.campaign === SURVEY_CAMPAIGN ? state : freshState();

  switch (action) {
    case "shown":
      return {
        ...base,
        campaign: SURVEY_CAMPAIGN,
        count: base.count + 1,
        lastShownAt: now,
        status: base.status === "SNOOZED" ? "NONE" : base.status,
      };
    case "snooze":
      return { ...base, campaign: SURVEY_CAMPAIGN, status: "SNOOZED", snoozedUntil: now + SNOOZE_DAYS * DAY_MS };
    case "dismiss":
      return { ...base, campaign: SURVEY_CAMPAIGN, status: "DISMISSED", actionedAt: now };
    case "complete":
      return { ...base, campaign: SURVEY_CAMPAIGN, status: "COMPLETED", actionedAt: now };
  }
}
