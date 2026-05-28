import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const MODELS = [
  // ── Free tier ──────────────────────────────────────────────────────────────
  { modelId: "auto",                                        label: "Roll The Dice",        desc: "Random pick — may god be with u",          bestFor: "Feeling lucky",                          category: "Quick Start",  provider: "Router",     tier: "FREE" as const },
  { modelId: "gemini-2.5-flash",                            label: "Solid 7 Energy",       desc: "Google's reliable workhorse",               bestFor: "Most subjects, good all-rounder",        category: "Balanced",     provider: "Google",     tier: "FREE" as const },
  { modelId: "gemini-3.5-flash",                            label: "I Want A 9",           desc: "Latest Google Flash — fast + smart",        bestFor: "Detailed study plans, essays, science",  category: "Balanced",     provider: "Google",     tier: "FREE" as const },
  { modelId: "gemini-2.5-flash-lite",                       label: "5.5 Speedrun",         desc: "Ultra-fast, lighter model",                 bestFor: "Quick reviews, simple topics",            category: "Fast & Light", provider: "Google",     tier: "FREE" as const },
  { modelId: "gemini-3-flash-preview",                      label: "Next Gen Nerd",        desc: "Preview of Google's next gen",              bestFor: "Trying cutting-edge AI",                 category: "Experimental", provider: "Google",     tier: "FREE" as const },

  // ── Pro tier: Balanced ─────────────────────────────────────────────────────
  { modelId: "llama-3.3-70b-versatile",                     label: "Don't Fail Me",        desc: "Meta's 70B all-purpose model",              bestFor: "Humanities, social sciences, writing",    category: "Balanced",     provider: "Groq",       tier: "PRO" as const },
  { modelId: "meta-llama/llama-4-scout-17b-16e-instruct",   label: "Reads Prof Minds",     desc: "Llama 4 Scout — newest Meta model",         bestFor: "Research-heavy courses, analysis",        category: "Balanced",     provider: "Groq",       tier: "PRO" as const },
  { modelId: "command-a-03-2025",                            label: "Deans List",           desc: "Cohere's flagship — great at following instructions", bestFor: "Structured plans, business courses",   category: "Deep Reasoning", provider: "Cohere",  tier: "PRO" as const },

  // ── Pro tier: Fast & Light ─────────────────────────────────────────────────
  { modelId: "llama-3.1-8b-instant",                        label: "Panic Mode",           desc: "Tiny but instant — ctrl+S at 11:59pm",     bestFor: "Last-minute cramming, quick summaries",   category: "Fast & Light", provider: "Groq",       tier: "PRO" as const },
  { modelId: "gemini-3.1-flash-lite-preview",                label: "Lightning Round",      desc: "Google's fastest experimental model",       bestFor: "Speed over depth, quick overviews",       category: "Fast & Light", provider: "Google",     tier: "PRO" as const },
  { modelId: "glm-4.5-flash",                               label: "Dragon Scholar",       desc: "Zhipu's fast model — strong on math",      bestFor: "Math, physics, quick technical reviews",  category: "Fast & Light", provider: "Zhipu",      tier: "PRO" as const },

  // ── Pro tier: Deep Reasoning ───────────────────────────────────────────────
  { modelId: "openai/gpt-4.1",                              label: "Overachiever",         desc: "OpenAI's latest GPT-4.1",                   bestFor: "Complex topics, med/law/engineering",     category: "Deep Reasoning", provider: "GitHub",   tier: "PRO" as const },
  { modelId: "gpt-4o",                                      label: "Secret Weapon",        desc: "GPT-4o — fast + powerful",                  bestFor: "STEM, long documents, hard exams",        category: "Deep Reasoning", provider: "GitHub",   tier: "PRO" as const },
  { modelId: "DeepSeek-V3.1",                               label: "Rabbit Hole King",     desc: "DeepSeek V3.1 — reads everything",          bestFor: "Research papers, dense material",         category: "Deep Reasoning", provider: "SambaNova", tier: "PRO" as const },
  { modelId: "DeepSeek-V3.2",                               label: "Lab Rat Energy",       desc: "DeepSeek V3.2 — deeper than your textbook", bestFor: "Science, advanced math, thesis prep",     category: "Deep Reasoning", provider: "SambaNova", tier: "PRO" as const },
  { modelId: "mistral-large-latest",                         label: "Eiffel Tower Brain",   desc: "Mistral's most capable model",              bestFor: "Multilingual, philosophy, literature",    category: "Deep Reasoning", provider: "Mistral",  tier: "PRO" as const },
  { modelId: "magistral-medium-latest",                      label: "Fancy Pants",          desc: "Mistral medium — thesis-grade reasoning",   bestFor: "Academic writing, structured arguments",  category: "Deep Reasoning", provider: "Mistral",  tier: "PRO" as const },
  { modelId: "nousresearch/hermes-3-llama-3.1-405b:free",   label: "Ruins The Curve",      desc: "405B params — massive reasoning power",     bestFor: "Hardest exams, graduate-level topics",    category: "Deep Reasoning", provider: "OpenRouter", tier: "PRO" as const },

  // ── Pro tier: Code & Technical ─────────────────────────────────────────────
  { modelId: "codestral-latest",                             label: "Code Wizard",          desc: "Mistral's code-specialized model",          bestFor: "CS courses, programming assignments",     category: "Code & Technical", provider: "Mistral",    tier: "PRO" as const },
  { modelId: "qwen/qwen3-coder:free",                       label: "Code Monkey Mode",     desc: "Qwen3 tuned for code",                      bestFor: "Algorithms, data structures, debugging",  category: "Code & Technical", provider: "OpenRouter", tier: "PRO" as const },

  // ── Pro tier: Experimental ─────────────────────────────────────────────────
  { modelId: "openai/gpt-oss-120b",                         label: "Actually Studied",     desc: "OpenAI open-source 120B — experimental",    bestFor: "Trying new models, broad topics",         category: "Experimental", provider: "Groq",       tier: "PRO" as const },
  { modelId: "openai/gpt-oss-20b",                          label: "Chill B Student",      desc: "OpenAI open-source 20B — light but capable", bestFor: "Casual study, low-stakes reviews",       category: "Experimental", provider: "Groq",       tier: "PRO" as const },
  { modelId: "groq/compound",                               label: "Group Carry",          desc: "Groq's compound AI — multi-step reasoning", bestFor: "Multi-topic courses, broad coverage",     category: "Experimental", provider: "Groq",       tier: "PRO" as const },
  { modelId: "qwen/qwen3-32b",                              label: "GPA Saver",            desc: "Qwen3 32B — strong on math + reasoning",    bestFor: "Math-heavy courses, statistics",           category: "Experimental", provider: "Groq",       tier: "PRO" as const },
  { modelId: "nvidia/nemotron-3-super-120b-a12b:free",      label: "5 Espressos Deep",     desc: "Nvidia's 120B research model",              bestFor: "Technical deep-dives, engineering",       category: "Experimental", provider: "OpenRouter", tier: "PRO" as const },
  { modelId: "google/gemma-4-31b-it:free",                  label: "Surprise A+",          desc: "Google Gemma 4 — compact but sharp",        bestFor: "General study, surprising quality",       category: "Experimental", provider: "OpenRouter", tier: "PRO" as const },
];

async function main() {
  for (let i = 0; i < MODELS.length; i++) {
    const m = MODELS[i];
    await prisma.llmModel.upsert({
      where: { modelId: m.modelId },
      update: { label: m.label, desc: m.desc, bestFor: m.bestFor, category: m.category, provider: m.provider, tier: m.tier, sortOrder: i },
      create: { modelId: m.modelId, label: m.label, desc: m.desc, bestFor: m.bestFor, category: m.category, provider: m.provider, tier: m.tier, sortOrder: i },
    });
  }
  console.log(`Seeded ${MODELS.length} models`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
