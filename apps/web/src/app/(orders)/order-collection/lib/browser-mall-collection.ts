import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import {
  collectIcecreamMallRowsFromExtension,
  ensureMallLoggedInViaExtension,
} from './order-collection-extension';
import {
  orderMallAccountApi,
  type OrderCollectionMallAccount,
} from './order-mall-account-api';
import {
  ICECREAM_MALL_KEY,
  isBrowserCollectableMall,
  todayYmd,
  type ConversionHistoryItem,
} from './order-collection-page-model';
import { saveIcecreamDeliveryIndex } from './icecream-delivery-index';
import { addSeenOrderKeys, distinctOrderNumbers, rowKeysOf } from './order-detect';
import type { CoupangDirectPo, CoupangTransport } from './coupang-directship-api';

export interface BrowserMallCollectionResult {
  rowCount: number;
  masked: boolean;
  date: string | null;
}

interface BrowserMallCollectorOptions {
  mallAccounts: OrderCollectionMallAccount[];
  addGeneratedFile: (historyItem: ConversionHistoryItem) => void;
  setPreviewId: (id: string) => void;
}

export function createBrowserMallCollector({
  mallAccounts,
  addGeneratedFile,
  setPreviewId,
}: BrowserMallCollectorOptions) {
  const addBrowserGeneratedFile = (historyItem: ConversionHistoryItem) => {
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);
  };

  const tryLoadMallCredentials = async (
    mallKey: string,
  ): Promise<{ loginId: string; password: string } | null> => {
    try {
      const account = mallAccounts.find((a) => a.key === mallKey);
      if (!account?.loginId || !account.hasPassword) return null;
      const { password } = await orderMallAccountApi.password(mallKey);
      return password ? { loginId: account.loginId, password } : null;
    } catch {
      return null;
    }
  };

  const ensureMallLogin = async (mallKey: string): Promise<void> => {
    const credentials = await tryLoadMallCredentials(mallKey);
    if (credentials) await ensureMallLoggedInViaExtension(mallKey, credentials);
  };

  const generateKidsnoteSellpia = async (): Promise<number> => {
    const { collectKidsnoteOrdersFromExtension, convertKidsnoteToSellpiaFile } = await import(
      './kidsnote-orders-api'
    );
    const today = todayYmd();
    await ensureMallLogin('kidsnote');
    const { orders } = await collectKidsnoteOrdersFromExtension(today, today, '', true);
    if (!orders.length) {
      toast.error('오늘 키즈노트 주문이 없습니다.');
      return 0;
    }
    const result = await convertKidsnoteToSellpiaFile(orders);
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-kidsnote-browser`,
      sourceName: `키즈노트 주문 (${formatNumber(orders.length)}건)`,
      convertedAt,
      collectionDate: today,
      collectionMode: 'browser',
      collectedRows: orders.length,
      mallKey: 'kidsnote',
      mallName: '키즈노트',
    });
    return orders.length;
  };

  const generateKkomangseSellpia = async (): Promise<number> => {
    const { collectKkomangseXlsxFromExtension, convertKkomangseToSellpiaFile } = await import(
      './kkomangse-orders-api'
    );
    await ensureMallLogin('kkomangse');
    const xlsxBase64 = await collectKkomangseXlsxFromExtension();
    let result: Awaited<ReturnType<typeof convertKkomangseToSellpiaFile>>;
    try {
      result = await convertKkomangseToSellpiaFile(xlsxBase64, { date: todayYmd() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/주문이 없|없습니다/.test(msg)) {
        toast('오늘 꼬망세 신규 주문이 없습니다.');
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-kkomangse-browser`,
      sourceName: `꼬망세 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'kkomangse',
      mallName: '꼬망세',
    });
    return rows;
  };

  const generateDomeggookSellpia = async (): Promise<number> => {
    const { collectDomeggookCsvFromExtension, convertDomeggookCsvBase64 } = await import(
      './domeggook-orders-api'
    );
    const collectDate = todayYmd();
    await ensureMallLogin('domeggook');
    const { csvBase64, fileName } = await collectDomeggookCsvFromExtension(collectDate);
    let result: Awaited<ReturnType<typeof convertDomeggookCsvBase64>>;
    try {
      result = await convertDomeggookCsvBase64(csvBase64, fileName, {
        date: collectDate,
        download: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/주문이 없|없습니다/.test(msg)) {
        toast(`${collectDate} 도매꾹 주문이 없습니다.`);
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-domeggook-browser`,
      sourceName: `도매꾹 주문 ${collectDate} (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: collectDate,
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'domeggook',
      mallName: '도매꾹',
    });
    return rows;
  };

  const generateKidkidsSellpia = async (): Promise<number> => {
    const { collectKidkidsOrdersFromExtension, convertKidkidsToSellpiaFile } = await import(
      './kidkids-orders-api'
    );
    await ensureMallLogin('kidkids');
    const orders = await collectKidkidsOrdersFromExtension();
    if (orders.length === 0) {
      toast(
        '출고예정일이 지정된 키드키즈 주문이 없습니다. (출고관리에서 출고예정일을 먼저 지정하세요. 이미 출고처리한 주문은 목록에서 빠집니다.)',
      );
      return 0;
    }
    const result = await convertKidkidsToSellpiaFile(orders, { download: false });
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-kidkids-browser`,
      sourceName: `키드키즈 주문 (${formatNumber(orders.length)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'kidkids',
      mallName: '키드키즈',
    });
    return rows;
  };

  const generateLotteonSellpia = async (): Promise<number> => {
    const { collectLotteonXlsxFromExtension, convertLotteonToSellpiaFile } = await import(
      './lotteon-orders-api'
    );
    const { xlsxBase64, fileName } = await collectLotteonXlsxFromExtension();
    let result: Awaited<ReturnType<typeof convertLotteonToSellpiaFile>>;
    try {
      result = await convertLotteonToSellpiaFile(xlsxBase64, fileName, { download: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/주문이 없|없습니다/.test(msg)) {
        toast('롯데ON 신규 주문이 없습니다.');
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-lotte-on-browser`,
      sourceName: `롯데ON 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'lotte-on',
      mallName: '롯데ON',
    });
    return rows;
  };

  const generateGsshopSellpia = async (): Promise<number> => {
    const { collectGsshopXlsxFromExtension, convertGsshopToSellpiaFile } = await import(
      './gsshop-orders-api'
    );
    const collected = await collectGsshopXlsxFromExtension();
    if ('empty' in collected) {
      toast('GS샵 신규 주문이 없습니다.');
      return 0;
    }
    let result: Awaited<ReturnType<typeof convertGsshopToSellpiaFile>>;
    try {
      result = await convertGsshopToSellpiaFile(collected.xlsxBase64, collected.fileName, {
        download: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/주문이 없|없습니다/.test(msg)) {
        toast('GS샵 신규 주문이 없습니다.');
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-gs-shop-browser`,
      sourceName: `GS샵 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'gs-shop',
      mallName: 'GS샵',
    });
    return rows;
  };

  const generateAlwayzSellpia = async (): Promise<number> => {
    const { collectAlwayzXlsxFromExtension, convertAlwayzToSellpiaFile } = await import(
      './alwayz-orders-api'
    );
    await ensureMallLogin('always');
    const collected = await collectAlwayzXlsxFromExtension();
    if ('empty' in collected) {
      toast('올웨이즈 신규 주문이 없습니다.');
      return 0;
    }
    let result: Awaited<ReturnType<typeof convertAlwayzToSellpiaFile>>;
    try {
      result = await convertAlwayzToSellpiaFile(collected.xlsxBase64, collected.fileName, {
        download: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/주문이 없|없습니다/.test(msg)) {
        toast('올웨이즈 신규 주문이 없습니다.');
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-always-browser`,
      sourceName: `올웨이즈 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'always',
      mallName: '올웨이즈',
    });
    return rows;
  };

  const generateBoriboriSellpia = async (): Promise<number> => {
    const { collectBoriboriXlsxFromExtension, convertBoriboriToSellpiaFile } = await import(
      './boribori-orders-api'
    );
    const { xlsxBase64, fileName } = await collectBoriboriXlsxFromExtension();
    let result: Awaited<ReturnType<typeof convertBoriboriToSellpiaFile>>;
    try {
      result = await convertBoriboriToSellpiaFile(xlsxBase64, fileName, { download: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/주문이 없|없습니다/.test(msg)) {
        toast('출고대기 보리보리 신규 주문이 없습니다.');
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-boribori-browser`,
      sourceName: `보리보리 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'boribori',
      mallName: '보리보리',
    });
    return rows;
  };

  const generateTeachervilleSellpia = async (): Promise<number> => {
    const { collectTeachervilleXlsxFromExtension, convertTeachervilleToSellpiaFile } = await import(
      './teacherville-orders-api'
    );
    const { xlsxBase64, fileName } = await collectTeachervilleXlsxFromExtension();
    let result: Awaited<ReturnType<typeof convertTeachervilleToSellpiaFile>>;
    try {
      result = await convertTeachervilleToSellpiaFile(xlsxBase64, fileName, { download: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/주문이 없|없습니다/.test(msg)) {
        toast('출고 전 티쳐몰 신규 주문이 없습니다.');
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-teacher-mall-browser`,
      sourceName: `티쳐몰 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'teacher-mall',
      mallName: '티쳐몰',
    });
    return rows;
  };

  const generateArt09Csv = async (): Promise<number> => {
    const { collectArt09CsvFromExtension } = await import('./art09-orders-api');
    await ensureMallLogin('art09');
    const result = await collectArt09CsvFromExtension({ download: false });
    const rows = result.outputRows ?? 0;
    if (rows === 0) {
      toast('아트공구 수집 대상 주문이 없습니다.');
      return 0;
    }

    const orderCount = result.orderNumbers.length || result.sourceRows || rows;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-art09-browser`,
      sourceName: `아트공구 주문 (${formatNumber(orderCount)}건 · ${formatNumber(rows)}품목)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser',
      collectedRows: orderCount,
      mallKey: 'art09',
      mallName: '아트공구',
      orderNumbers: result.orderNumbers,
    });
    return orderCount;
  };

  const generateCoupangDirectSellpia = async (): Promise<number> => {
    const {
      COUPANG_TRANSPORT_LABEL,
      collectCoupangDirectFromExtension,
      convertCoupangDirectToSellpiaFile,
    } = await import('./coupang-directship-api');
    const data = await collectCoupangDirectFromExtension();
    if (data.pos.length === 0) {
      toast('발주확정 쿠팡직배송 신규 발주가 없습니다.');
      return 0;
    }
    const transports: CoupangTransport[] = ['SHIPMENT', 'MILKRUN'];
    let totalOrders = 0;
    let lastId: string | null = null;
    for (const transport of transports) {
      const matchingPos = data.pos.filter((po) => String(po.transport ?? '').toUpperCase() === transport);
      if (matchingPos.length === 0) continue;
      const result = await convertCoupangDirectToSellpiaFile(data, transport, { download: false });
      const itemRows = result.outputRows ?? 0;
      const orderNumbers = coupangDirectOrderNumbers(matchingPos);
      const poCount = orderNumbers.length || result.sourceRows || matchingPos.length;
      totalOrders += poCount;
      const convertedAt = Date.now();
      const label = COUPANG_TRANSPORT_LABEL[transport];
      const historyItem = {
        ...result,
        id: `${convertedAt}-coupang-direct-${transport.toLowerCase()}-browser`,
        sourceName: `쿠팡직배송 ${label} (${formatNumber(poCount)}건 · ${formatNumber(itemRows)}품목)`,
        convertedAt,
        collectionDate: todayYmd(),
        collectionMode: 'browser' as const,
        collectedRows: poCount,
        mallKey: 'coupang-direct',
        mallName: `쿠팡직배송 ${label}`,
        orderNumbers,
      };
      addGeneratedFile(historyItem);
      lastId = historyItem.id;
    }
    if (lastId) setPreviewId(lastId);
    return totalOrders;
  };

  const generateOnchannelSellpia = async (): Promise<number> => {
    const { collectOnchannelOrdersFromExtension, convertOnchannelToSellpiaFile } = await import(
      './onchannel-orders-api'
    );
    await ensureMallLogin('onch');
    const orders = await collectOnchannelOrdersFromExtension(todayYmd());
    if (orders.length === 0) {
      toast('오늘 온채널 신규 주문이 없습니다.');
      return 0;
    }
    const result = await convertOnchannelToSellpiaFile(orders);
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-onch-browser`,
      sourceName: `온채널 주문 (${formatNumber(orders.length)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'onch',
      mallName: '온채널',
    });
    return rows;
  };

  const generateKakaoSellpia = async (): Promise<number> => {
    const { collectKakaoOrdersFromExtension, convertKakaoToSellpiaFile } = await import(
      './kakao-orders-api'
    );
    const orders = await collectKakaoOrdersFromExtension();
    if (orders.length === 0) {
      toast('배송준비중인 카카오 주문이 없습니다.');
      return 0;
    }
    const result = await convertKakaoToSellpiaFile(orders);
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-kakao-browser`,
      sourceName: `카카오 배송준비중 주문 (${formatNumber(orders.length)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser',
      collectedRows: rows,
      mallKey: 'kakao',
      mallName: '카카오',
    });
    return rows;
  };

  return async function collectBrowserMall(
    account: OrderCollectionMallAccount,
  ): Promise<BrowserMallCollectionResult> {
    const today = todayYmd();
    if (account.key === 'kidsnote') return resultFor(await generateKidsnoteSellpia(), today);
    if (account.key === 'kkomangse') return resultFor(await generateKkomangseSellpia(), today);
    if (account.key === 'onch') return resultFor(await generateOnchannelSellpia(), today);
    if (account.key === 'kakao') return resultFor(await generateKakaoSellpia(), today);
    if (account.key === 'domeggook') return resultFor(await generateDomeggookSellpia(), today);
    if (account.key === 'kidkids') return resultFor(await generateKidkidsSellpia(), today);
    if (account.key === 'lotte-on') return resultFor(await generateLotteonSellpia(), today);
    if (account.key === 'gs-shop') return resultFor(await generateGsshopSellpia(), today);
    if (account.key === 'always') return resultFor(await generateAlwayzSellpia(), today);
    if (account.key === 'boribori') return resultFor(await generateBoriboriSellpia(), today);
    if (account.key === 'coupang-direct') return resultFor(await generateCoupangDirectSellpia(), today);
    if (account.key === 'teacher-mall') return resultFor(await generateTeachervilleSellpia(), today);
    if (account.key === 'art09') return resultFor(await generateArt09Csv(), today);
    if (!isBrowserCollectableMall(account)) {
      throw new Error(`${account.name} 자동 수집은 준비 중입니다.`);
    }

    const credentials = await loadMallLoginCredentials(account);
    const collected = await collectIcecreamMallRowsFromExtension(todayYmd(), credentials);
    saveIcecreamDeliveryIndex(collected.headers, collected.rows);
    const { convertIcecreamMallOrderRows } = await import('./order-collection-api');
    const result = await convertIcecreamMallOrderRows({
      headers: collected.headers,
      rows: collected.rows,
      fileName: `아이스크림몰_${collected.date ?? todayYmd()}_브라우저수집`,
    });
    const convertedAt = Date.now();
    addBrowserGeneratedFile({
      ...result,
      id: `${convertedAt}-${account.key}-browser`,
      sourceName: `${account.name} 브라우저 수집 (${formatNumber(collected.rowCount)}행)`,
      convertedAt,
      collectionDate: collected.date ?? todayYmd(),
      collectionMode: 'browser',
      collectedRows: collected.rowCount,
      mallKey: account.key,
      mallName: account.name,
      orderNumbers: distinctOrderNumbers(collected.headers, collected.rows),
    });
    addSeenOrderKeys(account.key, rowKeysOf(collected.rows));

    return {
      rowCount: collected.rowCount,
      masked: collected.masked,
      date: collected.date,
    };
  };
}

function resultFor(rowCount: number, date: string): BrowserMallCollectionResult {
  return {
    rowCount,
    masked: false,
    date,
  };
}

function coupangDirectOrderNumbers(pos: CoupangDirectPo[]): string[] {
  const numbers = new Set<string>();
  for (const po of pos) {
    const seq = String(po.seq ?? '').trim();
    if (seq) numbers.add(seq);
  }
  return [...numbers];
}

async function loadMallLoginCredentials(account: OrderCollectionMallAccount) {
  if (!account.loginId || !account.hasPassword) {
    throw new Error(`${account.name} 계정 ID와 비밀번호를 먼저 저장해주세요.`);
  }

  const result = await orderMallAccountApi.password(account.key);
  if (!result.password) {
    throw new Error(`${account.name} 저장된 비밀번호를 불러오지 못했습니다.`);
  }

  return {
    loginId: account.loginId,
    password: result.password,
  };
}
