-- Backfill: qualityAnalyzedAt / complianceAnalyzedAt 타임스탬프 채우기
-- 실행 시점: quality_analyzed_at, compliance_analyzed_at 컬럼 추가 후 (db push 이후)
-- 실행 방법: npx prisma db execute --stdin < prisma/backfill-analysis-timestamps.sql

-- 품질 분석 데이터가 있는 모든 기존 레코드
UPDATE thumbnail_analyses
SET quality_analyzed_at = updated_at
WHERE quality_analyzed_at IS NULL;

-- 가이드라인 분석 데이터가 있는 레코드만
UPDATE thumbnail_analyses
SET compliance_analyzed_at = updated_at
WHERE compliance_grade IS NOT NULL AND compliance_analyzed_at IS NULL;
