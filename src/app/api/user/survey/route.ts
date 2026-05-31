import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import {
  FEEDBACK_FORM_URL,
  MIN_ACCOUNT_AGE_HOURS,
  REQUIRE_ENGAGEMENT,
  SURVEY_CAMPAIGN,
  SURVEY_ENABLED,
  applyAction,
  isCampaignStopped,
  type SurveyState,
  type SurveyStatusValue,
} from "@/lib/feedback-survey";

const SURVEY_POST_LIMIT = { max: 20, windowMs: 10 * 60 * 1000 };
const HOUR_MS = 3_600_000;

const ActionSchema = z.object({
  action: z.enum(["shown", "snooze", "dismiss", "complete"]),
  campaign: z.string().min(1).max(64),
});

interface UserSurveyRow {
  createdAt: Date;
  surveyStatus: SurveyStatusValue;
  surveyCampaign: string | null;
  surveyPromptCount: number;
  surveyLastShownAt: Date | null;
  surveySnoozedUntil: Date | null;
  surveyActionedAt: Date | null;
}

const surveySelect = {
  createdAt: true,
  surveyStatus: true,
  surveyCampaign: true,
  surveyPromptCount: true,
  surveyLastShownAt: true,
  surveySnoozedUntil: true,
  surveyActionedAt: true,
} as const;

function stateFromRow(row: UserSurveyRow): SurveyState {
  return {
    campaign: row.surveyCampaign,
    status: row.surveyStatus,
    count: row.surveyPromptCount,
    lastShownAt: row.surveyLastShownAt?.getTime() ?? null,
    snoozedUntil: row.surveySnoozedUntil?.getTime() ?? null,
    actionedAt: row.surveyActionedAt?.getTime() ?? null,
  };
}

function dataFromState(state: SurveyState) {
  return {
    surveyStatus: state.status,
    surveyCampaign: state.campaign,
    surveyPromptCount: state.count,
    surveyLastShownAt: state.lastShownAt !== null ? new Date(state.lastShownAt) : null,
    surveySnoozedUntil: state.snoozedUntil !== null ? new Date(state.snoozedUntil) : null,
    surveyActionedAt: state.actionedAt !== null ? new Date(state.actionedAt) : null,
  };
}

/** GET → whether to show the prompt to this signed-in user, plus the form URL. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!SURVEY_ENABLED) {
    return NextResponse.json({ eligible: false, campaign: SURVEY_CAMPAIGN, formUrl: "" });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: surveySelect,
  });
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const now = Date.now();
  const state = stateFromRow(user);

  const accountOldEnough = now - user.createdAt.getTime() >= MIN_ACCOUNT_AGE_HOURS * HOUR_MS;
  let engagementOk = true;
  if (REQUIRE_ENGAGEMENT) {
    const courses = await prisma.course.count({ where: { userId: session.user.id } });
    engagementOk = courses > 0;
  }

  const eligible = accountOldEnough && engagementOk && !isCampaignStopped(state, now);

  return NextResponse.json({
    eligible,
    campaign: SURVEY_CAMPAIGN,
    formUrl: FEEDBACK_FORM_URL,
    status: state.status,
    snoozedUntil: state.snoozedUntil,
  });
}

/** POST → record an action ("shown" | "snooze" | "dismiss" | "complete"). */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const limit = rateLimit(`survey:${userId}`, SURVEY_POST_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  let input: z.infer<typeof ActionSchema>;
  try {
    const body = (await req.json().catch(() => ({}))) as unknown;
    input = ActionSchema.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Ignore actions from a stale client whose campaign no longer matches.
  if (input.campaign !== SURVEY_CAMPAIGN) {
    return NextResponse.json({ ok: true, stale: true });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: surveySelect,
  });
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const next = applyAction(stateFromRow(user), input.action, Date.now());
  await prisma.user.update({ where: { id: userId }, data: dataFromState(next) });

  return NextResponse.json({ ok: true });
}
