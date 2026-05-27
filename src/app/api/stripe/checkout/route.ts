/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout Session and returns the URL.
 * The user is redirected to Stripe's hosted payment page.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const PRICE_PER_MONTH_CENTS = 999; // $9.99 / month

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

function getAppUrl() {
  return (process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "https://cogni.futuresage.online").replace(/\/$/, "");
}

export async function POST() {
  const stripe = getStripe();
  const APP_URL = getAppUrl();
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Don't create a new checkout if already PRO
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true, stripeCustomerId: true },
  });

  if (dbUser?.plan === "PRO") {
    return NextResponse.json({ error: "Already on Pro plan" }, { status: 400 });
  }

  // Reuse or create Stripe customer
  let customerId = dbUser?.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      name: session.user.name ?? undefined,
      metadata: { cogniUserId: session.user.id },
    });
    customerId = customer.id;
    await prisma.user.update({
      where: { id: session.user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "usd",
          recurring: { interval: "month" },
          product_data: {
            name: "Cogni Pro",
            description: "Unlock Claude Haiku, Sonnet & Opus for AI-powered study plans",
            images: [`${APP_URL}/logo.png`],
          },
          unit_amount: PRICE_PER_MONTH_CENTS,
        },
        quantity: 1,
      },
    ],
    metadata: { cogniUserId: session.user.id },
    success_url: `${APP_URL}/upgrade?success=1`,
    cancel_url: `${APP_URL}/upgrade?canceled=1`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
