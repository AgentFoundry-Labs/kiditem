/**
 * AI domain agent output schemas — barrel.
 *
 * 각 agent type 의 output contract 를 한 곳에서 노출한다. bridge 들이 이 file 의
 * 상수 (agent type) 와 schema 를 참조해 finalized event 를 분기·검증한다.
 *
 * Pure domain layer — no Nest/Prisma/HTTP dependencies.
 */
export {
  DETAIL_PAGE_GENERATE_AGENT_TYPE,
  DetailPageGenerateAgentInputSchema,
  DetailPageGenerateAgentOutputSchema,
  type DetailPageGenerateAgentInput,
  type DetailPageGenerateAgentOutput,
} from './detail-page-generate.schema';
export {
  THUMBNAIL_GENERATE_AGENT_TYPE,
  ThumbnailCandidateSchema,
  ThumbnailGenerateAgentInputImageSchema,
  ThumbnailGenerateAgentInputSchema,
  ThumbnailGenerateAgentOutputSchema,
  type ThumbnailCandidate,
  type ThumbnailGenerateAgentInput,
  type ThumbnailGenerateAgentInputImage,
  type ThumbnailGenerateAgentOutput,
} from './thumbnail-generate.schema';

import {
  DETAIL_PAGE_GENERATE_AGENT_TYPE,
  DetailPageGenerateAgentOutputSchema,
} from './detail-page-generate.schema';
import {
  THUMBNAIL_GENERATE_AGENT_TYPE,
  ThumbnailGenerateAgentOutputSchema,
} from './thumbnail-generate.schema';

/**
 * Source-type strings used on `AgentRunRequest.source` so the bridges can
 * filter their FINALIZED listeners. Keep these stable — they are also written
 * to existing operation-alert / panel rows.
 */
export const AI_AGENT_SOURCE_TYPES = {
  DETAIL_PAGE_GENERATE: 'ai.detail_page_generate' as const,
  THUMBNAIL_GENERATE: 'ai.thumbnail_generate' as const,
};

/**
 * Agent output schema registry.
 *
 * Bridges look up by agent type instead of branching on string. Adding a new
 * AI-domain agent type means: add the schema file, register here, add a
 * bridge that subscribes to FINALIZED.
 */
export const AI_AGENT_OUTPUT_SCHEMAS = {
  [DETAIL_PAGE_GENERATE_AGENT_TYPE]: DetailPageGenerateAgentOutputSchema,
  [THUMBNAIL_GENERATE_AGENT_TYPE]: ThumbnailGenerateAgentOutputSchema,
} as const;
