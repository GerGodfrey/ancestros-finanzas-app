import { TONE_CHIP, TONE_EMOJI, type Tone } from "./tone";

/**
 * Insignia de estado. El emoji sale del tono, así que cambiarlo es editar
 * `TONE_EMOJI` y nada más — no puede romper un color.
 */
export function Badge({
  tone = "neutral",
  children,
  withEmoji = false,
}: {
  tone?: Tone;
  children: React.ReactNode;
  withEmoji?: boolean;
}) {
  const emoji = tone === "neutral" ? null : TONE_EMOJI[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.06em] ${TONE_CHIP[tone]}`}
    >
      {withEmoji && emoji && <span aria-hidden="true">{emoji}</span>}
      {children}
    </span>
  );
}
