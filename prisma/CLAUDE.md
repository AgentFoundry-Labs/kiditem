# prisma — 공유 스키마

전체 시스템의 DB 스키마 source of truth. Prisma v7.

## 명령어

```bash
npm run db:generate   # Prisma 클라이언트 생성
npm run db:push       # 개발용 — DB에 직접 적용
npm run db:migrate    # 프로덕션용 — 마이그레이션 파일 생성
npm run db:studio     # DB 브라우저 (localhost:5555)
```

`DATABASE_URL` 환경변수 필수: `postgresql://kiditem:kiditem@localhost:5433/kiditem`

## Prisma v7 설정

`prisma.config.ts` (루트)에서 datasource URL 설정.
`schema.prisma`에 `url` 없음 (v7 방식).

## 모델 (17개)

| 모델 | 테이블 | 용도 |
|---|---|---|
| Company | companies | 사업체 |
| User | users | 사용자 |
| Product | products | 상품 (소싱 + 운영 통합) |
| Inventory | inventory | 재고 (Product 1:1) |
| Order | orders | 판매주문 (고객→셀러) |
| PurchaseOrder | purchase_orders | 구매발주 (셀러→공급사) |
| PurchaseOrderItem | purchase_order_items | 발주 품목 |
| Ad | ads | 광고 실적 |
| ProfitLoss | profit_loss | 월별 손익 |
| Thumbnail | thumbnails | 썸네일 CTR |
| Review | reviews | 리뷰 |
| Alert | alerts | 알림 |
| AgentTask | agent_tasks | Agent 작업 큐 |
| AgentLog | agent_logs | Agent 실행 로그 |
| AgentDefinition | agent_definitions | 에이전트 정의 (프롬프트, 예산, 스케줄) |
| DouyinLiveRoom | douyin_live_rooms | Douyin 라이브 모니터링 |
| DouyinLiveProduct | douyin_live_products | Douyin 감지 상품 |
| ContentGeneration | content_generations | AI 콘텐츠 생성 |
| CoupangListing | coupang_listings | 쿠팡 리스팅 |
| ProductPerformance | product_performances | 상품 성과 |

## 규칙

- Native PG enum 금지 → `String` 필드
- PascalCase 모델명 → `@@map("snake_case")` 테이블명
- camelCase 필드명 → `@map("snake_case")` 컬럼명
- UUID PK: `@default(uuid()) @db.Uuid`
- Timestamp: `@db.Timestamptz`
- 금액: `Int` (KRW) 또는 `Decimal(12,2)` (CNY)
- Python에서는 snake_case DB 컬럼명으로 직접 접근 (asyncpg raw SQL)
