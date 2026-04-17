#!/usr/bin/env python3
"""Split prisma/schema.prisma into domain-scoped files under prisma/schema/.

Run once (idempotent — overwrites prisma/schema/ and rewrites schema.prisma).

Output layout:
    prisma/
    ├── schema.prisma              # removed — generator+datasource move to schema/_config.prisma
    └── schema/
        ├── _config.prisma         # generator + datasource
        ├── 01-core.prisma         # Company, User, Product, ...
        ├── 02-orders.prisma
        ├── 03-inventory.prisma
        ├── 04-supply.prisma
        ├── 05-advertising.prisma
        ├── 06-finance.prisma
        ├── 07-ai.prisma
        ├── 08-agents.prisma
        └── 09-system.prisma

Each model gets a `/// @namespace <domain>` doc-comment prepended (prisma-markdown compatible).
Describe comments (from erd.md key points) are seeded where available; models without
a known description get no @describe (can be added manually later).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'prisma' / 'schema.prisma'
OUT_DIR = ROOT / 'prisma' / 'schema'

# ─── Domain mapping ─────────────────────────────────────────────────────────
DOMAINS = {
    '01-core': {
        'namespace': 'Core',
        'models': ['Company', 'User', 'Product', 'MasterProduct', 'MasterInventory',
                   'MasterSupplierProduct', 'OptionMaster', 'ProductItem', 'ProductMemo', 'CategoryMapping'],
    },
    '02-orders': {
        'namespace': 'Orders',
        'models': ['Order', 'CoupangOrder', 'CoupangOrderItem', 'CoupangReturn',
                   'Shipment', 'UnshippedItem', 'Settlement', 'CSRecord', 'Review'],
    },
    '03-inventory': {
        'namespace': 'Inventory',
        'models': ['Inventory', 'StockTransaction', 'StockTransfer', 'StockAudit',
                   'BundleProduct', 'Warehouse', 'PickingList', 'PickingItem', 'ReturnTransfer'],
    },
    '04-supply': {
        'namespace': 'Supply',
        'models': ['Supplier', 'SupplierProduct', 'SupplierPayment',
                   'PurchaseOrder', 'PurchaseOrderItem'],
    },
    '05-advertising': {
        'namespace': 'Advertising',
        'models': ['Ad', 'AdAction', 'AdSnapshot', 'ItemWinner', 'ScrapeTarget',
                   'TrafficStats', 'ExecutionTask', 'ExecutionLog', 'ExecutionWorker'],
    },
    '06-finance': {
        'namespace': 'Finance',
        'models': ['ProfitLoss', 'GradeHistory', 'ManualLedger', 'ProcessingCost', 'SalesPlan'],
    },
    '07-ai': {
        'namespace': 'AI',
        'models': ['Thumbnail', 'ThumbnailAnalysis', 'ThumbnailGeneration', 'ThumbnailTracking',
                   'ContentGeneration'],
    },
    '08-agents': {
        'namespace': 'Agents',
        'models': ['AgentDefinition', 'AgentTask', 'AgentEvent', 'AgentLog',
                   'AgentWakeupRequest', 'HeartbeatRun', 'WorkflowRun', 'WorkflowTemplate'],
    },
    '09-system': {
        'namespace': 'System',
        'models': ['Marketplace', 'BusinessRule', 'ActionTask', 'FeatureGate',
                   'ActivityEvent', 'Alert', 'SystemSetting'],
    },
}

# ─── Seed descriptions (from .claude/docs/erd.md "핵심 포인트" sections) ─────
# 없는 모델은 스킵. 수동으로 나중에 추가 가능.
DESCRIBE = {
    'Product':             '상품 마스터. abcGrade(매출ABC)·adTier(광고티어)·pipelineStep(소싱파이프라인) 이 광고/소싱 허브 키.',
    'User':                'human(직원) / agent(AI, agentDefinitionId 연결) / system(챗봇, companyId=null) 통합 관리.',
    'CoupangReturn':       '반품. items Json 배열로 반품 아이템 흡수 (별도 테이블 없음).',
    'Settlement':          '월별 정산 (예상 vs 실제 비교).',
    'Order':               '내부 주문. CoupangOrder(외부 원본)와 병존.',
    'Inventory':           'Product 와 1:1 (productId unique).',
    'BundleProduct':       'items Json 으로 구성품 흡수 (별도 BundleItem 없음).',
    'StockTransfer':       '창고 간 이동 (from → to warehouse).',
    'PurchaseOrder':       '발주 state machine (draft→pending→ordered→shipped→received). 입고 검수 필드 포함 (receivedQty, defectQty). 단위는 CNY(Decimal 12,2).',
    'SupplierProduct':     '공급사별 상품 공급가 관리.',
    'Ad':                  '상품×날짜별 광고 성과 (groupBy 집계).',
    'AdSnapshot':          '익스텐션이 수집한 raw 데이터. level 로 구분 (campaign|product|null).',
    'AdAction':            '광고 자동 실행 큐. AdSnapshot→AdAction→ExecutionTask→ExecutionLog 파이프라인.',
    'ItemWinner':          '아이템위너 현황 (Wing 데이터).',
    'ProfitLoss':          '월간 손익. companyId+productId+year+month unique.',
    'GradeHistory':        'ABC 등급 변경 추적.',
    'ManualLedger':        '자동 집계 외 수기 수입/지출.',
    'ThumbnailAnalysis':   '5차원 scores(heroShot·composition·branding·mobile·differentiation) + complianceGrade(PASS/WARN/FAIL) + imageSpec(사전검수). 스펙 FAIL 시 AI 호출 생략.',
    'ThumbnailGeneration': '상태: pending→generating→ready/failed→applied/skipped. method=edit 만 사용 (generate Imagen 방식 삭제됨).',
    'Thumbnail':           'CTR 기반 썸네일 트래킹 (ThumbnailAnalysis 와 별도 시스템).',
    'AgentDefinition':     '에이전트 정의. rt_* 필드로 런타임 상태 내장 (별도 테이블 없음). reportsTo 자기참조 (매니저→전문가 계층).',
    'HeartbeatRun':        '에이전트 안전 파이프라인 (Budget/Cap/DryRun). AgentDefinition 과 함께 agent runtime state 구성.',
    'AgentEvent':          'eventType 으로 permission_denied / action_snapshot 통합.',
    'WorkflowRun':         'steps Json 으로 단계별 결과 흡수 (별도 StepRun 없음).',
    'Marketplace':         'type 으로 agent/workflow 카탈로그 통합.',
    'BusinessRule':        '온톨로지 룰 엔진 (조건→액션 자동화).',
    'ActionTask':          '액션 보드 (수동 할일 관리).',
    'FeatureGate':         '피처 플래그. allowedCompanies: string[] 로 회사별 enable.',
}

# ─── Parse schema.prisma ────────────────────────────────────────────────────
def parse_schema(text):
    """Return (header_block_lines, dict[model_name -> block_lines]).

    header = generator + datasource blocks, with any leading `//` comments stripped.
    """
    lines = text.splitlines()
    header_lines = []
    model_blocks = {}
    i = 0
    n = len(lines)

    # Capture generator + datasource blocks until first model/enum
    while i < n:
        line = lines[i]
        stripped = line.strip()
        if stripped.startswith('model ') or stripped.startswith('enum '):
            break
        # Skip section-banner comments like "// ─── Companies ────"
        if stripped.startswith('//') and not stripped.startswith('///'):
            i += 1
            continue
        header_lines.append(line)
        i += 1

    # Parse model blocks with brace depth
    while i < n:
        line = lines[i]
        stripped = line.strip()
        m = re.match(r'^model\s+(\w+)\s*\{', stripped)
        if m:
            model_name = m.group(1)
            block_start = i
            # Walk back to capture any `///` doc-comments attached above
            doc_start = block_start
            j = block_start - 1
            while j >= 0:
                prev = lines[j].strip()
                if prev.startswith('///'):
                    doc_start = j
                    j -= 1
                elif prev == '':
                    # empty line breaks doc-comment chain
                    break
                else:
                    break
            # Walk forward with brace depth
            depth = 0
            block_end = i
            while i < n:
                for ch in lines[i]:
                    if ch == '{':
                        depth += 1
                    elif ch == '}':
                        depth -= 1
                block_end = i
                i += 1
                if depth == 0:
                    break
            model_blocks[model_name] = lines[doc_start:block_end + 1]
        elif stripped.startswith('enum '):
            # Skip enum blocks similarly — Kiditem ADR-0001: no PG native enums
            # But schema might still have some (e.g. Prisma-level). Preserve them in config? Rare.
            # Walk through to end of enum
            depth = 0
            while i < n:
                for ch in lines[i]:
                    if ch == '{':
                        depth += 1
                    elif ch == '}':
                        depth -= 1
                i += 1
                if depth == 0:
                    break
        else:
            i += 1

    return header_lines, model_blocks


def render_model(model_name, block_lines, namespace):
    """Inject `/// @namespace <ns>` and optional `/// @describe <text>` above the model."""
    # Find index of actual `model X {` line inside block_lines
    idx = next(
        (k for k, ln in enumerate(block_lines) if re.match(r'^model\s+' + model_name + r'\s*\{', ln.strip())),
        None,
    )
    assert idx is not None, f"Could not find model line for {model_name}"

    # Existing `///` doc-comments sit above idx — keep them.
    doc_lines = list(block_lines[:idx])
    model_lines = list(block_lines[idx:])

    # Build new doc-block: existing + namespace + describe (if known)
    new_doc = []
    if doc_lines:
        new_doc.extend(doc_lines)
    new_doc.append(f'/// @namespace {namespace}')
    if model_name in DESCRIBE:
        new_doc.append(f'/// @describe {DESCRIBE[model_name]}')

    return new_doc + model_lines


def main():
    if not SRC.exists():
        print(f"ERROR: {SRC} not found", file=sys.stderr)
        return 1

    text = SRC.read_text(encoding='utf-8')
    header_lines, model_blocks = parse_schema(text)

    # Sanity check: all models in DOMAINS must exist in schema
    claimed = {m for d in DOMAINS.values() for m in d['models']}
    actual = set(model_blocks.keys())
    missing_from_schema = claimed - actual
    unclassified = actual - claimed
    if missing_from_schema:
        print(f"ERROR: models in DOMAINS but not in schema: {sorted(missing_from_schema)}", file=sys.stderr)
        return 1
    if unclassified:
        print(f"ERROR: models in schema but unclassified: {sorted(unclassified)}", file=sys.stderr)
        return 1

    # Write output
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob('*.prisma'):
        old.unlink()

    # _config.prisma: generator + datasource
    config_text = '\n'.join(header_lines).rstrip() + '\n'
    (OUT_DIR / '_config.prisma').write_text(config_text, encoding='utf-8')

    # Per-domain files
    for filename, meta in DOMAINS.items():
        ns = meta['namespace']
        parts = [f'// {filename} — {ns} domain', '']
        for model_name in meta['models']:
            block = model_blocks[model_name]
            rendered = render_model(model_name, block, ns)
            parts.extend(rendered)
            parts.append('')  # blank line between models
        (OUT_DIR / f'{filename}.prisma').write_text('\n'.join(parts) + '\n', encoding='utf-8')

    # Remove old schema.prisma
    SRC.unlink()

    print("Split complete:")
    for filename, meta in DOMAINS.items():
        path = OUT_DIR / f'{filename}.prisma'
        lines = path.read_text().count('\n')
        print(f"  {path.relative_to(ROOT)}  ({lines} lines, {len(meta['models'])} models)")
    config_path = OUT_DIR / '_config.prisma'
    print(f"  {config_path.relative_to(ROOT)}  ({config_path.read_text().count(chr(10))} lines, generator+datasource)")
    print(f"\n  Removed: {SRC.relative_to(ROOT)}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
