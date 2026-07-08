'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Save,
  Send,
  Store,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import {
  convertDomeggookOrderFile,
  convertGsshopOrderFile,
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
  deleteGeneratedOrderFile,
  loadGeneratedOrderFiles,
  saveGeneratedOrderFile,
  type StoredOrderCollectionFile,
} from './lib/order-generated-file-store';
import { OrderActivityFeed, type OrderActivityEvent } from './components/OrderActivityFeed';
import { OrderCollectionDailyPanel } from './components/OrderCollectionDailyPanel';
import { OrderUploadModal } from './components/OrderUploadModal';
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
  collectTeachervilleXlsxFromExtension,
  convertTeachervilleToSellpiaFile,
} from './lib/teacherville-orders-api';
import { collectArt09CsvFromExtension } from './lib/art09-orders-api';
import {
  collectCoupangDirectFromExtension,
  convertCoupangDirectToSellpiaFile,
  COUPANG_TRANSPORT_LABEL,
  type CoupangDirectPo,
  type CoupangTransport,
} from './lib/coupang-directship-api';
import {
  addSeenOrderKeys,
  diffNewOrderRows,
  distinctOrderNumbers,
  loadSeenOrderKeys,
  rowKeysOf,
} from './lib/order-detect';
import {
  getHistoryCollectionBucket,
  getHistoryOrderCount,
} from './lib/order-history-count';

type ConversionState = 'idle' | 'ready' | 'converting' | 'success' | 'error';

type ConversionHistoryItem = StoredOrderCollectionFile;

interface MallAccountDraft {
  loginId: string;
  password: string;
  siteUrl: string;
  memo: string;
  enabled: boolean;
}

interface MallCollectionStat {
  orderRows: number; // 당일 주문 (오늘 수집)
  newRows: number; // 신규주문 = 당일 주문 중 셀피아 미전송
  productRows: number;
  latestAt: number;
}

const ICECREAM_MALL_KEY = 'icecream-mall';
const MAX_HISTORY_ITEMS = 1000;
const DEFAULT_AUTO_INTERVAL_MIN = 30;
const AUTO_BUSINESS_START_HOUR = 9; // 자동 수집 시작 (오전 9시)
const AUTO_BUSINESS_END_HOUR = 18; // 자동 수집 종료 (오후 6시) — 18시 직전까지만
const AUTO_INTERVAL_OPTIONS_MIN = [5, 10, 15, 30, 60];

const MALL_LABELS: Record<string, string> = {
  'one-polaris': '원폴라리스',
  'icecream-mall': '아이스크림몰',
  kidkids: '키드키즈',
  kidsnote: '키즈노트',
  'haebub-mall': '해법몰',
  onch: '온채널',
  kkomangse: '꼬망세',
  art09: '아트공구',
  'tekville-edu': '테크빌교육',
  'benepia-mul': '베네피아물',
  domeggook: '도매꾹',
  'lotte-on': '롯데ON',
  boribori: '보리보리',
  always: '올웨이즈',
  'woongjin-class': '웅진클래스몰',
  kakao: '카카오',
  toss: '토스',
  'teacher-mall': '티쳐몰',
  'gs-shop': 'GS샵',
  'coupang-rocket': '쿠팡로켓',
  'coupang-direct': '쿠팡직배송',
};

const EMPTY_MALL_DRAFT: MallAccountDraft = {
  loginId: '',
  password: '',
  siteUrl: '',
  memo: '',
  enabled: true,
};

// 최근 활동 피드에 뜨는 이벤트(주문 없음/오류)를 세션 간 유지 (localStorage, 최근 30건).
const ACTIVITY_EVENTS_KEY = 'kiditem-order-activity-events';
const ACTIVITY_EVENT_LIMIT = 30;

export default function OrderCollectionPage() {
  const [state, setState] = useState<ConversionState>('idle');
  const [history, setHistory] = useState<ConversionHistoryItem[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [activityEvents, setActivityEvents] = useState<OrderActivityEvent[]>([]); // 주문 없음/오류 피드 이벤트
  const [fileMallFilter, setFileMallFilter] = useState(''); // 생성 파일 몰 필터 ('' = 전체)
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [mallAccounts, setMallAccounts] = useState<OrderCollectionMallAccount[]>([]);
  const [mallLoading, setMallLoading] = useState(true);
  const [mallSaving, setMallSaving] = useState(false);
  const [browserCollecting, setBrowserCollecting] = useState(false);
  // 여러 몰을 동시에 수집할 수 있도록 진행 중인 몰 key 를 Set 으로 추적 (한 몰 수집이 다른 몰을 막지 않음).
  const [collectingKeys, setCollectingKeys] = useState<Set<string>>(new Set());
  const markCollecting = (key: string, on: boolean) =>
    setCollectingKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const [mallError, setMallError] = useState<string | null>(null);
  const [selectedMallKey, setSelectedMallKey] = useState<string | null>(ICECREAM_MALL_KEY);
  const [mallDraft, setMallDraft] = useState<MallAccountDraft>(EMPTY_MALL_DRAFT);
  const [mallSettingsOpen, setMallSettingsOpen] = useState(false);
  const [mallPasswordLoading, setMallPasswordLoading] = useState(false);
  const [mallPasswordVisible, setMallPasswordVisible] = useState(false);
  const [sellpiaSendingId, setSellpiaSendingId] = useState<string | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [autoDetect, setAutoDetect] = useState(false);
  const [autoLastRunAt, setAutoLastRunAt] = useState<number | null>(null);
  const [autoNextRunAt, setAutoNextRunAt] = useState<number | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoIntervalMin, setAutoIntervalMin] = useState(DEFAULT_AUTO_INTERVAL_MIN);
  const autoBusyRef = useRef(false);
  const autoDetectRef = useRef<() => Promise<void>>(async () => {});

  const autoIntervalMs = autoIntervalMin * 60 * 1000;
  const previewItem = previewId ? history.find((item) => item.id === previewId) ?? null : null;
  const defaultMall =
    mallAccounts.find((account) => account.key === ICECREAM_MALL_KEY) ?? mallAccounts[0] ?? null;
  const selectedMall =
    mallAccounts.find((account) => account.key === selectedMallKey) ?? defaultMall;
  const configuredMallCount = mallAccounts.filter((account) => account.configured).length;
  // 전체 수집 버튼 활성/사용 카운트 = 실제 브라우저 수집 가능한 몰 수.
  // ⚠️configured(ID/비번)로 세지 않는다 — 확장 스크래핑 몰은 자격증명 없이도 수집 대상이므로,
  // 그렇게 세면 계정 미저장 시 버튼이 비활성화되어 전체 수집이 아예 안 눌린다.
  const enabledMallCount = mallAccounts.filter(
    (account) => account.enabled && isBrowserCollectableMall(account),
  ).length;

  // 오늘 주문 파이프라인: 오늘 주문 → 전송 대기(미전송) → 셀피아 전송(전송됨) → 송장 전송 → 완료.
  // 송장 전송/완료는 셀피아 이후 단계라 아직 추적 데이터가 없어 0으로 표시(추후 연동).
  const collectionSummary = useMemo(() => {
    const today = todayYmd();
    let todayOrders = 0;
    let waiting = 0;
    let sent = 0;
    for (const item of history) {
      if ((item.collectionDate ?? dayKey(item.convertedAt)) !== today) continue;
      const orders = getHistoryOrderCount(item) ?? 0;
      todayOrders += orders;
      if (item.sentAt) sent += orders;
      else waiting += orders;
    }
    return { todayOrders, waiting, sent, trackingSent: 0, done: 0 };
  }, [history]);

  const fileMallOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const item of history) {
      const key = resolveHistoryMallKey(item);
      if (key) keys.add(key);
    }
    return Array.from(keys).map((key) => ({ key, name: MALL_LABELS[key] ?? key }));
  }, [history]);
  const generatedFileGroups = useMemo(
    () =>
      groupHistoryByDay(
        fileMallFilter
          ? history.filter((item) => resolveHistoryMallKey(item) === fileMallFilter)
          : history,
      ),
    [history, fileMallFilter],
  );
  const mallCollectionStats = useMemo(() => buildMallCollectionStats(history, todayYmd()), [history]);

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
      const message = orderCollectionError(err, '몰 계정을 불러오지 못했습니다.');
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

  // 저장된 활동 이벤트(주문 없음/오류) 복원.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(ACTIVITY_EVENTS_KEY);
      const parsed = raw ? (JSON.parse(raw) as OrderActivityEvent[]) : [];
      if (Array.isArray(parsed)) setActivityEvents(parsed);
    } catch {
      /* 손상된 값 무시 */
    }
  }, []);

  // 주문 없음/오류를 최근 활동 피드에 기록 (수집/전송 결과 알림을 여기에 모은다).
  const logActivity = (kind: OrderActivityEvent['kind'], mallName: string, message = '') => {
    const event: OrderActivityEvent = {
      id: `${Date.now()}-${kind}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      mallName,
      message,
      at: Date.now(),
    };
    setActivityEvents((prev) => {
      const next = [event, ...prev].slice(0, ACTIVITY_EVENT_LIMIT);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(ACTIVITY_EVENTS_KEY, JSON.stringify(next));
        } catch {
          /* 저장 실패 무시 */
        }
      }
      return next;
    });
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

  // 저장된 몰 계정(ID/비번)을 불러온다. 없으면 null → 자동 로그인 스킵(세션 의존).
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
    // 키즈노트는 확장 세션으로 상세까지 스크래핑 → 셀피아 파일 생성 (생성 파일 목록에 등록).
    if (account.key === 'kidsnote') {
      const count = await generateKidsnoteSellpia();
      return { rowCount: count, masked: false, date: todayYmd() };
    }
    if (account.key === 'kkomangse') {
      const count = await generateKkomangseSellpia();
      return { rowCount: count, masked: false, date: todayYmd() };
    }
    if (account.key === 'onch') {
      const count = await generateOnchannelSellpia();
      return { rowCount: count, masked: false, date: todayYmd() };
    }
    if (account.key === 'domeggook') {
      const count = await generateDomeggookSellpia();
      return { rowCount: count, masked: false, date: todayYmd() };
    }
    if (account.key === 'kidkids') {
      const count = await generateKidkidsSellpia();
      return { rowCount: count, masked: false, date: todayYmd() };
    }
    if (account.key === 'lotte-on') {
      const count = await generateLotteonSellpia();
      return { rowCount: count, masked: false, date: todayYmd() };
    }
    if (account.key === 'gs-shop') {
      const count = await generateGsshopSellpia();
      return { rowCount: count, masked: false, date: todayYmd() };
    }
    if (account.key === 'always') {
      const count = await generateAlwayzSellpia();
      return { rowCount: count, masked: false, date: todayYmd() };
    }
    if (account.key === 'boribori') {
      const count = await generateBoriboriSellpia();
      return { rowCount: count, masked: false, date: todayYmd() };
    }
    if (account.key === 'coupang-direct') {
      const count = await generateCoupangDirectSellpia();
      return { rowCount: count, masked: false, date: todayYmd() };
    }
    if (account.key === 'teacher-mall') {
      const count = await generateTeachervilleSellpia();
      return { rowCount: count, masked: false, date: todayYmd() };
    }
    if (account.key === 'art09') {
      const count = await generateArt09Csv();
      return { rowCount: count, masked: false, date: todayYmd() };
    }
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
      orderNumbers: distinctOrderNumbers(collected.headers, collected.rows),
    };
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);
    addSeenOrderKeys(account.key, rowKeysOf(collected.rows));

    return collected;
  };

  const handleBrowserCollectAll = async () => {
    // 개별 '수집' 버튼과 동일 기준: 브라우저 수집 가능한 몰 전부 대상.
    // ⚠️configured(ID/비번 저장)로 거르지 않는다 — 확장 스크래핑 몰(키드키즈·롯데ON·GS샵 등)은
    // 자격증명 없이도 로그인 세션으로 수집되므로 configured=false 여도 수집 대상. enabled 로만 제외.
    const collectableAccounts = mallAccounts.filter(
      (account) => account.enabled && isBrowserCollectableMall(account),
    );

    if (collectableAccounts.length === 0) {
      toast.error('현재 자동 수집 가능한 몰이 없습니다.');
      return;
    }

    setBrowserCollecting(true);
    setState('converting');

    const failures: { name: string; message: string }[] = [];
    let okCount = 0;
    try {
      for (const account of collectableAccounts) {
        markCollecting(account.key, true);
        try {
          const collected = await collectBrowserMall(account);
          if (collected.masked) {
            toast.warning('화면 표는 일부 개인정보가 마스킹되어 있습니다.');
          }
          if (collected.rowCount === 0) logActivity('empty', account.name);
          okCount += 1;
        } catch (err) {
          // ⭐한 몰이 실패해도 나머지 몰은 계속 수집한다(전체 배치 중단 금지).
          const message = orderCollectionError(err, '수집 실패');
          logActivity('error', account.name, message);
          failures.push({ name: account.name, message });
        } finally {
          markCollecting(account.key, false);
        }
      }

      if (failures.length === 0) {
        setState('success');
        toast.success('전체 수집 완료');
      } else if (okCount > 0) {
        setState('success');
        toast.warning(
          `${formatNumber(okCount)}개 몰 완료, ${formatNumber(failures.length)}개 실패: ${failures
            .map((f) => f.name)
            .join(', ')}`,
        );
      } else {
        setState('error');
        toast.error(`전체 수집 실패 — ${failures[0].name}: ${failures[0].message}`);
      }
    } finally {
      setBrowserCollecting(false);
    }
  };

  const handleBrowserCollectMall = async (account: OrderCollectionMallAccount) => {
    if (
      account.key === 'kidsnote' ||
      account.key === 'kkomangse' ||
      account.key === 'onch' ||
      account.key === 'domeggook' ||
      account.key === 'kidkids' ||
      account.key === 'lotte-on' ||
      account.key === 'gs-shop' ||
      account.key === 'always' ||
      account.key === 'boribori' ||
      account.key === 'coupang-direct' ||
      account.key === 'teacher-mall' ||
      account.key === 'art09'
    ) {
      markCollecting(account.key, true);
      setState('converting');
      try {
        let count = 0;
        if (account.key === 'kidsnote') count = await generateKidsnoteSellpia();
        else if (account.key === 'kkomangse') count = await generateKkomangseSellpia();
        else if (account.key === 'onch') count = await generateOnchannelSellpia();
        else if (account.key === 'domeggook') count = await generateDomeggookSellpia();
        else if (account.key === 'lotte-on') count = await generateLotteonSellpia();
        else if (account.key === 'gs-shop') count = await generateGsshopSellpia();
        else if (account.key === 'kidkids') count = await generateKidkidsSellpia();
        else if (account.key === 'boribori') count = await generateBoriboriSellpia();
        else if (account.key === 'coupang-direct') count = await generateCoupangDirectSellpia();
        else if (account.key === 'teacher-mall') count = await generateTeachervilleSellpia();
        else if (account.key === 'art09') count = await generateArt09Csv();
        else count = await generateAlwayzSellpia();
        if (count === 0) logActivity('empty', account.name);
        setState('success');
      } catch (err) {
        const message = orderCollectionError(err, '셀피아 파일 생성 실패');
        setState('error');
        logActivity('error', account.name, message);
        toast.error(message);
      } finally {
        markCollecting(account.key, false);
      }
      return;
    }
    if (!account.configured) {
      toast.error(`${account.name} 계정을 먼저 설정해주세요.`);
      return;
    }
    if (!account.enabled) {
      toast.error(`${account.name} 계정이 중지되어 있습니다.`);
      return;
    }
    if (!isBrowserCollectableMall(account)) {
      toast.error(`${account.name} 자동 수집은 준비 중입니다.`);
      return;
    }

    markCollecting(account.key, true);
    setState('converting');

    try {
      const collected = await collectBrowserMall(account);
      setState('success');
      if (collected.masked) {
        toast.warning('화면 표는 일부 개인정보가 마스킹되어 있습니다.');
      }
      if (collected.rowCount === 0) {
        logActivity('empty', account.name);
        toast(`${account.name} 신규 주문이 없습니다.`);
      } else {
        toast.success(`${account.name} 수집 완료`);
      }
    } catch (err) {
      const message = orderCollectionError(err, '브라우저 수집 실패');
      setState('error');
      logActivity('error', account.name, message);
      toast.error(message);
    } finally {
      markCollecting(account.key, false);
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
      const message = orderCollectionError(err, '저장된 비밀번호를 불러오지 못했습니다.');
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
      const message = orderCollectionError(err, '몰 계정 저장 실패');
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
      const sentAt = Date.now();
      setHistory((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, sentAt } : entry)));
      void saveGeneratedOrderFile({ ...item, sentAt }).catch(() => {});
      toast.success(`셀피아 전송 완료 — ${result.shop ?? shopName} 주문접수 클릭`);
    } catch (err) {
      const message = orderCollectionError(err, '셀피아 전송 실패');
      logActivity('error', `셀피아 전송 · ${item.mallName ?? '아이스크림몰'}`, message);
      toast.error(message);
    } finally {
      setSellpiaSendingId(null);
    }
  };

  const handleDeleteGeneratedFile = (item: ConversionHistoryItem) => {
    if (!window.confirm(`'${item.fileName}' 생성 파일을 삭제할까요?`)) return;
    setHistory((prev) => prev.filter((entry) => entry.id !== item.id));
    if (previewId === item.id) setPreviewId(null); // 미리보기 중이면 닫기
    void deleteGeneratedOrderFile(item.id).catch(() => {
      toast.error('생성 파일 삭제 실패');
    });
  };

  const changeFileMallFilter = (value: string) => {
    setFileMallFilter(value);
    setSelectedFileIds(new Set()); // 필터 바뀌면 선택 초기화 (보이는 것과 일치)
  };

  const toggleFileSelection = (id: string, checked: boolean) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleGroupSelection = (items: ConversionHistoryItem[], checked: boolean) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  };

  const handleDeleteSelectedFiles = () => {
    const ids = Array.from(selectedFileIds);
    if (ids.length === 0) return;
    if (!window.confirm(`선택한 ${formatNumber(ids.length)}개 생성 파일을 삭제할까요?`)) return;
    const idSet = new Set(ids);
    setHistory((prev) => prev.filter((entry) => !idSet.has(entry.id)));
    if (previewId && idSet.has(previewId)) setPreviewId(null);
    for (const id of ids) {
      void deleteGeneratedOrderFile(id).catch(() => {});
    }
    setSelectedFileIds(new Set());
  };

  const handleModalUpload = async ({
    mall,
    file,
    password,
  }: {
    mall: OrderCollectionMallAccount;
    file: File;
    password?: string;
  }) => {
    if (mall.key === 'domeggook') {
      // 도매꾹: 업로드한 CSV(EUC-KR)를 그대로 변환 (업로드 파일 전체 — 날짜필터 없음).
      const result = await convertDomeggookOrderFile(file);
      const historyItem = {
        ...result,
        id: `${Date.now()}-${file.name}`,
        sourceName: file.name.normalize('NFC'),
        convertedAt: Date.now(),
        collectionDate: todayYmd(),
        collectionMode: 'manual-upload' as const,
        mallKey: 'domeggook',
        mallName: '도매꾹',
      };
      addGeneratedFile(historyItem);
      setPreviewId(historyItem.id);
      toast.success(`도매꾹 변환 완료 — ${formatNumber(result.outputRows ?? 0)}건`);
      return;
    }
    if (mall.key === 'gs-shop') {
      // GS샵: 협력사 배송관리에서 직접 받은 엑셀(.xlsx, 79컬럼)을 그대로 올리면 셀피아 .xls 로 변환.
      const result = await convertGsshopOrderFile(file, { download: false });
      const historyItem = {
        ...result,
        id: `${Date.now()}-${file.name}`,
        sourceName: file.name.normalize('NFC'),
        convertedAt: Date.now(),
        collectionDate: todayYmd(),
        collectionMode: 'manual-upload' as const,
        mallKey: 'gs-shop',
        mallName: 'GS샵',
      };
      addGeneratedFile(historyItem);
      setPreviewId(historyItem.id);
      toast.success(`GS샵 변환 완료 — ${formatNumber(result.outputRows ?? 0)}건`);
      return;
    }
    if (mall.key !== ICECREAM_MALL_KEY) {
      throw new Error(`${mall.name} 변환은 아직 준비 중입니다. 현재는 아이스크림몰만 변환됩니다.`);
    }
    const result = await convertIcecreamMallOrderFile(file, password);
    const historyItem = {
      ...result,
      id: `${Date.now()}-${file.name}`,
      sourceName: file.name.normalize('NFC'),
      convertedAt: Date.now(),
      collectionDate: todayYmd(),
      collectionMode: 'manual-upload' as const,
      mallKey: mall.key,
      mallName: mall.name,
    };
    addGeneratedFile(historyItem);
    setPreviewId(historyItem.id);
    toast.success(`${mall.name} 변환 완료`);
  };

  // 30분 간격 신규 주문 자동 감지: 수집한 행을 '이미 본 주문'과 비교해 신규만 생성 파일에 추가.
  // diff 로직은 아이스크림몰 전용이므로 자동감지 대상도 아이스크림몰로 한정한다(다른 몰은 수동 수집).
  const runAutoDetect = async () => {
    if (autoBusyRef.current) return;
    if (!isWithinAutoBusinessHours(Date.now())) return; // 09–18시에만 자동 수집
    const targets = mallAccounts.filter(isAutoDetectableMall);
    if (targets.length === 0) return;
    autoBusyRef.current = true;
    setAutoRunning(true);
    try {
      for (const account of targets) {
        try {
          const credentials = await loadMallLoginCredentials(account);
          const collected = await collectIcecreamMallRowsFromExtension(todayYmd(), credentials);
          const diff = diffNewOrderRows(
            collected.headers,
            collected.rows,
            loadSeenOrderKeys(account.key),
          );
          if (diff.newRows.length === 0) continue;
          const result = await convertIcecreamMallOrderRows(
            {
              headers: collected.headers,
              rows: diff.newRows,
              fileName: `${account.name}_${collected.date ?? todayYmd()}_자동감지`,
            },
            { download: false },
          );
          const convertedAt = Date.now();
          addGeneratedFile({
            ...result,
            id: `${convertedAt}-${account.key}-auto`,
            sourceName: `${account.name} 자동감지 신규 ${formatNumber(diff.newOrderCount)}건`,
            convertedAt,
            collectionDate: collected.date ?? todayYmd(),
            collectionMode: 'browser' as const,
            collectedRows: diff.newRows.length,
            mallKey: account.key,
            mallName: account.name,
            orderNumbers: distinctOrderNumbers(collected.headers, diff.newRows),
          });
          addSeenOrderKeys(account.key, diff.newRowKeys);
          toast.success(`${account.name} 새 주문 ${formatNumber(diff.newOrderCount)}건 감지`);
        } catch (err) {
          logActivity('error', account.name, orderCollectionError(err, '자동 감지 실패'));
          console.warn('[order-auto-detect]', account.key, err);
        }
      }
      setAutoLastRunAt(Date.now());
    } finally {
      autoBusyRef.current = false;
      setAutoRunning(false);
    }
  };

  const toggleAutoDetect = () => {
    const next = !autoDetect;
    setAutoDetect(next);
    setAutoNextRunAt(next ? nextAutoRunAt(Date.now(), autoIntervalMs) : null);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('kiditem-order-auto-detect', next ? '1' : '0');
    }
    if (next) void runAutoDetect();
  };

  const handleAutoIntervalChange = (minutes: number) => {
    setAutoIntervalMin(minutes);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('kiditem-order-auto-interval', String(minutes));
    }
    if (autoDetect) setAutoNextRunAt(nextAutoRunAt(Date.now(), minutes * 60 * 1000));
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedMin = Number(window.localStorage.getItem('kiditem-order-auto-interval'));
    const intervalMin = AUTO_INTERVAL_OPTIONS_MIN.includes(savedMin) ? savedMin : DEFAULT_AUTO_INTERVAL_MIN;
    setAutoIntervalMin(intervalMin);
    if (window.localStorage.getItem('kiditem-order-auto-detect') === '1') {
      setAutoDetect(true);
      setAutoNextRunAt(nextAutoRunAt(Date.now(), intervalMin * 60 * 1000));
    }
  }, []);

  // 타이머가 항상 최신 runAutoDetect 를 부르도록 ref 갱신 (stale closure 방지).
  useEffect(() => {
    autoDetectRef.current = runAutoDetect;
  });

  // 카운트다운(autoNextRunAt)이 끝나면 한 번 실행하고 다음 30분 뒤로 재예약.
  useEffect(() => {
    if (!autoDetect || autoNextRunAt === null) return;
    const delay = Math.max(0, autoNextRunAt - Date.now());
    const timer = window.setTimeout(() => {
      void autoDetectRef.current().finally(() => {
        setAutoNextRunAt(nextAutoRunAt(Date.now(), autoIntervalMs));
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [autoDetect, autoNextRunAt, autoIntervalMs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
            <FileSpreadsheet size={20} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">주문 수집</h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setUploadModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          <Upload size={16} />
          업로드
        </button>
      </div>

      <OrderUploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        mallAccounts={mallAccounts}
        defaultMallKey={selectedMallKey ?? ICECREAM_MALL_KEY}
        onUpload={handleModalUpload}
      />

      {/* 오늘 주문 파이프라인: 오늘 주문 → 전송 대기 → 셀피아 전송 → 송장 전송 → 완료 */}
      <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
        <PipelineStage label="오늘 주문" value={collectionSummary.todayOrders} tone="slate" />
        <ChevronRight size={18} className="flex-none self-center text-slate-300" />
        <PipelineStage label="셀피아 전송 대기" value={collectionSummary.waiting} tone="amber" />
        <ChevronRight size={18} className="flex-none self-center text-slate-300" />
        <PipelineStage label="셀피아 전송" value={collectionSummary.sent} tone="purple" />
        <ChevronRight size={18} className="flex-none self-center text-slate-300" />
        <PipelineStage label="셀피아 송장 전송" value={collectionSummary.trackingSent} tone="sky" />
        <ChevronRight size={18} className="flex-none self-center text-slate-300" />
        <PipelineStage label="완료" value={collectionSummary.done} tone="emerald" />
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        <div className="min-w-0 xl:col-span-3">
          <OrderCollectionDailyPanel history={history} />
        </div>
        <OrderActivityFeed
          className="min-h-[430px] max-h-[460px] xl:col-span-1"
          history={history}
          events={activityEvents}
        />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Store size={18} className="text-slate-500" />
            <div>
              <div className="text-sm font-semibold text-slate-900">주문수집</div>
              <div className="text-xs text-slate-500">
                {formatNumber(configuredMallCount)} / {formatNumber(mallAccounts.length)} 계정
                {autoDetect ? ` · 자동감지 ${autoIntervalMin}분 (09–18시)` : ''}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {autoLastRunAt !== null && (
              <span className="hidden text-xs tabular-nums text-slate-400 sm:inline">
                자동감지 {formatMallCollectionTime(autoLastRunAt)}
              </span>
            )}
            <button
              type="button"
              onClick={toggleAutoDetect}
              title="설정한 간격마다 새 주문을 자동 감지합니다 (오전 9시~오후 6시, 이 페이지가 열려 있을 때)"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                autoDetect
                  ? 'border-purple-200 bg-purple-50 text-purple-700'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              <span
                className={cn('h-1.5 w-1.5 rounded-full', autoDetect ? 'bg-purple-600' : 'bg-slate-300')}
              />
              자동감지
            </button>
            <select
              value={autoIntervalMin}
              onChange={(event) => handleAutoIntervalChange(Number(event.target.value))}
              title="자동 감지 간격"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium text-slate-600 outline-none hover:bg-slate-50 focus:border-slate-400"
            >
              {AUTO_INTERVAL_OPTIONS_MIN.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes}분
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleBrowserCollectAll()}
              disabled={
                mallLoading ||
                browserCollecting ||
                collectingKeys.size > 0 ||
                enabledMallCount === 0
              }
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {browserCollecting ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              전체 수집
            </button>
            <button
              type="button"
              onClick={() => void loadMallAccounts()}
              disabled={mallLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={15} className={mallLoading ? 'animate-spin' : ''} />
              새로고침
            </button>
          </div>
        </div>

        <div className="p-5">
          {mallError ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-5 text-sm text-red-600">
              <AlertCircle size={15} />
              {mallError}
            </div>
          ) : mallLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-5 text-sm text-slate-500">
              <Loader2 size={15} className="animate-spin" />
              불러오는 중
            </div>
          ) : (
            <div className="overflow-x-auto pb-1">
              {/* 몰 5개씩 4줄 카드 그리드 */}
              <div className="grid min-w-[720px] grid-cols-5 gap-3">
                {mallAccounts.map((account) => {
                  const isOpenAccount = mallSettingsOpen && selectedMall?.key === account.key;
                  const isCollectingAccount = collectingKeys.has(account.key);
                  const collectable = isBrowserCollectableMall(account);
                  const autoDetectable = isAutoDetectableMall(account);
                  const collectionStat = mallCollectionStats.get(account.key);
                  return (
                    <div
                      key={account.key}
                      className={cn(
                        'flex flex-col rounded-xl border p-3.5 transition-colors',
                        collectable
                          ? 'border-slate-200 hover:border-purple-300'
                          : 'border-slate-100 bg-slate-50/40',
                        isOpenAccount && 'ring-1 ring-purple-300',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={cn(
                            'h-1.5 w-1.5 flex-none rounded-full',
                            collectable ? 'bg-emerald-500' : 'bg-slate-300',
                          )}
                          title={collectable ? '수집 가능' : '준비 중'}
                        />
                        <span
                          className={cn(
                            'truncate text-[13px] font-semibold',
                            collectable ? 'text-slate-900' : 'text-slate-400',
                          )}
                          title={account.name}
                        >
                          {account.name}
                        </span>
                      </div>
                      <div className="mt-2.5 grid grid-cols-2 divide-x divide-slate-200/80 overflow-hidden rounded-lg bg-slate-50">
                        <div
                          className="px-2 py-3.5 text-center"
                          title={
                            collectionStat
                              ? `오늘 수집 ${formatMallCollectionTime(collectionStat.latestAt)}`
                              : undefined
                          }
                        >
                          <div
                            className={cn(
                              'text-lg font-bold leading-none tabular-nums',
                              collectionStat && collectionStat.orderRows > 0
                                ? 'text-slate-900'
                                : 'text-slate-300',
                            )}
                          >
                            {formatNumber(collectionStat?.orderRows ?? 0)}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">당일</div>
                        </div>
                        <div className="px-2 py-3.5 text-center" title="오늘 주문 중 셀피아 미전송">
                          <div
                            className={cn(
                              'text-lg font-bold leading-none tabular-nums',
                              collectionStat && collectionStat.newRows > 0
                                ? 'text-purple-600'
                                : 'text-slate-300',
                            )}
                          >
                            {formatNumber(collectionStat?.newRows ?? 0)}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">신규</div>
                        </div>
                      </div>
                      <div className="mt-2.5 flex h-5 items-center justify-center text-[11px]">
                        {!collectable ? (
                          <span className="text-slate-300">준비 중</span>
                        ) : autoDetect && autoDetectable && autoNextRunAt !== null ? (
                          <AutoDetectCountdown
                            targetAt={autoNextRunAt}
                            totalMs={autoIntervalMs}
                            running={autoRunning}
                          />
                        ) : (
                          <span className="text-slate-300">수동</span>
                        )}
                      </div>
                      <div className="mt-2.5 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleOpenMallSettings(account)}
                          className="flex-1 rounded-md border border-slate-200 bg-white py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                        >
                          설정
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleBrowserCollectMall(account)}
                          disabled={
                            browserCollecting || // 전체 수집 중엔 개별 버튼 잠금
                            isCollectingAccount || // 이 몰이 이미 수집 중일 때만 (다른 몰은 열림)
                            !collectable
                          }
                          title={collectable ? `${account.name} 개별 수집` : '자동 수집 준비 중'}
                          className="inline-flex flex-1 items-center justify-center rounded-md bg-purple-600 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                        >
                          {isCollectingAccount ? <Loader2 size={13} className="animate-spin" /> : '수집'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      <Dialog.Root open={mallSettingsOpen} onOpenChange={handleMallSettingsOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[130] bg-black/35" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[140] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <Dialog.Title className="truncate text-sm font-semibold text-slate-900">
                  {selectedMall?.name ?? '몰 설정'}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-xs text-slate-500">
                  {selectedMall?.configured ? '계정 저장됨' : '계정 미설정'}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="닫기"
                  disabled={mallSaving}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <div className="space-y-3 px-5 py-4">
              <div className="flex justify-end">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={mallDraft.enabled}
                    onChange={(event) =>
                      setMallDraft((current) => ({ ...current, enabled: event.target.checked }))
                    }
                    disabled={!selectedMall || mallSaving}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  사용
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">접속 URL</span>
                <div className="mt-1 flex gap-2">
                  <input
                    type="url"
                    value={mallDraft.siteUrl}
                    onChange={(event) =>
                      setMallDraft((current) => ({ ...current, siteUrl: event.target.value }))
                    }
                    disabled={!selectedMall || mallSaving}
                    placeholder="https://"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={handleOpenMall}
                    disabled={!mallDraft.siteUrl}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    aria-label="몰 열기"
                  >
                    <ExternalLink size={15} />
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">로그인 ID</span>
                <input
                  type="text"
                  value={mallDraft.loginId}
                  onChange={(event) =>
                    setMallDraft((current) => ({ ...current, loginId: event.target.value }))
                  }
                  disabled={!selectedMall || mallSaving}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:opacity-50"
                />
              </label>
              <label className="block">
                <span className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600">
                  <span>비밀번호</span>
                  {selectedMall?.hasPassword && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                      저장됨
                    </span>
                  )}
                </span>
                <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-slate-400">
                  <input
                    type={mallPasswordVisible ? 'text' : 'password'}
                    value={mallDraft.password}
                    onChange={(event) =>
                      setMallDraft((current) => ({ ...current, password: event.target.value }))
                    }
                    disabled={!selectedMall || mallSaving || mallPasswordLoading}
                    placeholder={
                      mallPasswordLoading
                        ? '저장된 비밀번호 불러오는 중'
                        : selectedMall?.hasPassword
                          ? '저장된 비밀번호'
                          : '비밀번호 입력'
                    }
                    autoComplete="new-password"
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setMallPasswordVisible((visible) => !visible)}
                    disabled={!selectedMall || mallPasswordLoading}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                    aria-label={mallPasswordVisible ? '비밀번호 숨기기' : '비밀번호 보기'}
                  >
                    {mallPasswordVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  {selectedMall?.hasPassword
                    ? `저장된 비밀번호를 불러와 표시합니다.${selectedMall.passwordUpdatedAt ? ` 마지막 저장: ${formatDateTime(selectedMall.passwordUpdatedAt)}` : ''}`
                    : '저장하면 암호화되어 보관됩니다.'}
                </span>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">메모</span>
                <input
                  type="text"
                  value={mallDraft.memo}
                  onChange={(event) =>
                    setMallDraft((current) => ({ ...current, memo: event.target.value }))
                  }
                  disabled={!selectedMall || mallSaving}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:opacity-50"
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
              <div className="text-xs text-slate-500">사용 {formatNumber(enabledMallCount)}</div>
              <div className="flex items-center gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    disabled={mallSaving}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    취소
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={() => void handleSaveMallAccount()}
                  disabled={!selectedMall || mallSaving}
                  className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {mallSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  저장
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {previewItem && (
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">파일 미리보기</div>
              <div className="mt-1 max-w-full truncate text-xs text-slate-500">{previewItem.fileName}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadOrderCollectionFile(previewItem)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download size={15} />
                다운로드
              </button>
              <button
                type="button"
                onClick={() => setPreviewId(null)}
                aria-label="미리보기 닫기"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <PreviewTable rows={previewItem.previewRows} />
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">생성 파일</div>
          <div className="flex items-center gap-2">
            {selectedFileIds.size > 0 && (
              <button
                type="button"
                onClick={handleDeleteSelectedFiles}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
              >
                <Trash2 size={13} />
                선택 삭제 ({formatNumber(selectedFileIds.size)})
              </button>
            )}
            <select
              value={fileMallFilter}
              onChange={(event) => changeFileMallFilter(event.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
              aria-label="몰 필터"
            >
              <option value="">전체 몰</option>
              {fileMallOptions.map((mall) => (
                <option key={mall.key} value={mall.key}>
                  {mall.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {generatedFileGroups.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">
            {fileMallFilter ? '해당 몰의 생성 파일이 없습니다.' : '생성된 파일이 없습니다.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {generatedFileGroups.map((group) => (
              <div key={group.key}>
                <div className="flex items-center justify-between bg-slate-50 px-5 py-3">
                  <div className="text-xs font-semibold text-slate-600">{group.label}</div>
                  <div className="text-xs tabular-nums text-slate-400">{formatNumber(group.items.length)}개</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1164px] table-fixed text-sm">
                    <colgroup>
                      <col className="w-[44px]" />
                      <col className="w-[200px]" />
                      <col />
                      <col className="w-[64px]" />
                      <col className="w-[64px]" />
                      <col className="w-[210px]" />
                      <col className="w-[340px]" />
                    </colgroup>
                    <thead className="text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label="이 날짜 전체 선택"
                            checked={
                              group.items.length > 0 &&
                              group.items.every((it) => selectedFileIds.has(it.id))
                            }
                            onChange={(event) => toggleGroupSelection(group.items, event.target.checked)}
                            className="h-4 w-4 cursor-pointer accent-purple-600"
                          />
                        </th>
                        <th className="px-4 py-3 text-left font-medium">몰/원본</th>
                        <th className="px-4 py-3 text-left font-medium">파일명</th>
                        <th className="px-4 py-3 text-right font-medium">상품</th>
                        <th className="px-4 py-3 text-right font-medium">출력</th>
                        <th className="px-4 py-3 text-left font-medium">생성시각</th>
                        <th className="px-4 py-3 text-right font-medium">작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item) => (
                        <tr
                          key={item.id}
                          className={cn(
                            'border-t border-slate-100',
                            selectedFileIds.has(item.id) && 'bg-purple-50/50',
                          )}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              aria-label="선택"
                              checked={selectedFileIds.has(item.id)}
                              onChange={(event) => toggleFileSelection(item.id, event.target.checked)}
                              className="h-4 w-4 cursor-pointer accent-purple-600"
                            />
                          </td>
                          <td className="truncate px-4 py-3 text-slate-700" title={item.sourceName}>
                            {item.sourceName}
                          </td>
                          <td
                            className="truncate px-4 py-3 font-medium text-slate-900"
                            title={item.fileName}
                          >
                            {item.fileName}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                            {countLabel(item.productRows)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                            {countLabel(item.outputRows)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                            {formatDateTime(item.convertedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => void handleSendToSellpia(item)}
                                disabled={sellpiaSendingId === item.id}
                                className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {sellpiaSendingId === item.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Send size={13} />
                                )}
                                셀피아 전송
                              </button>
                              <button
                                type="button"
                                onClick={() => setPreviewId(item.id)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                <Eye size={13} />
                                미리보기
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadOrderCollectionFile(item)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                <Download size={13} />
                                다운로드
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteGeneratedFile(item)}
                                aria-label="삭제"
                                title="삭제"
                                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PipelineStage({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'slate' | 'amber' | 'purple' | 'sky' | 'emerald';
}) {
  const styles = {
    slate: { box: 'border-slate-200 bg-white', label: 'text-slate-500', value: 'text-slate-900' },
    amber: { box: 'border-amber-200 bg-amber-50', label: 'text-amber-600', value: 'text-amber-700' },
    purple: { box: 'border-purple-200 bg-purple-50', label: 'text-purple-600', value: 'text-purple-700' },
    sky: { box: 'border-sky-200 bg-sky-50', label: 'text-sky-600', value: 'text-sky-700' },
    emerald: { box: 'border-emerald-200 bg-emerald-50', label: 'text-emerald-600', value: 'text-emerald-700' },
  }[tone];
  return (
    <div className={cn('min-w-[128px] flex-1 rounded-xl border px-4 py-3', styles.box)}>
      <div className={cn('truncate text-xs font-medium', styles.label)} title={label}>
        {label}
      </div>
      <div className={cn('mt-1 text-2xl font-bold tabular-nums tracking-tight', styles.value)}>
        {formatNumber(value)}
      </div>
    </div>
  );
}

function AutoDetectCountdown({
  targetAt,
  totalMs,
  running,
}: {
  targetAt: number;
  totalMs: number;
  running: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = Math.max(0, targetAt - now);
  const progress = Math.max(0, Math.min(1, remaining / totalMs));
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const label = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  if (!running && !isWithinAutoBusinessHours(now)) {
    return (
      <span
        className="text-xs text-slate-400"
        title="자동 수집은 오전 9시~오후 6시에만 실행됩니다 (다음 오전 9시 대기)"
      >
        업무 외
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5" title="다음 자동 감지까지 남은 시간">
      {running ? (
        <Loader2 size={16} className="animate-spin text-purple-600" />
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" className="-rotate-90">
          <circle cx="12" cy="12" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="3" />
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke="#9333ea"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
          />
        </svg>
      )}
      <span className={cn('text-xs tabular-nums', running ? 'text-purple-600' : 'text-slate-500')}>
        {running ? '감지 중' : label}
      </span>
    </span>
  );
}

function PreviewTable({ rows }: { rows: string[][] }) {
  if (rows.length === 0) {
    return <div className="px-5 py-8 text-center text-sm text-slate-400">미리볼 데이터가 없습니다.</div>;
  }

  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="min-w-max border-separate border-spacing-0 text-xs">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex === 0 ? 'sticky top-0 z-10 bg-slate-100' : 'bg-white'}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`${rowIndex}-${cellIndex}`}
                  className={cn(
                    'max-w-[260px] border-b border-r border-slate-100 px-3 py-2 text-left align-top text-slate-700',
                    rowIndex === 0 && 'font-semibold text-slate-900',
                    cellIndex === 0 && 'border-l',
                  )}
                >
                  <div className="truncate" title={cell}>
                    {cell || '-'}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function countLabel(value: number | null): string {
  return value === null ? '-' : formatNumber(value);
}

function groupHistoryByDay(items: ConversionHistoryItem[]): Array<{
  key: string;
  label: string;
  items: ConversionHistoryItem[];
}> {
  const groups: Array<{ key: string; label: string; items: ConversionHistoryItem[] }> = [];
  const byKey = new Map<string, { key: string; label: string; items: ConversionHistoryItem[] }>();

  for (const item of items) {
    const key = item.collectionDate ?? dayKey(item.convertedAt);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: dayLabel(key), items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups;
}

/** 몰별 "당일" 집계: orderRows=오늘 수집한 주문, newRows=그 중 셀피아 미전송(신규주문). */
function buildMallCollectionStats(
  items: ConversionHistoryItem[],
  today: string,
): Map<string, MallCollectionStat> {
  // 몰별 당일 집계. ⭐재수집해도 같은 주문번호는 1번만 카운트:
  //  - 주문번호가 있는 몰: 오늘 수집한 주문번호의 합집합 크기(중복 제거).
  //  - 주문번호를 못 받는 몰(엑셀 passthrough 등): 개별 수집 카운트의 "최댓값"(합산 X → 재수집해도 안 늘어남).
  const acc = new Map<
    string,
    {
      orders: Set<string>;
      sentOrders: Set<string>;
      fallbackByBucket: Map<string, number>;
      fallbackUnsentByBucket: Map<string, number>;
      productRows: number;
      latestAt: number;
    }
  >();

  for (const item of items) {
    const dayKeyOf = item.collectionDate ?? dayKey(item.convertedAt);
    if (dayKeyOf !== today) continue; // 당일만

    const mallKey = resolveHistoryMallKey(item);
    if (!mallKey) continue;

    const current =
      acc.get(mallKey) ??
      {
        orders: new Set<string>(),
        sentOrders: new Set<string>(),
        fallbackByBucket: new Map<string, number>(),
        fallbackUnsentByBucket: new Map<string, number>(),
        productRows: 0,
        latestAt: item.convertedAt,
      };

    const orderNumbers = item.orderNumbers ?? [];
    if (orderNumbers.length > 0) {
      for (const orderNo of orderNumbers) {
        current.orders.add(orderNo);
        if (item.sentAt) current.sentOrders.add(orderNo); // 전송된 주문번호 = 더는 신규 아님
      }
    } else {
      const count = getHistoryOrderCount(item) ?? 0;
      const bucket = getHistoryCollectionBucket(item);
      current.fallbackByBucket.set(bucket, Math.max(current.fallbackByBucket.get(bucket) ?? 0, count));
      if (!item.sentAt) {
        current.fallbackUnsentByBucket.set(
          bucket,
          Math.max(current.fallbackUnsentByBucket.get(bucket) ?? 0, count),
        );
      }
    }
    current.productRows = Math.max(current.productRows, item.productRows ?? 0);
    current.latestAt = Math.max(current.latestAt, item.convertedAt);
    acc.set(mallKey, current);
  }

  const stats = new Map<string, MallCollectionStat>();
  for (const [mallKey, a] of acc) {
    const hasOrderNumbers = a.orders.size > 0;
    const unsentOrders = [...a.orders].filter((orderNo) => !a.sentOrders.has(orderNo)).length;
    stats.set(mallKey, {
      orderRows: hasOrderNumbers ? a.orders.size : sumMapValues(a.fallbackByBucket),
      newRows: hasOrderNumbers ? unsentOrders : sumMapValues(a.fallbackUnsentByBucket),
      productRows: a.productRows,
      latestAt: a.latestAt,
    });
  }

  return stats;
}

function sumMapValues(values: Map<string, number>): number {
  let sum = 0;
  for (const value of values.values()) sum += value;
  return sum;
}

function coupangDirectOrderNumbers(pos: CoupangDirectPo[]): string[] {
  const numbers = new Set<string>();
  for (const po of pos) {
    const seq = String(po.seq ?? '').trim();
    if (seq) numbers.add(seq);
  }
  return [...numbers];
}

function resolveHistoryMallKey(item: ConversionHistoryItem): string | null {
  if (item.mallKey) return item.mallKey;

  const searchable = `${item.mallName ?? ''} ${item.sourceName} ${item.fileName}`.toLowerCase();
  for (const [key, label] of Object.entries(MALL_LABELS)) {
    if (searchable.includes(key.toLowerCase()) || searchable.includes(label.toLowerCase())) {
      return key;
    }
  }

  return null;
}

function isBrowserCollectableMall(account: OrderCollectionMallAccount): boolean {
  if (account.key === 'kidsnote') return true; // 확장 세션 스크래핑 — 계정설정 불필요
  if (account.key === 'kkomangse') return true; // 확장이 EduPre 엑셀 export fetch — 계정설정 불필요
  if (account.key === 'onch') return true; // 확장이 onch3 리스트+상세모달 스크랩 — 계정설정 불필요
  if (account.key === 'domeggook') return true; // 확장이 도매꾹 엑셀 CDN fetch — 계정설정 불필요
  if (account.key === 'kidkids') return true; // 확장이 키드키즈 출고관리+주문서 스크랩 — 계정설정 불필요
  if (account.key === 'lotte-on') return true; // 확장이 롯데ON 배송관리 엑셀 CDN 다운로드 — 계정설정 불필요
  if (account.key === 'gs-shop') return true; // 확장이 GS샵 배송관리 조회+다운로드(클라이언트 조립 xlsx) — 계정설정 불필요
  if (account.key === 'always') return true; // 확장이 올웨이즈 엑셀추출하기(클라이언트 조립 xlsx) — 계정설정 불필요
  if (account.key === 'boribori') return true; // 확장이 출고대기 일괄엑셀(사유만) 언마스킹 다운로드 — 계정설정 불필요
  if (account.key === 'teacher-mall') return true; // 확장이 티쳐몰 출고전 셀피아양식 엑셀 다운로드(passthrough) — 계정설정 불필요
  if (account.key === 'coupang-direct') return true; // 확장이 발주확정 발주+품목(/scm)+센터주소 수집 — 계정설정 불필요
  if (account.key === 'art09') return true; // 확장이 Cafe24 주문목록+상세 배송정보 스크랩 — 계정설정 불필요
  return account.key === ICECREAM_MALL_KEY && account.configured && account.enabled;
}

/**
 * 자동감지(신규 주문 diff)는 현재 아이스크림몰만 지원한다. diff 로직이 아이스크림몰 행 포맷 전용이라,
 * 다른 몰에 적용하면 아이스크림몰 데이터를 그 몰 이름으로 잘못 저장한다(과거 버그). 나머지 몰은 수동 수집.
 */
function isAutoDetectableMall(account: OrderCollectionMallAccount): boolean {
  return account.key === ICECREAM_MALL_KEY && isBrowserCollectableMall(account);
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

function formatMallCollectionTime(timestamp: number): string {
  const value = new Date(timestamp);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${month}.${day} ${hours}:${minutes}`;
}

function draftFromMallAccount(account: OrderCollectionMallAccount): MallAccountDraft {
  return {
    loginId: account.loginId ?? '',
    password: '',
    siteUrl: account.siteUrl ?? '',
    memo: account.memo ?? '',
    enabled: account.enabled,
  };
}

function orderCollectionError(err: unknown, fallback: string): string {
  const message = friendlyError(err) ?? fallback;
  return message === 'Failed to fetch'
    ? 'API 서버에 연결하지 못했습니다. 백엔드 실행 상태 또는 브라우저 접속 주소를 확인해주세요.'
    : message;
}

function todayYmd(): string {
  const now = new Date();
  return dayKey(now.getTime());
}

/** 자동 수집 허용 시간(오전 9시 ~ 오후 6시 직전, 로컬 기준)인지. */
function isWithinAutoBusinessHours(ms: number): boolean {
  const hour = new Date(ms).getHours();
  return hour >= AUTO_BUSINESS_START_HOUR && hour < AUTO_BUSINESS_END_HOUR;
}

/** 다음 자동 실행 시각: 업무시간이면 +interval, 아니면 다음 영업일(또는 오늘) 오전 9시. */
function nextAutoRunAt(fromMs: number, intervalMs: number): number {
  const candidate = fromMs + intervalMs;
  if (isWithinAutoBusinessHours(candidate)) return candidate;
  const next = new Date(candidate);
  if (next.getHours() >= AUTO_BUSINESS_END_HOUR) {
    next.setDate(next.getDate() + 1); // 마감 후 → 다음 날 오전 9시
  }
  next.setHours(AUTO_BUSINESS_START_HOUR, 0, 0, 0); // 마감 전(새벽)이면 오늘 오전 9시
  return next.getTime();
}

function dayKey(timestamp: number): string {
  const now = new Date(timestamp);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayLabel(key: string): string {
  const [year, month, day] = key.split('-');
  return `${year}. ${month}. ${day}.`;
}
