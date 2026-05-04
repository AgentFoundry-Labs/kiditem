/**
 * Detail Page Prompt Modules — Public API
 *
 * 11 개 섹션의 system prompt + user builder + zod schema 를 한곳에서 import.
 * Service 레이어는 ORCHESTRATION_BY_PHASE 를 따라 phase 순회 + Promise.all 로 dispatch.
 */
export * from './types';
export * from './orchestrator';
export * from './section-01-hero';
export * from './section-02-reviews';
export * from './section-03-usage';
export * from './section-04-pain-points';
export * from './section-05-solution';
export * from './section-06-features';
export * from './section-07-keypoint-1';
export * from './section-08-blue-section';
export * from './section-09-keypoint-2';
export * from './section-10-lifestyles';
export * from './section-11-gallery';
