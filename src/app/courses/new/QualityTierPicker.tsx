"use client";

import { useState } from "react";

export type QualityTier = "quick" | "balanced" | "maximum";

export interface LlmModel {
  id: string;
  modelId: string;
  label: string;
  desc: string;
  bestFor: string;
  category: string;
  provider: string;
  tier: "FREE" | "PRO";
}

const QUALITY_TIERS: {
  id: QualityTier;
  name: string;
  desc: string;
  badge?: string;
}[] = [
  { id: "quick", name: "Quick", desc: "Fast scan, good for short notes" },
  { id: "balanced", name: "Balanced", desc: "Thorough analysis, best for most courses", badge: "Recommended" },
  { id: "maximum", name: "Maximum", desc: "Deepest analysis with Claude AI", badge: "PRO" },
];

function groupByCategory(list: LlmModel[]): [string, LlmModel[]][] {
  const map = new Map<string, LlmModel[]>();
  for (const m of list) {
    const cat = m.category || "General";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(m);
  }
  return Array.from(map.entries());
}

function computeWizardRecommendation(answers: Record<string, string>): { tier: QualityTier; reason: string } {
  const pages = answers.pages;
  const urgency = answers.urgency;
  const priority = answers.priority;

  if (priority === "speed" || (pages === "under20" && urgency === "1to3days")) {
    return { tier: "quick", reason: "Speed is your priority with a tight deadline — Quick gets you started fast." };
  }
  if (pages === "100plus" && priority === "depth") {
    return { tier: "maximum", reason: "Large materials + deep analysis = Maximum gives the best results." };
  }
  if (priority === "depth" && urgency !== "1to3days") {
    return { tier: "maximum", reason: "You have time and want depth — Maximum will extract the most insight." };
  }
  return { tier: "balanced", reason: "Balanced covers your materials thoroughly without unnecessary wait." };
}

interface QualityTierPickerProps {
  qualityTier: QualityTier;
  onTierChange: (tier: QualityTier) => void;
  model: string;
  onModelChange: (modelId: string) => void;
  models: LlmModel[];
  modelsError: boolean;
  userPlan: "FREE" | "PRO";
  uploading: boolean;
  onNavigateUpgrade: () => void;
}

export function QualityTierPicker({
  qualityTier,
  onTierChange,
  model,
  onModelChange,
  models,
  modelsError,
  userPlan,
  uploading,
  onNavigateUpgrade,
}: QualityTierPickerProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardAnswers, setWizardAnswers] = useState<Record<string, string>>({});
  const [wizardRecommendation, setWizardRecommendation] = useState<{ tier: QualityTier; reason: string } | null>(null);

  const freeModels = models.filter((m) => m.tier === "FREE");
  const proModels = models.filter((m) => m.tier === "PRO");

  function handleWizardAnswer(key: string, value: string) {
    const next = { ...wizardAnswers, [key]: value };
    setWizardAnswers(next);
    if (next.material && next.pages && next.urgency && next.priority) {
      const rec = computeWizardRecommendation(next);
      setWizardRecommendation(rec);
      if (rec.tier !== "maximum" || userPlan === "PRO") {
        onTierChange(rec.tier);
      }
    }
  }

  function WizardRadio({ groupKey, options }: { groupKey: string; options: { value: string; label: string }[] }) {
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleWizardAnswer(groupKey, opt.value)}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              fontSize: 13,
              border: wizardAnswers[groupKey] === opt.value ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
              background: wizardAnswers[groupKey] === opt.value ? "var(--surface-2)" : "transparent",
              color: wizardAnswers[groupKey] === opt.value ? "var(--accent)" : "var(--text-dim)",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 24, marginTop: 8 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-dim)", marginBottom: 12 }}>
        Analysis quality
      </label>

      {modelsError && (
        <div style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 12 }}>
          Could not load models — using recommended default
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {QUALITY_TIERS.map((tier) => {
          const selected = qualityTier === tier.id;
          const locked = tier.id === "maximum" && userPlan === "FREE";
          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => {
                if (locked) { onNavigateUpgrade(); return; }
                if (!uploading) { onTierChange(tier.id); setShowAdvanced(false); }
              }}
              disabled={uploading}
              style={{
                padding: "20px 16px",
                borderRadius: 12,
                border: selected ? "2px solid var(--accent)" : "1px solid var(--border-strong)",
                background: selected ? "var(--surface-2)" : "var(--surface)",
                cursor: uploading ? "default" : "pointer",
                transition: "all 0.15s",
                textAlign: "center",
                opacity: locked ? 0.55 : 1,
                position: "relative",
              }}
            >
              {locked && <span style={{ position: "absolute", top: 8, right: 10, fontSize: 14 }} aria-hidden="true">&#x1F512;</span>}
              {tier.badge && (
                <span style={{
                  display: "inline-block", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
                  padding: "2px 8px", borderRadius: 20, marginBottom: 8,
                  background: tier.badge === "PRO" ? "linear-gradient(135deg, var(--accent), var(--accent-2))" : "var(--accent-soft)",
                  color: tier.badge === "PRO" ? "var(--bg)" : "var(--accent)",
                }}>
                  {tier.badge}
                </span>
              )}
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: selected ? "var(--accent)" : "var(--text)" }}>{tier.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.4 }}>{tier.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Help me choose */}
      <button
        type="button"
        onClick={() => { setShowWizard((v) => !v); setWizardAnswers({}); setWizardRecommendation(null); }}
        style={{ fontSize: 13, color: "var(--accent)", marginTop: 12, display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}
      >
        <span style={{ fontSize: 14 }}>{showWizard ? "▾" : "▸"}</span>
        Help me choose
      </button>

      {showWizard && (
        <div style={{ marginTop: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 22px" }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>What are you uploading?</div>
            <WizardRadio groupKey="material" options={[{ value: "slides", label: "Slides" }, { value: "textbook", label: "Textbook" }, { value: "notes", label: "Notes" }, { value: "mixed", label: "Mixed" }]} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>How many pages?</div>
            <WizardRadio groupKey="pages" options={[{ value: "under20", label: "Under 20" }, { value: "20to100", label: "20–100" }, { value: "100plus", label: "100+" }]} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>When is your exam?</div>
            <WizardRadio groupKey="urgency" options={[{ value: "1to3days", label: "In 1–3 days" }, { value: "1to2weeks", label: "In 1–2 weeks" }, { value: "2plusweeks", label: "More than 2 weeks" }]} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>What matters most?</div>
            <WizardRadio groupKey="priority" options={[{ value: "speed", label: "Speed" }, { value: "depth", label: "Depth of analysis" }, { value: "practice", label: "Practice questions" }]} />
          </div>
          {wizardRecommendation && (
            <div style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: 10, padding: "14px 18px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)", marginBottom: 4 }}>
                We recommend <span className="grad-text">{QUALITY_TIERS.find((t) => t.id === wizardRecommendation.tier)?.name}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-dim)" }}>{wizardRecommendation.reason}</div>
              {wizardRecommendation.tier === "maximum" && userPlan === "FREE" && (
                <a href="/upgrade" style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginTop: 8, display: "inline-block" }}>
                  Upgrade to PRO to unlock Maximum →
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Advanced model picker */}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}
      >
        <span style={{ fontSize: 14 }}>{showAdvanced ? "▾" : "▸"}</span>
        Advanced: choose specific model
      </button>

      {showAdvanced && models.length > 0 && (
        <div style={{ marginTop: 12, padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
          {freeModels.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Free</div>
              {groupByCategory(freeModels).map(([cat, items]) => (
                <div key={cat} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", marginBottom: 6 }}>{cat}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                    {items.map((m) => {
                      const selected = model === m.modelId;
                      return (
                        <button key={m.modelId} type="button" onClick={() => { if (!uploading) onModelChange(m.modelId); }} disabled={uploading}
                          style={{ padding: "10px 12px", borderRadius: 10, border: selected ? "2px solid var(--accent)" : "1px solid var(--border-strong)", background: selected ? "var(--surface-2)" : "var(--surface)", cursor: uploading ? "default" : "pointer", transition: "all 0.15s", textAlign: "left" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: selected ? "var(--accent-2)" : "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{m.provider}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: selected ? "var(--accent)" : "var(--text)", lineHeight: 1.2 }}>{m.label}</div>
                          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 3 }}>{m.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {proModels.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Pro</div>
              {groupByCategory(proModels).map(([cat, items]) => (
                <div key={cat} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", marginBottom: 6 }}>{cat}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                    {items.map((m) => {
                      const locked = userPlan === "FREE";
                      const selected = model === m.modelId;
                      return (
                        <button key={m.modelId} type="button"
                          onClick={() => { if (locked) { onNavigateUpgrade(); return; } if (!uploading) onModelChange(m.modelId); }}
                          disabled={uploading}
                          style={{ padding: "10px 12px", borderRadius: 10, border: selected ? "2px solid var(--accent)" : "1px solid var(--border-strong)", background: locked ? "var(--surface)" : selected ? "var(--surface-2)" : "var(--surface)", cursor: uploading ? "default" : "pointer", transition: "all 0.15s", textAlign: "left", opacity: locked ? 0.45 : 1, position: "relative" }}>
                          {locked && <span style={{ position: "absolute", top: 6, right: 8, fontSize: 12 }} aria-hidden="true">&#x1F512;</span>}
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{m.provider}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: selected ? "var(--accent)" : "var(--text)", lineHeight: 1.2 }}>{m.label}</div>
                          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 3 }}>{m.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
