// Consumer-side seam for the language judgement behind keyword relevance.
//
// The owning capability is AI's `TEXT_JUDGEMENT_PORT`; advertising wraps just
// the surface it needs so `application/service/**` never imports another owner
// domain's implementation.
//
// The port is deliberately narrower than a general completion: advertising
// asks one question ("does this keyword fit this product?") and gets raw text
// back, which the domain then validates. Nothing here decides anything.

export const KEYWORD_RELEVANCE_JUDGE_PORT = Symbol('KeywordRelevanceJudgePort');

export interface KeywordRelevanceJudgeRequest {
  system: string;
  user: string;
  signal?: AbortSignal;
}

export interface KeywordRelevanceJudgeResult {
  /** Raw model output. The caller parses and validates it. */
  text: string;
}

export interface KeywordRelevanceJudgePort {
  /**
   * Throws when no judgement model is configured. Relevance must never fall
   * back to a default model silently — a wrong model here proposes pausing
   * live ads.
   */
  judge(
    request: KeywordRelevanceJudgeRequest,
  ): Promise<KeywordRelevanceJudgeResult>;
}
