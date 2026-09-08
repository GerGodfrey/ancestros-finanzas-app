// El tono es el vocabulario único para "esto está bien / mal / revísalo".
// Antes vivía en emojis dentro de strings, y `dashboard-tabs.tsx` decidía
// colores con `tag.startsWith("✅")`. Ahora el emoji sale del tono, no al
// revés — la regla está en docs/design-system.md.

export type Tone = "neutral" | "good" | "bad" | "warn";

export const TONE_EMOJI: Record<Exclude<Tone, "neutral">, string> = {
  good: "✅",
  bad: "🔴",
  warn: "⚠️",
};

export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-text",
  good: "text-positive",
  bad: "text-negative",
  warn: "text-warning",
};

export const TONE_RAIL: Record<Tone, string> = {
  neutral: "border-l-accent",
  good: "border-l-positive",
  bad: "border-l-negative",
  warn: "border-l-warning",
};

export const TONE_CHIP: Record<Tone, string> = {
  neutral: "border-border text-text-muted",
  good: "border-positive/40 bg-positive/10 text-positive",
  bad: "border-negative/40 bg-negative/10 text-negative",
  warn: "border-warning/40 bg-warning/10 text-warning",
};
