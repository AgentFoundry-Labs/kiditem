# Milestones

## v1.0 상세페이지 파이프라인 리팩토링 (Shipped: 2026-03-26)

**Phases completed:** 4 phases, 8 plans, 20+ tasks

**Key accomplishments:**

- Prisma 스키마에 draftContent/pipelineStep 컬럼 추가 (파이프라인 중간 상태 저장)
- Python 에이전트 2단계 분리 (content_draft → content_image)
- NestJS API 3개 엔드포인트 (draft-content, preview, trigger-image-gen)
- 프론트엔드 에디터 통합 (구조화 편집 + 컬러피커 + 히어로 이미지 선택 + 이미지 생성 CTA)

---

## v2.0 쿠팡 운영 대시보드 (Shipped: 2026-03-26)

**Phases completed:** 3 phases, 5 plans, 11 tasks

**Key accomplishments:**

- KST 타임존 헬퍼 + typed 상수로 모든 대시보드 쿼리의 날짜 정확성 보장
- CoupangDashboard NestJS 모듈 — Promise.all 팬아웃 + $queryRaw 6개 엔드포인트
- 주문 대시보드 — KPI 바, 30일 매출 트렌드 차트, 상품별 매출 Top-20 테이블
- 반품 대시보드 — 반품률 KPI, 사유별 막대 차트, CUSTOMER/VENDOR 귀책 비율
- 사이드바 실시간 배지 — ACCEPT 대기 + UC 반품 건수 표시

---
