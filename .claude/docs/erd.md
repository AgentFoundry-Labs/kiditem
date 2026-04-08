# KidItem ERD — 도메인별 DB 모델 관계도

> 63개 Prisma 모델을 9개 도메인으로 분류. 핵심 필드와 관계만 표시.
> 소스 오브 트루스: `prisma/schema.prisma`

## 전체 도메인 맵

```mermaid
graph LR
    Core[핵심<br/>Company·User·Product]
    Order[주문/배송<br/>7 모델]
    Stock[재고/물류<br/>10 모델]
    Supply[구매/공급<br/>5 모델]
    Ads[광고/마케팅<br/>9 모델]
    Finance[재무/분석<br/>7 모델]
    AI[AI/썸네일<br/>4 모델]
    Agent[에이전트/워크플로우<br/>8 모델]
    System[시스템/설정<br/>8 모델]

    Core --> Order
    Core --> Stock
    Core --> Supply
    Core --> Ads
    Core --> Finance
    Core --> AI
    Core --> Agent
    Core --> System
    Supply --> Stock
    Order --> Stock
    Ads --> Agent
```

---

## 1. 핵심 — Company · User · Product

> 모든 데이터의 루트. Company가 최상위, Product가 대부분의 하위 모델과 연결되는 허브.

```mermaid
erDiagram
    Company {
        uuid id PK
        string name
        string slug UK
        bool isActive
    }
    User {
        uuid id PK
        string email UK
        string name
        string role "member|admin"
        string type "human|agent|system"
    }
    Product {
        uuid id PK
        string name
        string status "draft|active|..."
        string abcGrade "A|B|C"
        string adTier "1차|2차|3차"
        int costPrice "원가(원)"
        int sellPrice "판매가(원)"
        string category
        string pipelineStep "소싱 단계"
    }

    Company ||--o{ User : "소속"
    Company ||--o{ Product : "보유"
    User }o--o| Company : "agentDefinition"
```

**핵심 포인트:**
- `Product.abcGrade` — 매출 기반 ABC 등급 (광고 전략의 핵심 기준)
- `Product.adTier` — 광고 티어 (1차/2차/3차)
- `Product.pipelineStep` — 소싱→가공→등록 파이프라인 단계
- `User.type` — `human`(사람), `agent`(AI), `system`(챗봇) 통합 관리

---

## 2. 주문/배송

> 쿠팡 주문 수집 → 출고 → 배송 추적. Order(내부)와 CoupangOrder(외부)가 병존.

```mermaid
erDiagram
    Order {
        uuid id PK
        string orderNumber
        string platform "coupang"
        string status "pending|shipped|..."
        int totalPrice "원"
    }
    CoupangOrder {
        uuid id PK
        string shipmentBoxId UK
        string status "ACCEPT|INSTRUCT|..."
        int totalPrice
    }
    CoupangOrderItem {
        uuid id PK
        string vendorItemId
        int salesPrice
    }
    CoupangReturn {
        uuid id PK
        string receiptId UK
        string receiptType "RETURN|EXCHANGE"
        string faultByType "CUSTOMER|SELLER"
        json items "흡수된 아이템 목록"
    }
    Shipment {
        uuid id PK
        string trackingNo
        string status "ready|shipped|delivered"
    }
    UnshippedItem {
        uuid id PK
        int delayDays
        bool isNotified
    }
    Settlement {
        uuid id PK
        string period "YYYY-MM"
        int expectedAmount
        int actualAmount
    }

    Company ||--o{ Order : ""
    Company ||--o{ CoupangOrder : ""
    Company ||--o{ CoupangReturn : ""
    Company ||--o{ Shipment : ""
    Company ||--o{ Settlement : ""
    Product ||--o{ Order : ""
    CoupangOrder ||--o{ CoupangOrderItem : "주문 상품"
    Order ||--o{ Shipment : "배송"
    Product ||--o{ UnshippedItem : "미출고"
```

**핵심 포인트:**
- `CoupangReturn.items` — Json 배열로 반품 아이템 흡수 (별도 테이블 없음)
- `Settlement` — 월별 정산 (예상 vs 실제 비교)
- `Order` vs `CoupangOrder` — 내부 주문 vs 쿠팡 API 원본

---

## 3. 재고/물류

> 입출고, 창고 간 이동, 재고 실사, 피킹, 반품 재입고.

```mermaid
erDiagram
    Inventory {
        uuid id PK
        uuid productId UK
        int currentStock
        int reservedStock
        int safetyStock
        int reorderPoint
    }
    Warehouse {
        uuid id PK
        string name
        bool isDefault
    }
    StockTransfer {
        uuid id PK
        int quantity
        string status "pending|completed"
    }
    StockTransaction {
        uuid id PK
        string type "inbound|outbound|adjust"
        int quantity
        int totalCost
    }
    StockAudit {
        uuid id PK
        string auditNumber
        int matchedCount
        int diffCount
    }
    PickingList {
        uuid id PK
        string listNumber
        int totalItems
        int pickedItems
    }
    PickingItem {
        uuid id PK
        bool isPicked
        bool isVerified
    }
    ReturnTransfer {
        uuid id PK
        string rtNumber
        string condition "good|damaged"
        int restockedQty
    }
    BundleProduct {
        uuid id PK
        string name
        json items "구성품 목록"
    }
    ProductItem {
        uuid id PK
        string vendorItemId
        int salePrice
    }

    Product ||--|| Inventory : "1:1 재고"
    Product ||--o{ StockTransaction : ""
    Product ||--o{ ReturnTransfer : ""
    Product ||--o{ ProductItem : "옵션"
    Warehouse ||--o{ StockTransaction : ""
    Warehouse ||--o{ StockTransfer : "출발"
    Warehouse ||--o{ StockTransfer : "도착"
    PickingList ||--o{ PickingItem : ""
```

**핵심 포인트:**
- `Inventory` — Product와 1:1 (`productId` unique)
- `BundleProduct.items` — Json으로 구성품 흡수 (별도 BundleItem 없음)
- `StockTransfer` — 창고 간 이동 (from → to warehouse)

---

## 4. 구매/공급

> 중국 소싱 → 발주 → 입고 검수 → 공급가 결제.

```mermaid
erDiagram
    Supplier {
        uuid id PK
        string name
        int leadTimeDays
        string status "active|inactive"
    }
    SupplierProduct {
        uuid id PK
        int supplyPrice
        bool isMain
    }
    SupplierPayment {
        uuid id PK
        int amount
        int paidAmount
        string status "unpaid|paid"
    }
    PurchaseOrder {
        uuid id PK
        decimal totalAmountCny "CNY"
        string status "draft|ordered|received"
    }
    PurchaseOrderItem {
        uuid id PK
        int quantity
        decimal unitPriceCny "CNY"
    }

    Company ||--o{ Supplier : ""
    Supplier ||--o{ SupplierProduct : ""
    Supplier ||--o{ PurchaseOrder : ""
    Supplier ||--o{ SupplierPayment : ""
    Product ||--o{ SupplierProduct : ""
    PurchaseOrder ||--o{ PurchaseOrderItem : ""
    PurchaseOrder ||--o{ SupplierPayment : ""
    Product ||--o{ PurchaseOrderItem : ""
```

**핵심 포인트:**
- 금액 단위: 발주는 CNY (`Decimal(12,2)`), 국내는 KRW (`Int`)
- `SupplierProduct` — 공급사별 상품 공급가 관리
- `PurchaseOrder` — 입고 검수 필드 포함 (receivedQty, defectQty)

---

## 5. 광고/마케팅

> 익스텐션 데이터 수집 → DB 저장 → AI 전략 분석 → 액션 실행.

```mermaid
erDiagram
    Ad {
        uuid id PK
        int spend "원"
        int clicks
        int conversions
        int revenue "원"
        string keyword
        date date "일별"
    }
    AdSnapshot {
        uuid id PK
        string source "advertising|wing"
        string level "campaign|product|null"
        string campaignName
        json rawJson "원본 데이터"
    }
    AdAction {
        uuid id PK
        string actionType "pause_keyword|change_bid|..."
        string status "pending|approved|executed"
    }
    ExecutionWorker {
        uuid id PK
        string status "idle|busy"
    }
    ExecutionTask {
        uuid id PK
        string status "pending|running|done|failed"
    }
    ExecutionLog {
        uuid id PK
        string result
    }
    ItemWinner {
        uuid id PK
        bool isWinner
        int myPrice
        int winnerPrice
    }
    ScrapeTarget {
        uuid id PK
        string url
        string label
    }
    TrafficStats {
        uuid id PK
        int periodDays "7|14|30"
        int revenue
        int pageViews
    }

    Product ||--o{ Ad : "일별 광고 데이터"
    Product ||--o{ AdSnapshot : ""
    Product ||--o{ ItemWinner : "아이템위너"
    Product ||--o{ TrafficStats : "트래픽"
    Product ||--o{ AdAction : ""
    AdSnapshot ||--o{ AdAction : ""
    AdAction ||--o{ ExecutionTask : "실행"
    ExecutionWorker ||--o{ ExecutionTask : "워커"
    ExecutionTask ||--o{ ExecutionLog : "로그"
```

**핵심 포인트:**
- `Ad` — 상품×날짜별 광고 성과 (groupBy로 집계)
- `AdSnapshot` — 익스텐션이 수집한 raw 데이터. `level`로 구분 (campaign/product/null)
- `AdAction` → `ExecutionTask` → `ExecutionLog` — 광고 액션 자동 실행 파이프라인
- `ItemWinner` — 아이템위너 현황 (Wing 데이터)

---

## 6. 재무/분석

> 상품별 월간 손익, 가공비, 수기 장부, 리뷰, 등급 이력.

```mermaid
erDiagram
    ProfitLoss {
        uuid id PK
        int year
        int month
        int revenue "원"
        int cogs "원가"
        int adCost "광고비"
        int netProfit "순이익"
        decimal profitRate "수익률"
    }
    ProcessingCost {
        uuid id PK
        string processType
        int unitCost
        int totalCost
    }
    ManualLedger {
        uuid id PK
        string type "수입|지출"
        string category
        int amount
    }
    SalesPlan {
        uuid id PK
        string period "YYYY-MM"
        int targetRevenue
        int actualRevenue
    }
    Review {
        uuid id PK
        int rating "1-5"
        string content
    }
    GradeHistory {
        uuid id PK
        string grade "변경된 등급"
        string reason
    }
    CSRecord {
        uuid id PK
        string csType "교환|반품|문의"
        string csStatus "접수|처리중|완료"
    }

    Product ||--o{ ProfitLoss : "월별 손익"
    Product ||--o{ ProcessingCost : ""
    Product ||--o{ Review : ""
    Product ||--o{ GradeHistory : "등급 변경"
    Company ||--o{ ManualLedger : ""
    Company ||--o{ SalesPlan : ""
    Company ||--o{ CSRecord : ""
```

**핵심 포인트:**
- `ProfitLoss` — companyId+productId+year+month unique (월간 손익)
- `GradeHistory` — ABC 등급 변경 추적
- `ManualLedger` — 자동 집계 외 수기 수입/지출

---

## 7. AI/썸네일

> 상품 썸네일 AI 분석 (Gemini Vision) → 재생성 (Imagen 3.0) → 적용.

```mermaid
erDiagram
    Thumbnail {
        uuid id PK
        string imageUrl
        string strategy "standard|optimized"
        decimal ctr "클릭률"
        int impressions
        int clicks
    }
    ThumbnailAnalysis {
        uuid id PK
        uuid productId UK "1:1"
        int overallScore "0-100"
        string grade "S|A|B|C|F"
        json scores "5차원 점수"
        json issues "문제점"
        json suggestions "개선안"
        string method "ai|rule"
    }
    ThumbnailGeneration {
        uuid id PK
        json candidates "3장 후보 URL"
        string selectedUrl "선택된 후보"
        string status "pending|generating|ready|applied|skipped"
    }
    ContentGeneration {
        uuid id PK
        string generatedTitle
        string generatedDescription
        string detailPageHtml
        string status "PENDING|DONE"
    }

    Product ||--o{ Thumbnail : "CTR 추적"
    Product ||--|| ThumbnailAnalysis : "AI 분석 1:1"
    Product ||--o{ ThumbnailGeneration : "재생성"
    Product ||--o{ ContentGeneration : "콘텐츠 생성"
```

**핵심 포인트:**
- `ThumbnailAnalysis.scores` — 5차원: guideline(25), heroShot(20), composition(20), branding(15), mobile(20)
- `ThumbnailGeneration` 상태 흐름: pending → generating → ready → applied/skipped
- `Thumbnail` vs `ThumbnailAnalysis` — CTR 기반 vs AI 기반 (별도 시스템)

---

## 8. 에이전트/워크플로우

> AI 에이전트 정의 → 하트비트 실행 → 태스크 처리 → 로그.

```mermaid
erDiagram
    AgentDefinition {
        uuid id PK
        string name
        string type UK "ad_strategy|..."
        string adapterType "claude_local|python_http"
        string role "manager|specialist"
        string status "idle|running|paused"
        int trustLevel "0-3"
    }
    HeartbeatRun {
        uuid id PK
        string status "queued|running|succeeded|failed"
        json resultJson "실행 결과"
        json usageJson "토큰 사용량"
    }
    AgentTask {
        uuid id PK
        string agentType
        string status "pending|running|done|failed"
        json input
        json output
    }
    AgentLog {
        uuid id PK
        string level "info|warn|error"
        string message
    }
    AgentWakeupRequest {
        uuid id PK
        string source "schedule|event|manual"
        string status "queued|claimed|done"
    }
    AgentEvent {
        uuid id PK
        string eventType "permission_denied|action_snapshot"
        string category "dangerous_tool|budget_exceeded"
    }
    WorkflowTemplate {
        uuid id PK
        string name
        string triggerType "manual|schedule|event"
        json nodesJson "노드 정의"
        json edgesJson "연결 정의"
    }
    WorkflowRun {
        uuid id PK
        string status "pending|running|done|failed"
        json steps "실행 단계 (흡수)"
    }

    Company ||--o{ AgentDefinition : ""
    AgentDefinition ||--o{ HeartbeatRun : "실행"
    AgentDefinition ||--o{ AgentWakeupRequest : "깨우기"
    AgentDefinition ||--o{ AgentEvent : "이벤트"
    AgentDefinition ||--o{ AgentDefinition : "계층 (reportsTo)"
    AgentTask ||--o{ AgentLog : "로그"
    WorkflowTemplate ||--o{ WorkflowRun : "실행"
    AgentWakeupRequest ||--o{ HeartbeatRun : "트리거"
```

**핵심 포인트:**
- `AgentDefinition` — 런타임 상태(`rt_*` 필드)를 직접 보유 (별도 테이블 없음)
- `AgentDefinition` 계층 — `reportsTo` 자기참조 (매니저→전문가 조직도)
- `WorkflowRun.steps` — Json으로 단계별 결과 흡수 (별도 StepRun 없음)
- `AgentEvent.eventType` — `permission_denied`(권한 거부) / `action_snapshot`(변경 스냅샷) 통합

---

## 9. 시스템/설정

> 알림, 활동 로그, 피처 게이트, 비즈니스 룰, 마켓플레이스.

```mermaid
erDiagram
    Alert {
        uuid id PK
        string type
        string severity "warning|critical|info"
        bool isRead
    }
    ActivityEvent {
        uuid id PK
        string objectType "product|order|..."
        string eventType "created|updated|..."
        json data
    }
    FeatureGate {
        uuid id PK
        string name UK
        bool enabled
    }
    SystemSetting {
        uuid id PK
        string key UK
        json value
    }
    BusinessRule {
        uuid id PK
        string name
        string ruleType
        json conditions
        json actions
    }
    Marketplace {
        uuid id PK
        string name
        string type "agent|workflow"
        bool isPublished
    }
    CategoryMapping {
        uuid id PK
        string internalCategory
        string coupangCategoryId
    }
    ActionTask {
        uuid id PK
        string title
        string status "todo|done"
        string priority "urgent|high|medium|low"
    }

    Company ||--o{ Alert : ""
    Company ||--o{ ActivityEvent : ""
    Company ||--o{ SystemSetting : ""
    Company ||--o{ BusinessRule : ""
    Company ||--o{ ActionTask : "액션 보드"
    Product ||--o{ Alert : ""
    Marketplace ||--o{ AgentDefinition : ""
    Marketplace ||--o{ WorkflowTemplate : ""
```

**핵심 포인트:**
- `Marketplace` — `type`으로 에이전트/워크플로우 마켓플레이스 통합
- `BusinessRule` — 온톨로지 룰 엔진 (조건→액션 자동화)
- `ActionTask` — 액션 보드 (수동 할일 관리)
- `FeatureGate` — Claude Code 스타일 피처 플래그
