// Server-only: reads env presence, never values, for the /agent page and the live route.
const DEFAULT_MODEL = "claude-opus-5-5";

export function liveModeStatus(): { enabled: boolean; model: string } {
  return {
    enabled: Boolean(process.env.LLM_API_KEY && process.env.INSTRUCTOR_PASSCODE),
    model: process.env.LLM_MODEL || DEFAULT_MODEL,
  };
}
