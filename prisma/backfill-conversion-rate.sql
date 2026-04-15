-- prisma/backfill-conversion-rate.sql
-- 목적: traffic_stats.conversion_rate 의 데이터 컨벤션 이행
--   - OLD: fraction 0~1 (예: 0.0428 = 4.28%), Decimal(5,4)
--   - NEW: percentage 0~100 (예: 4.28 = 4.28%), Decimal(5,2)
--   브랜치 feat/thumbnail-editor-wing 의 신규 write 코드
--   (ad-sync handleTraffic: `Math.round((orders/visitors) * 10000) / 100`)
--   는 이미 percentage 형식으로 쓰므로, 기존 행을 동일 스케일로 맞춤.
--
-- 중요: 이 스크립트는 `npx prisma db push --accept-data-loss` **이전에** 실행해야 함.
--   db push 먼저 돌리면 Prisma 가 (5,4)→(5,2) 로 단순 cast 해서 0.0428 → 0.04 로
--   소수 2자리 정밀도가 먼저 버려짐. 그 뒤 × 100 해봐야 4 (소수 0자리)밖에 안 남음.
--   ALTER TABLE ... USING (conversion_rate * 100) 으로 cast 와 scale 을 한 번에
--   하면 4.2800 → 4.28 로 소수 2자리 정밀도 유지.
--
-- 실행 방법:
--   docker exec -i kiditem-postgres psql -U kiditem -d kiditem -v ON_ERROR_STOP=1 \
--     < prisma/backfill-conversion-rate.sql
--   그 다음에:
--   npx prisma db push --accept-data-loss   # 이 컬럼은 no-op, 다른 schema diff 만 반영
--
-- 재실행 안전: ALTER TYPE 는 같은 타입 재적용 시 no-op 아님 — 두 번 돌리면
--   이미 percentage 상태인 값에 또 × 100 되므로 **멱등 아님**. 한 번만 실행.
--   information_schema 로 현재 scale/precision 확인 후 분기할 수도 있으나 이번 PR
--   1회성이라 조건문 없이 짧게 유지.

BEGIN;

-- 1) 음수 이상치 1행 (-0.2105) 0 으로 reset — × 100 은 가능하지만 데이터 오류로 판단
UPDATE traffic_stats SET conversion_rate = 0 WHERE conversion_rate < 0;

-- 2) 컬럼 타입 확장 + fraction → percentage 동시 변환
--    (5,4) 에서는 >= 10 저장 불가이므로 0~1 범위 내에서 × 100 하면 0~100 내 정상 값
ALTER TABLE traffic_stats
  ALTER COLUMN conversion_rate TYPE DECIMAL(5, 2) USING (conversion_rate * 100);

COMMIT;
