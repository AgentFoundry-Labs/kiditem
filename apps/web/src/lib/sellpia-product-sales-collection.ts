import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import type {
  SellpiaProductSalesIngestPayload,
  SellpiaProductStockIngestPayload,
} from '@kiditem/shared/dashboard';

// Sellpia 상품별 이익현황(stat_prd_profit) 월별 소진 수집 브릿지.
// 확장이 셀피아 로그인 세션으로 스크랩 → 웹앱이 payload 를 백엔드로 POST.

interface CollectResponse {
  success?: boolean;
  payload?: SellpiaProductSalesIngestPayload;
  productCount?: number;
  error?: string;
}

const REQUIRED_CAPABILITY = 'collectSellpiaProductProfit';

async function detectExtensionId(): Promise<string> {
  const exact = await detectOrderCollectionExtensionId(1200, REQUIRED_CAPABILITY);
  if (exact) return exact;
  const compatible = await detectOrderCollectionExtensionId();
  if (compatible) return compatible;
  throw new Error(
    '주문수집 확장프로그램을 찾지 못했습니다. extensions/order-collector 를 Chrome 에 로드/새로고침하고 kiditem.sellpia.com 에 로그인한 뒤 다시 시도해주세요.',
  );
}

// 확장을 통해 셀피아 상품별 이익현황(월별 소진)을 스크랩한다.
export async function collectSellpiaProductProfitFromExtension(): Promise<SellpiaProductSalesIngestPayload> {
  const extensionId = await detectExtensionId();
  const res = await sendToExtension<CollectResponse>(
    extensionId,
    { action: 'collectSellpiaProductProfit' },
    120000,
  );
  if (!res) {
    throw new Error(
      '확장이 상품별 소진 수집에 응답하지 않았습니다. Chrome 확장 관리에서 order-collector 를 새로고침해주세요.',
    );
  }
  if (!res.success || !res.payload) {
    throw new Error(res.error ?? '셀피아 상품별 소진 수집에 실패했습니다.');
  }
  return res.payload;
}

interface StockCollectResponse {
  success?: boolean;
  payload?: SellpiaProductStockIngestPayload;
  itemCount?: number;
  error?: string;
}

// 확장을 통해 셀피아 통합 재고현황(현재고)을 스크랩한다.
export async function collectSellpiaProductStockFromExtension(): Promise<SellpiaProductStockIngestPayload> {
  const extensionId = await detectExtensionId();
  const res = await sendToExtension<StockCollectResponse>(
    extensionId,
    { action: 'collectSellpiaProductStock' },
    120000,
  );
  if (!res) {
    throw new Error(
      '확장이 재고 수집에 응답하지 않았습니다. Chrome 확장 관리에서 order-collector 를 새로고침해주세요.',
    );
  }
  if (!res.success || !res.payload) {
    throw new Error(res.error ?? '셀피아 재고 수집에 실패했습니다.');
  }
  return res.payload;
}
