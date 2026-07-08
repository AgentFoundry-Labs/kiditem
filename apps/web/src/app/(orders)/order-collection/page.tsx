'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import {
  convertIcecreamMallOrderFile,
  convertIcecreamMallOrderRows,
  downloadOrderCollectionFile,
} from './lib/order-collection-api';
import {
  collectIcecreamMallRowsFromExtension,
  ensureMallLoggedInViaExtension,
  sendOrderFileToSellpiaViaExtension,
} from './lib/order-collection-extension';
import {
  orderMallAccountApi,
  type OrderCollectionMallAccount,
} from './lib/order-mall-account-api';
import {
  loadGeneratedOrderFiles,
  saveGeneratedOrderFile,
} from './lib/order-generated-file-store';
import { buildOrderCollectionSummary } from './lib/order-collection-stats';
import {
  EMPTY_MALL_DRAFT,
  ICECREAM_MALL_KEY,
  MAX_HISTORY_ITEMS,
  draftFromMallAccount,
  getOrderCount,
  groupHistoryByDay,
  isBrowserCollectableMall,
  todayYmd,
  type ConversionHistoryItem,
  type ConversionState,
  type MallAccountDraft,
} from './lib/order-collection-page-model';
import { FilePreviewSection } from './components/FilePreviewSection';
import { GeneratedFilesSection } from './components/GeneratedFilesSection';
import { MallAccountSection } from './components/MallAccountSection';
import { ManualUploadSection } from './components/ManualUploadSection';
import { OrderCollectionDailyPanel } from './components/OrderCollectionDailyPanel';
import { OrderCollectionFlow } from './components/OrderCollectionFlow';
import {
  collectKidsnoteOrdersFromExtension,
  convertKidsnoteToSellpiaFile,
} from './lib/kidsnote-orders-api';
import {
  collectKkomangseXlsxFromExtension,
  convertKkomangseToSellpiaFile,
} from './lib/kkomangse-orders-api';
import {
  collectOnchannelOrdersFromExtension,
  convertOnchannelToSellpiaFile,
} from './lib/onchannel-orders-api';
import {
  collectDomeggookCsvFromExtension,
  convertDomeggookCsvBase64,
} from './lib/domeggook-orders-api';
import {
  collectKidkidsOrdersFromExtension,
  convertKidkidsToSellpiaFile,
} from './lib/kidkids-orders-api';
import {
  collectLotteonXlsxFromExtension,
  convertLotteonToSellpiaFile,
} from './lib/lotteon-orders-api';
import {
  collectGsshopXlsxFromExtension,
  convertGsshopToSellpiaFile,
} from './lib/gsshop-orders-api';
import {
  collectAlwayzXlsxFromExtension,
  convertAlwayzToSellpiaFile,
} from './lib/alwayz-orders-api';
import {
  collectBoriboriXlsxFromExtension,
  convertBoriboriToSellpiaFile,
} from './lib/boribori-orders-api';
import {
  COUPANG_TRANSPORT_LABEL,
  collectCoupangDirectFromExtension,
  convertCoupangDirectToSellpiaFile,
  type CoupangDirectPo,
  type CoupangTransport,
} from './lib/coupang-directship-api';
import {
  collectTeachervilleXlsxFromExtension,
  convertTeachervilleToSellpiaFile,
} from './lib/teacherville-orders-api';
import { collectArt09CsvFromExtension } from './lib/art09-orders-api';

export default function OrderCollectionPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [state, setState] = useState<ConversionState>('idle');
  const [dragActive, setDragActive] = useState(false);
  const [history, setHistory] = useState<ConversionHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filePassword, setFilePassword] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [mallAccounts, setMallAccounts] = useState<OrderCollectionMallAccount[]>([]);
  const [mallLoading, setMallLoading] = useState(true);
  const [mallSaving, setMallSaving] = useState(false);
  const [browserCollecting, setBrowserCollecting] = useState(false);
  const [collectingMallKey, setCollectingMallKey] = useState<string | null>(null);
  const [mallError, setMallError] = useState<string | null>(null);
  const [selectedMallKey, setSelectedMallKey] = useState<string | null>(ICECREAM_MALL_KEY);
  const [mallDraft, setMallDraft] = useState<MallAccountDraft>(EMPTY_MALL_DRAFT);
  const [mallSettingsOpen, setMallSettingsOpen] = useState(false);
  const [mallPasswordLoading, setMallPasswordLoading] = useState(false);
  const [mallPasswordVisible, setMallPasswordVisible] = useState(false);
  const [sellpiaSendingId, setSellpiaSendingId] = useState<string | null>(null);

  const canConvert = selectedFile !== null && state !== 'converting';
  const lastResult = history[0] ?? null;
  const previewItem = previewId ? history.find((item) => item.id === previewId) ?? null : null;
  const defaultMall =
    mallAccounts.find((account) => account.key === ICECREAM_MALL_KEY) ?? mallAccounts[0] ?? null;
  const selectedMall =
    mallAccounts.find((account) => account.key === selectedMallKey) ?? defaultMall;
  const configuredMallCount = mallAccounts.filter((account) => account.configured).length;
  const enabledMallCount = mallAccounts.filter(
    (account) => account.enabled && isBrowserCollectableMall(account),
  ).length;
  const lastOrderCount = getOrderCount(lastResult);

  const generatedFileGroups = useMemo(() => groupHistoryByDay(history), [history]);
  const orderCollectionSummary = useMemo(() => buildOrderCollectionSummary(history), [history]);

  const loadMallAccounts = async () => {
    setMallLoading(true);
    setMallError(null);
    try {
      const accounts = await orderMallAccountApi.list();
      setMallAccounts(accounts);
      setSelectedMallKey(
        (current) =>
          current ?? accounts.find((account) => account.key === ICECREAM_MALL_KEY)?.key ?? accounts[0]?.key ?? null,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '몰 계정을 불러오지 못했습니다.';
      setMallError(message);
    } finally {
      setMallLoading(false);
    }
  };

  useEffect(() => {
    void loadMallAccounts();
  }, []);

  useEffect(() => {
    let active = true;
    loadGeneratedOrderFiles()
      .then((files) => {
        if (active) setHistory(files);
      })
      .catch(() => {
        if (active) setHistory([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setMallDraft(selectedMall ? draftFromMallAccount(selectedMall) : EMPTY_MALL_DRAFT);
  }, [selectedMall?.key, selectedMall?.loginId, selectedMall?.siteUrl, selectedMall?.memo, selectedMall?.enabled]);

  const selectFile = (file: File | null) => {
    setSelectedFile(file);
    setError(null);
    setState(file ? 'ready' : 'idle');
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectFile(event.target.files?.[0] ?? null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    selectFile(event.dataTransfer.files?.[0] ?? null);
  };

  const addGeneratedFile = (historyItem: ConversionHistoryItem) => {
    setHistory((prev) => [
      historyItem,
      ...prev.filter((item) => item.id !== historyItem.id).slice(0, MAX_HISTORY_ITEMS - 1),
    ]);
    void saveGeneratedOrderFile(historyItem).catch(() => {
      toast.error('생성 파일 목록 저장 실패');
    });
  };

  const handleConvert = async () => {
    if (!selectedFile) return;
    setState('converting');
    setError(null);

    try {
      const result = await convertIcecreamMallOrderFile(selectedFile, filePassword || undefined);
      const historyItem = {
        ...result,
        id: `${Date.now()}-${selectedFile.name}`,
        sourceName: selectedFile.name.normalize('NFC'),
        convertedAt: Date.now(),
        collectionDate: todayYmd(),
        collectionMode: 'manual-upload' as const,
        mallKey: ICECREAM_MALL_KEY,
        mallName: '아이스크림몰',
      };
      addGeneratedFile(historyItem);
      setPreviewId(historyItem.id);
      setState('success');
      toast.success('주문수집 엑셀 변환 완료');
      if (inputRef.current) inputRef.current.value = '';
      setSelectedFile(null);
      setFilePassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message : '변환 실패';
      setError(message);
      setState('error');
      toast.error(message);
    }
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

  // 수집 전 저장된 계정으로 자동 로그인 보장(계정 없으면 스킵).
  const ensureMallLogin = async (mallKey: string): Promise<void> => {
    const credentials = await tryLoadMallCredentials(mallKey);
    if (credentials) await ensureMallLoggedInViaExtension(mallKey, credentials);
  };

  // 키즈노트: 오늘 주문을 상세까지 수집 → 셀피아 .xls 생성 → 생성 파일 목록 등록 (아이스크림몰과 동일 흐름).
  const generateKidsnoteSellpia = async (): Promise<number> => {
    const today = todayYmd();
    await ensureMallLogin('kidsnote');
    const { orders } = await collectKidsnoteOrdersFromExtension(today, today, '', true);
    if (!orders.length) {
      toast.error('오늘 키즈노트 주문이 없습니다.');
      return 0;
    }
    const result = await convertKidsnoteToSellpiaFile(orders);
    const convertedAt = Date.now();
    const historyItem = {
      ...result,
      id: `${convertedAt}-kidsnote-browser`,
      sourceName: `키즈노트 주문 (${formatNumber(orders.length)}건)`,
      convertedAt,
      collectionDate: today,
      collectionMode: 'browser' as const,
      collectedRows: orders.length,
      mallKey: 'kidsnote',
      mallName: '키즈노트',
    };
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);
    return orders.length;
  };

  // 꼬망세: 확장이 EduPre "선택엑셀다운" xlsx 를 가져옴 → 셀피아 .xls 변환 → 생성 파일 목록 등록.
  const generateKkomangseSellpia = async (): Promise<number> => {
    await ensureMallLogin('kkomangse');
    const xlsxBase64 = await collectKkomangseXlsxFromExtension();
    let result: Awaited<ReturnType<typeof convertKkomangseToSellpiaFile>>;
    try {
      result = await convertKkomangseToSellpiaFile(xlsxBase64, { date: todayYmd() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/주문이 없|없습니다/.test(msg)) {
        toast('오늘 꼬망세 신규 주문이 없습니다.'); // 없으면 안내만 (에러 아님)
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    const historyItem = {
      ...result,
      id: `${convertedAt}-kkomangse-browser`,
      sourceName: `꼬망세 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser' as const,
      collectedRows: rows,
      mallKey: 'kkomangse',
      mallName: '꼬망세',
    };
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);
    return rows;
  };

  const generateDomeggookSellpia = async (): Promise<number> => {
    // 확장이 도매꾹에서 지정일 기간으로 엑셀 생성 요청 → 생성 완료까지 대기 → CDN 다운로드 → 변환.
    const collectDate = todayYmd(); // 오늘 당일 주문
    await ensureMallLogin('domeggook');
    const { csvBase64, fileName } = await collectDomeggookCsvFromExtension(collectDate);
    let result: Awaited<ReturnType<typeof convertDomeggookCsvBase64>>;
    try {
      result = await convertDomeggookCsvBase64(csvBase64, fileName, { date: collectDate, download: false });
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
    const historyItem = {
      ...result,
      id: `${convertedAt}-domeggook-browser`,
      sourceName: `도매꾹 주문 ${collectDate} (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: collectDate,
      collectionMode: 'browser' as const,
      collectedRows: rows,
      mallKey: 'domeggook',
      mallName: '도매꾹',
    };
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);
    return rows;
  };

  const generateKidkidsSellpia = async (): Promise<number> => {
    // 출고예정일이 지정된 미출고 주문 전부 수집 (날짜 미지정 = 출고관리에서 잡아둔 배치).
    // ⚠️출고처리(출고완료) 하면 목록에서 빠지므로, 출고처리 전에 수집해야 함.
    await ensureMallLogin('kidkids');
    const orders = await collectKidkidsOrdersFromExtension();
    if (orders.length === 0) {
      toast(
        '출고예정일이 지정된 키드키즈 주문이 없습니다. (출고관리에서 출고예정일을 먼저 지정하세요. 이미 출고처리한 주문은 목록에서 빠집니다.)',
      );
      return 0;
    }
    const result = await convertKidkidsToSellpiaFile(orders, { download: false }); // 주문번호 기본 96090부터
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    const historyItem = {
      ...result,
      id: `${convertedAt}-kidkids-browser`,
      sourceName: `키드키즈 주문 (${formatNumber(orders.length)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser' as const,
      collectedRows: rows,
      mallKey: 'kidkids',
      mallName: '키드키즈',
    };
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);
    return rows;
  };

  const generateLotteonSellpia = async (): Promise<number> => {
    // 확장이 롯데ON 배송관리 신규주문 엑셀(.xlsx)을 로그인 세션으로 백그라운드 수집 → 셀피아 .xls 변환.
    const { xlsxBase64, fileName } = await collectLotteonXlsxFromExtension();
    let result: Awaited<ReturnType<typeof convertLotteonToSellpiaFile>>;
    try {
      result = await convertLotteonToSellpiaFile(xlsxBase64, fileName, { download: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/주문이 없|없습니다/.test(msg)) {
        toast('롯데ON 신규 주문이 없습니다.'); // 없으면 안내만 (에러 아님)
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    const historyItem = {
      ...result,
      id: `${convertedAt}-lotte-on-browser`,
      sourceName: `롯데ON 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser' as const,
      collectedRows: rows,
      mallKey: 'lotte-on',
      mallName: '롯데ON',
    };
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);
    return rows;
  };

  const generateGsshopSellpia = async (): Promise<number> => {
    // 확장이 GS샵 배송관리에서 1주일 조회 → 다운로드(도로명/전체주소 기본값) → 클라이언트 조립 xlsx 캡처.
    const collected = await collectGsshopXlsxFromExtension();
    if ('empty' in collected) {
      toast('GS샵 신규 주문이 없습니다.'); // 조회결과 없음 = 안내만
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
    const historyItem = {
      ...result,
      id: `${convertedAt}-gs-shop-browser`,
      sourceName: `GS샵 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser' as const,
      collectedRows: rows,
      mallKey: 'gs-shop',
      mallName: 'GS샵',
    };
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);
    return rows;
  };

  const generateAlwayzSellpia = async (): Promise<number> => {
    // 확장이 올웨이즈 "팀모집완료(엑셀추출 이전)"를 엑셀추출하기로 자동 실행 → 클라이언트 조립 xlsx 캡처.
    await ensureMallLogin('always');
    const collected = await collectAlwayzXlsxFromExtension();
    if ('empty' in collected) {
      toast('올웨이즈 신규 주문이 없습니다.'); // 팀모집완료 없음 = 안내만
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
    const historyItem = {
      ...result,
      id: `${convertedAt}-always-browser`,
      sourceName: `올웨이즈 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser' as const,
      collectedRows: rows,
      mallKey: 'always',
      mallName: '올웨이즈',
    };
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);
    return rows;
  };

  const generateBoriboriSellpia = async (): Promise<number> => {
    // 확장이 보리보리 출고대기 "일괄엑셀다운로드"로 언마스킹 xlsx 수집 → 셀피아 .xls (passthrough).
    // 언마스킹은 다운로드 사유="배송확인합니다"만으로 처리됨 (비밀번호 불필요).
    const { xlsxBase64, fileName } = await collectBoriboriXlsxFromExtension();
    let result: Awaited<ReturnType<typeof convertBoriboriToSellpiaFile>>;
    try {
      result = await convertBoriboriToSellpiaFile(xlsxBase64, fileName, { download: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/주문이 없|없습니다/.test(msg)) {
        toast('출고대기 보리보리 신규 주문이 없습니다.'); // 없으면 안내만
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    const historyItem = {
      ...result,
      id: `${convertedAt}-boribori-browser`,
      sourceName: `보리보리 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser' as const,
      collectedRows: rows,
      mallKey: 'boribori',
      mallName: '보리보리',
    };
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);
    return rows;
  };

  const generateTeachervilleSellpia = async (): Promise<number> => {
    // 확장이 티쳐몰(퍼스트몰) 출고 전 주문을 셀피아 양식(엑셀템플릿 117)으로 다운로드 → .xls (36컬럼 passthrough).
    const { xlsxBase64, fileName } = await collectTeachervilleXlsxFromExtension();
    let result: Awaited<ReturnType<typeof convertTeachervilleToSellpiaFile>>;
    try {
      result = await convertTeachervilleToSellpiaFile(xlsxBase64, fileName, { download: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/주문이 없|없습니다/.test(msg)) {
        toast('출고 전 티쳐몰 신규 주문이 없습니다.'); // 없으면 안내만
        return 0;
      }
      throw err;
    }
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    const historyItem = {
      ...result,
      id: `${convertedAt}-teacher-mall-browser`,
      sourceName: `티쳐몰 주문 (${formatNumber(rows)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser' as const,
      collectedRows: rows,
      mallKey: 'teacher-mall',
      mallName: '티쳐몰',
    };
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);
    return rows;
  };

  const generateArt09Csv = async (): Promise<number> => {
    // 아트공구(Cafe24)는 현재 주문목록의 주문번호를 기준으로 상세 배송정보를 보강해,
    // Cafe24 배송완료 다운로드 샘플과 같은 UTF-8 CSV(21컬럼)를 생성한다.
    await ensureMallLogin('art09');
    const result = await collectArt09CsvFromExtension({ download: false });
    const rows = result.outputRows ?? 0;
    if (rows === 0) {
      toast('아트공구 수집 대상 주문이 없습니다.');
      return 0;
    }

    const orderCount = result.orderNumbers.length || result.sourceRows || rows;
    const convertedAt = Date.now();
    const historyItem = {
      ...result,
      id: `${convertedAt}-art09-browser`,
      sourceName: `아트공구 주문 (${formatNumber(orderCount)}건 · ${formatNumber(rows)}품목)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser' as const,
      collectedRows: orderCount,
      mallKey: 'art09',
      mallName: '아트공구',
      orderNumbers: result.orderNumbers,
    };
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);
    return orderCount;
  };

  const generateCoupangDirectSellpia = async (): Promise<number> => {
    // 확장이 쿠팡 발주확정(PA) 발주 + 품목(/scm) + 센터주소 수집 → 운송유형별(쉽먼트/밀크런) 2개 파일 생성.
    const data = await collectCoupangDirectFromExtension();
    if (data.pos.length === 0) {
      toast('발주확정 쿠팡직배송 신규 발주가 없습니다.'); // 없으면 안내만
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
    // 오늘 날짜 기준 리스트(주문코드+일자) + 주문별 상세모달 fetch → 상품금액/배송비 분리 → 셀피아 변환.
    await ensureMallLogin('onch');
    const orders = await collectOnchannelOrdersFromExtension(todayYmd());
    if (orders.length === 0) {
      toast('오늘 온채널 신규 주문이 없습니다.'); // 없으면 안내만
      return 0;
    }
    const result = await convertOnchannelToSellpiaFile(orders);
    const rows = result.outputRows ?? 0;
    const convertedAt = Date.now();
    const historyItem = {
      ...result,
      id: `${convertedAt}-onch-browser`,
      sourceName: `온채널 주문 (${formatNumber(orders.length)}건)`,
      convertedAt,
      collectionDate: todayYmd(),
      collectionMode: 'browser' as const,
      collectedRows: rows,
      mallKey: 'onch',
      mallName: '온채널',
    };
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);
    return rows;
  };
  const collectBrowserMall = async (account: OrderCollectionMallAccount) => {
    // 확장 스크래핑 몰: 각 generate 함수가 셀피아 파일 생성 + 생성목록 등록. 아이스크림몰은 아래 기본 흐름.
    if (account.key === 'kidsnote') { const count = await generateKidsnoteSellpia(); return { rowCount: count, masked: false, date: todayYmd() }; }
    if (account.key === 'kkomangse') { const count = await generateKkomangseSellpia(); return { rowCount: count, masked: false, date: todayYmd() }; }
    if (account.key === 'onch') { const count = await generateOnchannelSellpia(); return { rowCount: count, masked: false, date: todayYmd() }; }
    if (account.key === 'domeggook') { const count = await generateDomeggookSellpia(); return { rowCount: count, masked: false, date: todayYmd() }; }
    if (account.key === 'kidkids') { const count = await generateKidkidsSellpia(); return { rowCount: count, masked: false, date: todayYmd() }; }
    if (account.key === 'lotte-on') { const count = await generateLotteonSellpia(); return { rowCount: count, masked: false, date: todayYmd() }; }
    if (account.key === 'gs-shop') { const count = await generateGsshopSellpia(); return { rowCount: count, masked: false, date: todayYmd() }; }
    if (account.key === 'always') { const count = await generateAlwayzSellpia(); return { rowCount: count, masked: false, date: todayYmd() }; }
    if (account.key === 'boribori') { const count = await generateBoriboriSellpia(); return { rowCount: count, masked: false, date: todayYmd() }; }
    if (account.key === 'coupang-direct') { const count = await generateCoupangDirectSellpia(); return { rowCount: count, masked: false, date: todayYmd() }; }
    if (account.key === 'teacher-mall') { const count = await generateTeachervilleSellpia(); return { rowCount: count, masked: false, date: todayYmd() }; }
    if (account.key === 'art09') { const count = await generateArt09Csv(); return { rowCount: count, masked: false, date: todayYmd() }; }
    if (!isBrowserCollectableMall(account)) {
      throw new Error(`${account.name} 자동 수집은 준비 중입니다.`);
    }

    const credentials = await loadMallLoginCredentials(account);
    const collected = await collectIcecreamMallRowsFromExtension(todayYmd(), credentials);
    const result = await convertIcecreamMallOrderRows({
      headers: collected.headers,
      rows: collected.rows,
      fileName: `아이스크림몰_${collected.date ?? todayYmd()}_브라우저수집`,
    });
    const convertedAt = Date.now();
    const historyItem = {
      ...result,
      id: `${convertedAt}-${account.key}-browser`,
      sourceName: `${account.name} 브라우저 수집 (${formatNumber(collected.rowCount)}행)`,
      convertedAt,
      collectionDate: collected.date ?? todayYmd(),
      collectionMode: 'browser' as const,
      collectedRows: collected.rowCount,
      mallKey: account.key,
      mallName: account.name,
    };
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);

    return collected;
  };

  const handleBrowserCollectAll = async () => {
    // ⚠️configured(ID/비번)로 거르지 않는다 — 확장 스크래핑 몰은 자격증명 없이 로그인 세션으로 수집되므로,
    // configured로 세면 계정 미저장 시 전체수집에서 빠진다. enabled + isBrowserCollectableMall 로만 판단.
    const enabledAccounts = mallAccounts.filter((account) => account.enabled);
    const collectableAccounts = enabledAccounts.filter(isBrowserCollectableMall);
    const pendingCount = enabledAccounts.length - collectableAccounts.length;

    if (collectableAccounts.length === 0) {
      toast.error('현재 자동 수집 가능한 몰 계정이 없습니다.');
      return;
    }

    setBrowserCollecting(true);
    setState('converting');
    setError(null);

    try {
      for (const account of collectableAccounts) {
        setCollectingMallKey(account.key);
        const collected = await collectBrowserMall(account);
        if (collected.masked) {
          toast.warning('화면 표는 일부 개인정보가 마스킹되어 있습니다.');
        }
      }
      setState('success');
      toast.success(
        pendingCount > 0
          ? `자동 수집 완료. ${formatNumber(pendingCount)}개 몰은 준비 중입니다.`
          : '전체 수집 완료',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '브라우저 수집 실패';
      setError(message);
      setState('error');
      toast.error(message);
    } finally {
      setBrowserCollecting(false);
      setCollectingMallKey(null);
    }
  };

  const handleBrowserCollectMall = async (account: OrderCollectionMallAccount) => {
    if (!account.enabled) {
      toast.error(`${account.name} 계정이 중지되어 있습니다.`);
      return;
    }
    // 확장 스크래핑 몰은 configured 불필요 — isBrowserCollectableMall 이 몰별 수집 가능 여부를 판단.
    if (!isBrowserCollectableMall(account)) {
      toast.error(
        account.configured
          ? `${account.name} 자동 수집은 준비 중입니다.`
          : `${account.name} 계정을 먼저 설정해주세요.`,
      );
      return;
    }

    setCollectingMallKey(account.key);
    setState('converting');
    setError(null);

    try {
      const collected = await collectBrowserMall(account);
      setState('success');
      if (collected.masked) {
        toast.warning('화면 표는 일부 개인정보가 마스킹되어 있습니다.');
      }
      toast.success(`${account.name} 수집 완료`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '브라우저 수집 실패';
      setError(message);
      setState('error');
      toast.error(message);
    } finally {
      setCollectingMallKey(null);
    }
  };

  const handleOpenMallSettings = async (account: OrderCollectionMallAccount) => {
    setSelectedMallKey(account.key);
    setMallDraft(draftFromMallAccount(account));
    setMallPasswordVisible(account.hasPassword);
    setMallSettingsOpen(true);
    if (!account.hasPassword) return;

    setMallPasswordLoading(true);
    try {
      const result = await orderMallAccountApi.password(account.key);
      setMallDraft((current) => ({ ...current, password: result.password ?? '' }));
    } catch (err) {
      const message = err instanceof Error ? err.message : '저장된 비밀번호를 불러오지 못했습니다.';
      toast.error(message);
    } finally {
      setMallPasswordLoading(false);
    }
  };

  const handleMallSettingsOpenChange = (open: boolean) => {
    setMallSettingsOpen(open);
    if (!open && selectedMall) {
      setMallDraft(draftFromMallAccount(selectedMall));
      setMallPasswordLoading(false);
      setMallPasswordVisible(false);
    }
  };

  const handleSaveMallAccount = async () => {
    if (!selectedMall) return;
    setMallSaving(true);
    try {
      const saved = await orderMallAccountApi.update(selectedMall.key, {
        loginId: mallDraft.loginId,
        password: mallDraft.password.trim() ? mallDraft.password : undefined,
        siteUrl: mallDraft.siteUrl,
        memo: mallDraft.memo,
        enabled: mallDraft.enabled,
      });
      setMallAccounts((prev) =>
        prev.map((account) => (account.key === saved.key ? saved : account)),
      );
      setMallDraft((current) => ({ ...current, password: '' }));
      setMallSettingsOpen(false);
      toast.success(`${saved.name} 계정 저장 완료`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '몰 계정 저장 실패';
      toast.error(message);
    } finally {
      setMallSaving(false);
    }
  };

  const handleOpenMall = () => {
    if (!mallDraft.siteUrl) return;
    window.open(mallDraft.siteUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSendToSellpia = async (item: ConversionHistoryItem) => {
    setSellpiaSendingId(item.id);
    try {
      const shopName = item.mallName ?? '아이스크림몰';
      const result = await sendOrderFileToSellpiaViaExtension({
        shopName,
        fileName: item.fileName,
        blob: item.blob,
      });
      toast.success(`셀피아 전송 완료 — ${result.shop ?? shopName} 주문접수 클릭`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '셀피아 전송 실패';
      toast.error(message);
    } finally {
      setSellpiaSendingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
            <FileSpreadsheet size={20} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">주문 수집</h1>
            <div className="text-sm text-slate-500">여러 몰 주문을 수집해 셀피아 납품 양식으로 변환합니다</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Upload size={16} />
          파일 선택
        </button>
      </div>

      <OrderCollectionFlow
        orderCount={lastOrderCount}
        productRows={lastResult?.productRows ?? null}
        outputRows={lastResult?.outputRows ?? null}
        skippedRows={lastResult?.skippedRows ?? null}
      />

      <OrderCollectionDailyPanel
        collectingMallKey={collectingMallKey}
        mallAccounts={mallAccounts}
        selectedMallKey={selectedMallKey}
        summary={orderCollectionSummary}
      />

      <MallAccountSection
        browserCollecting={browserCollecting}
        collectingMallKey={collectingMallKey}
        configuredMallCount={configuredMallCount}
        conversionState={state}
        enabledMallCount={enabledMallCount}
        mallAccounts={mallAccounts}
        mallCollectionStats={orderCollectionSummary.mallStatsByKey}
        mallDraft={mallDraft}
        mallError={mallError}
        mallLoading={mallLoading}
        mallPasswordLoading={mallPasswordLoading}
        mallPasswordVisible={mallPasswordVisible}
        mallSaving={mallSaving}
        mallSettingsOpen={mallSettingsOpen}
        selectedMall={selectedMall}
        onCollectAll={() => void handleBrowserCollectAll()}
        onCollectMall={(account) => void handleBrowserCollectMall(account)}
        onDraftChange={setMallDraft}
        onOpenMall={handleOpenMall}
        onOpenSettings={(account) => void handleOpenMallSettings(account)}
        onPasswordVisibleChange={setMallPasswordVisible}
        onRefresh={() => void loadMallAccounts()}
        onSaveMallAccount={() => void handleSaveMallAccount()}
        onSettingsOpenChange={handleMallSettingsOpenChange}
      />

      <ManualUploadSection
        canConvert={canConvert}
        dragActive={dragActive}
        error={error}
        filePassword={filePassword}
        inputRef={inputRef}
        lastResult={lastResult}
        selectedFile={selectedFile}
        state={state}
        onConvert={() => void handleConvert()}
        onDownload={downloadOrderCollectionFile}
        onDragActiveChange={setDragActive}
        onDrop={handleDrop}
        onFilePasswordChange={setFilePassword}
        onInputChange={handleInputChange}
        onPreview={setPreviewId}
      />

      {previewItem && (
        <FilePreviewSection
          item={previewItem}
          onClose={() => setPreviewId(null)}
          onDownload={downloadOrderCollectionFile}
        />
      )}

      <GeneratedFilesSection
        groups={generatedFileGroups}
        sellpiaSendingId={sellpiaSendingId}
        onDownload={downloadOrderCollectionFile}
        onPreview={setPreviewId}
        onSendToSellpia={(item) => void handleSendToSellpia(item)}
      />
    </div>
  );
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
