import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const MODELS = [
  { modelId: "auto",                                        label: "🎲 Roll The Dice",   desc: "may god be with u",        provider: "Router",     tier: "FREE" as const },
  { modelId: "gemini-2.5-flash",                            label: "✅ Solid 7 Energy",   desc: "not failing today",        provider: "Google",     tier: "FREE" as const },
  { modelId: "gemini-3.5-flash",                            label: "🎯 I Want A 9",       desc: "no sleep, all A's",        provider: "Google",     tier: "FREE" as const },
  { modelId: "gemini-2.5-flash-lite",                       label: "⚡ 5.5 Speedrun",     desc: "just. need. to. pass.",    provider: "Google",     tier: "FREE" as const },
  { modelId: "gemini-3-flash-preview",                      label: "🔮 Next Gen Nerd",    desc: "preview of greatness",     provider: "Google",     tier: "FREE" as const },
  { modelId: "llama-3.3-70b-versatile",                     label: "🦙 Don't Fail Me",    desc: "5.5 and i'm free",         provider: "Groq",       tier: "PRO" as const },
  { modelId: "meta-llama/llama-4-scout-17b-16e-instruct",   label: "👁 Reads Prof Minds", desc: "passes on vibes alone",    provider: "Groq",       tier: "PRO" as const },
  { modelId: "llama-3.1-8b-instant",                        label: "😱 Panic Mode",        desc: "ctrl+s at 11:59pm",        provider: "Groq",       tier: "PRO" as const },
  { modelId: "openai/gpt-oss-120b",                         label: "🧠 Actually Studied",  desc: "unlike you lol",           provider: "Groq",       tier: "PRO" as const },
  { modelId: "openai/gpt-oss-20b",                          label: "😎 Chill B Student",   desc: "B is fine, relax",         provider: "Groq",       tier: "PRO" as const },
  { modelId: "groq/compound",                               label: "👥 Group Carry",        desc: "u're the smart friend",    provider: "Groq",       tier: "PRO" as const },
  { modelId: "qwen/qwen3-32b",                              label: "🔢 GPA Saver",         desc: "need 72% on final",        provider: "Groq",       tier: "PRO" as const },
  { modelId: "DeepSeek-V3.1",                               label: "🌊 Rabbit Hole King",  desc: "read everything lol",      provider: "SambaNova",  tier: "PRO" as const },
  { modelId: "nvidia/nemotron-3-super-120b-a12b:free",      label: "☕ 5 Espressos Deep",  desc: "overcaffeinated genius",   provider: "OpenRouter", tier: "PRO" as const },
  { modelId: "google/gemma-4-31b-it:free",                  label: "💎 Surprise A+",        desc: "didn't study, still aced", provider: "OpenRouter", tier: "PRO" as const },
  { modelId: "nousresearch/hermes-3-llama-3.1-405b:free",   label: "👑 Ruins The Curve",   desc: "everyone hates u now",     provider: "OpenRouter", tier: "PRO" as const },
  { modelId: "gpt-4o",                                      label: "🧪 Secret Weapon",     desc: "prof thinks ur cheating",  provider: "GitHub",     tier: "PRO" as const },
  { modelId: "qwen/qwen3-coder:free",                       label: "💻 Code Monkey Mode",  desc: "debugging ur life choices", provider: "OpenRouter", tier: "PRO" as const },
  { modelId: "magistral-medium-latest",                      label: "🎩 Fancy Pants",       desc: "speaks in thesis format",  provider: "Mistral",    tier: "PRO" as const },
  { modelId: "DeepSeek-V3.2",                               label: "🔬 Lab Rat Energy",    desc: "deeper than ur textbook",  provider: "SambaNova",  tier: "PRO" as const },
  { modelId: "command-a-03-2025",                            label: "🏆 Deans List",        desc: "straight As or bust",      provider: "Cohere",     tier: "PRO" as const },
  { modelId: "mistral-large-latest",                         label: "🗼 Eiffel Tower Brain",desc: "oui oui, i know everything",provider: "Mistral",   tier: "PRO" as const },
  { modelId: "openai/gpt-4.1",                              label: "🤯 Overachiever",      desc: "studied the whole internet",provider: "GitHub",    tier: "PRO" as const },
  { modelId: "gemini-3.1-flash-lite-preview",                label: "⚡ Lightning Round",    desc: "speed > everything",       provider: "Google",     tier: "PRO" as const },
  { modelId: "glm-4.5-flash",                               label: "🐉 Dragon Scholar",    desc: "ancient wisdom, fast brain",provider: "Zhipu",     tier: "PRO" as const },
  { modelId: "codestral-latest",                             label: "⭐ Code Wizard",        desc: "turns coffee into code",   provider: "Mistral",    tier: "PRO" as const },
];

async function main() {
  for (let i = 0; i < MODELS.length; i++) {
    const m = MODELS[i];
    await prisma.llmModel.upsert({
      where: { modelId: m.modelId },
      update: { label: m.label, desc: m.desc, provider: m.provider, tier: m.tier, sortOrder: i },
      create: { modelId: m.modelId, label: m.label, desc: m.desc, provider: m.provider, tier: m.tier, sortOrder: i },
    });
  }
  console.log(`Seeded ${MODELS.length} models`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
