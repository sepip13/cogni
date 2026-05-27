/**
 * POST /api/stripe/webhook
 * Receives Stripe events and keeps user plans in sync.
 *
 * Events handled:
 *   checkout.session.completed  → upgrade user to PRO
 *   customer.subscription.deleted → downgrade user to FREE
 */
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe/webhook] signature verification failed:", msg);
    return NextResponse.json({ error: `Webhook error: ${msg}` }, { status: 400 });
  }

  console.log(`[stripe/webhook] event: ${event.type}`);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const cogniUserId = session.metadata?.cogniUserId;
      if (!cogniUserId) {
        console.error("[stripe/webhook] checkout.session.completed missing cogniUserId");
        break;
      }
      await prisma.user.update({
        where: { id: cogniUserId },
        data: {
          plan: "PRO",
          stripeSubscriptionId: typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null,
        },
      });
      console.log(`[stripe/webhook] ✓ upgraded user ${cogniUserId} → PRO`);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const subId = sub.id;
      const user = await prisma.user.findFirst({
        where: { stripeSubscriptionId: subId },
        select: { id: true },
      });
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { plan: "FREE", stripeSubscriptionId: null },
        });
        console.log(`[stripe/webhook] ✓ downgraded user ${user.id} → FREE (sub cancelled)`);
      }
      break;
    }

    default:
      console.log(`[stripe/webhook] unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
