// Owner-side capability the AI domain publishes for other owner domains that
// need a bounded text judgement (classify / rate / label) rather than content
// generation.
//
// Published as an incoming port instead of exporting `TEXT_COMPLETION_PORT`
// directly: that symbol is AI's *driven* provider contract (Gemini request
// shape, mime types, sampling), and consumers must not depend on which
// provider AI happens to use. This surface exposes only the question.
//
// The model id is required. `apps/server/AGENTS.md` forbids a silent
// `model || default`, so the caller reads it from its own env and an unset
// value is an explicit error at the call site.

export const TEXT_JUDGEMENT_PORT = Symbol('TextJudgementPort');

export interface TextJudgementRequest {
  /** Role and rules. Always explicit; there is no implicit system prompt. */
  system: string;
  /** The question, including the material being judged. */
  user: string;
  /** Model identifier the caller resolved from its own configuration. */
  model: string;
  /** Judgement wants determinism; callers normally pass 0. */
  temperature: number;
  /** Ask the provider to emit JSON. Callers still validate the shape. */
  json?: boolean;
  signal?: AbortSignal;
}

export interface TextJudgementResult {
  text: string;
}

export interface TextJudgementPort {
  judge(request: TextJudgementRequest): Promise<TextJudgementResult>;
}
