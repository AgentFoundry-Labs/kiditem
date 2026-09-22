/**
 * Thumbnail AI prompt compatibility exports.
 *
 * Prompt bodies live in focused sibling modules so existing imports can keep
 * using this file while the prompt catalog stays navigable.
 *
 * 분류:
 *   - 분석 (Analysis): existing thumbnail scoring JSON prompts
 *   - 편집 (Edit): image-to-image thumbnail cleanup/enhancement prompts
 *   - Recompose: scenario-specific thumbnail rewrite prompts
 *   - 생성 (Generate): multi-input thumbnail composition prompts
 *
 * 플레이스홀더는 서비스에서 `.replace()` 로 채운다:
 *   {productList}            — analysis target product list
 *   {compositionLine}        — GENERATE_PROMPT optional composition hint
 *   {scenarioBlock}          — GENERATE_PROMPT / CREATIVE_PROMPT scenario override
 *   {layoutBlock}            — GENERATE_PROMPT layout override
 *   {productDescriptionLine} — CREATIVE_PROMPT optional product description
 *   {sceneType}, {styleType} — CREATIVE_PROMPT scene/style keywords
 *
 * Prompt text is intentionally stable; keep copy changes separate from module
 * moves so behavior diffs stay reviewable.
 */

export * from './thumbnail-analysis-prompts';
export * from './thumbnail-editor-prompts';
export * from './thumbnail-recompose-scenario-prompts';
export * from './thumbnail-prompt-context';
