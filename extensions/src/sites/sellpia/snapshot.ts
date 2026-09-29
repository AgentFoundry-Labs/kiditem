import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED } from '../../core/site-caller';
import { withFreshTab } from '../fresh-tab';
import type { TabPages } from '../tab-page';
import { orderStep, SELLPIA_ORDER_UPLOAD_URL, SELLPIA_STOCKMATCH_URL, type SellpiaPageAnswer } from './order-page';

/** 옛 스냅샷 단계 제한 시간. */
const SNAPSHOT_TIMEOUT_MS = 120_000;
const LOGIN_MESSAGE = '셀피아 주문 목록을 읽지 못했습니다. 열려 있는 셀피아 탭에서 로그인 상태를 확인해 주세요.';

export interface SellpiaSnapshotOrder {
  orderNo: string;
  receiver: string;
  provider: string;
}

/** 화면 하나의 행. 못 읽은 화면은 `rows: null`. */
export interface SellpiaSnapshotScreen {
  source: 'pending' | 'stockmatch';
  rows: SellpiaSnapshotOrder[] | null;
}

interface SnapshotAnswer extends SellpiaPageAnswer {
  rows?: SellpiaSnapshotOrder[];
}

/**
 * 셀피아 주문 스냅샷(KID-366 wave8b, 옛 `collectSellpiaOrderSnapshot`). 읽기라 운영자 탭은 건드리지 않고 백그라운드 탭을 새로
 * 열어 대기목록(주문서수집)·재고매칭 두 화면을 읽고 닫는다(누르는 것은 재고매칭 [조회]뿐). 한 화면도 못 읽으면 대체로 미로그인이라
 * `SITE_LOGIN_REQUIRED`로 멈추고 탭을 남긴다.
 */
export function createSellpiaSnapshot(tabs: TabPages) {
  return {
    orderSnapshot(): Promise<{ screens: SellpiaSnapshotScreen[] }> {
      return withFreshTab(tabs, SELLPIA_ORDER_UPLOAD_URL, async (page) => {
        const screens: SellpiaSnapshotScreen[] = [];
        for (const [index, { url, source }] of [
          { url: SELLPIA_ORDER_UPLOAD_URL, source: 'pending' as const },
          { url: SELLPIA_STOCKMATCH_URL, source: 'stockmatch' as const },
        ].entries()) {
          let rows: SellpiaSnapshotOrder[] | null = null;
          try {
            if (index > 0) await page.navigate(url, { timeoutMs: 30_000 });
            const answer = await orderStep<SnapshotAnswer>(page, 'orderSnapshot', [], SNAPSHOT_TIMEOUT_MS);
            if (answer?.success) rows = answer.rows ?? [];
          } catch {
            // 한 화면의 실패는 그 화면만 못 읽은 것이다(옛 규칙) — 둘 다 못 읽었을 때만 멈춘다.
          }
          screens.push({ source, rows });
        }
        if (screens.every((screen) => screen.rows === null)) {
          throw new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE, { url: SELLPIA_ORDER_UPLOAD_URL });
        }
        return { screens };
      });
    },
  };
}
