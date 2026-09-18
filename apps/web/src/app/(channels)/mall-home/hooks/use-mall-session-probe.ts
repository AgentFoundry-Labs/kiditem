'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MallOperationOutcomeSummaryRow } from '@kiditem/shared/mall-operation-outcomes';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import { clearMallAutoLoginBlock } from '@/lib/mall-login-block';
import { recordMallOperationOutcome } from '@/lib/mall-operation-outcomes-api';
import {
  couldNotLook,
  detectMallSessionProbe,
  probeMallSession,
  type MallSessionProbeResult,
} from '@/lib/mall-session-probe';
import { queryKeys } from '@/lib/query-keys';
import {
  loginCheckRecord,
  shouldRememberLogin,
  type MallSessionProbeStatus,
  type RecordedLoginCheck,
} from '../lib/mall-session';

// v2: 결과가 셋(로그인됨 · 인증 필요 · 로그인 필요)으로 바뀌어 옛 캐시(확인 불가)를 읽지 않는다.
const CACHE_KEY = 'kiditem.mall-home.session-probe.v2';
/** 이 시간 안에 다시 열면 몰에 다시 묻지 않는다 — 몰에 부담을 주지 않게. */
const CACHE_TTL_MS = 10 * 60 * 1000;
/** 한 번에 확인하는 몰 수. */
const CONCURRENCY = 3;

interface ProbeCache {
  at: number;
  results: Record<string, MallSessionProbeResult>;
}

function readCache(): ProbeCache | null {
  const raw = safeStorageGet('session', CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ProbeCache>;
    if (typeof parsed.at !== 'number' || !parsed.results || typeof parsed.results !== 'object') return null;
    return { at: parsed.at, results: parsed.results };
  } catch {
    return null;
  }
}

/**
 * 결과를 이 탭에 둔다. 전체를 본 결과(`fullAt`)는 통째로 바꾸고, 일부만 다시 본 결과는 두었던
 * 나머지와 합친다 — '마지막으로 다 확인한 때'는 전체를 본 때만 움직인다.
 */
function writeCache(results: Record<string, MallSessionProbeResult>, fullAt: number | null): void {
  const previous = fullAt === null ? readCache() : null;
  const cache: ProbeCache = fullAt === null
    ? { at: previous?.at ?? Date.now(), results: { ...(previous?.results ?? {}), ...results } }
    : { at: fullAt, results };
  safeStorageSet('session', CACHE_KEY, JSON.stringify(cache));
}

/**
 * 쇼핑몰 홈을 열면 연결된 몰마다 로그인 상태를 확인한다 — 로그인은 하지 않는다.
 *
 * 확장이 한 번에 세 몰씩 확인하고, 결과가 오는 대로 화면에 반영한다. 조용히 읽어 모르는 몰은
 * 확장이 관리자 화면을 백그라운드 탭에 열어 보고 바로 닫는다 — 그래서 결과는 로그인됨 ·
 * 인증 필요 · 로그인 필요 셋 중 하나다. 화면을 보지 못한 몰은 바로 로그인 필요로 내지 않고,
 * 다른 몰을 다 본 뒤 한 곳씩 한 번 더 본다. 10분 안에 다시 열면 이 탭에 둔 결과를 쓴다.
 * '다시 확인'은 바로 다시 묻는다. '실패만 다시 확인'은 로그인 필요 · 인증 필요로 나온 몰만,
 * `recheckMall` 은 한 몰만 다시 본다(로그인을 다시 시도한 뒤). 확장이 없거나 옛 버전이면
 * 확인하지 않고 그렇다고 알린다.
 *
 * 로그인됨 · 인증 필요 · 로그인 필요는 기억(`login_check`)에 남는다(우리 쪽 사정으로 몰을 못 본
 * 결과는 빼고). 기억 요약을 아직 못 받았으면 적지
 * 않고, 받은 뒤에는 상태가 바뀌었거나 6시간이 지났을 때만 적는다.
 */
export function useMallSessionProbe(
  mallKeys: readonly string[] | null,
  remembered: readonly MallOperationOutcomeSummaryRow[] | null,
  /** 몰마다 쇼핑몰 계정에 저장된 사이트 주소. 고정 확인 주소가 없는 몰은 이 화면을 열어 본다. */
  siteUrls: Readonly<Record<string, string | null>> = {},
  /**
   * 사이트 주소를 다 받았는가. 받기 전에 확인하면 주소가 필요한 몰이 '확인할 주소 없음'으로
   * 로그인 필요가 된다 — 받을 때까지(또는 받기에 실패할 때까지) 기다린다.
   */
  sitesReady = true,
) {
  const queryClient = useQueryClient();
  const [results, setResults] = useState<Record<string, MallSessionProbeResult>>({});
  const [checking, setChecking] = useState<ReadonlySet<string>>(() => new Set());
  const [status, setStatus] = useState<MallSessionProbeStatus>('idle');
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [extensionVersion, setExtensionVersion] = useState<string | null>(null);
  const runningRef = useRef(false);
  const rememberedRef = useRef(remembered);
  const queryClientRef = useRef(queryClient);
  const siteUrlsRef = useRef(siteUrls);
  const recordedRef = useRef(new Map<string, RecordedLoginCheck>());
  const resultsRef = useRef(results);
  useEffect(() => {
    rememberedRef.current = remembered;
    queryClientRef.current = queryClient;
    siteUrlsRef.current = siteUrls;
    resultsRef.current = results;
  }, [remembered, queryClient, siteUrls, results]);
  const keysKey = useMemo(() => (mallKeys ? [...new Set(mallKeys)].sort().join(',') : ''), [mallKeys]);

  /**
   * 한 몰의 결과를 화면 · 자동 로그인 차단 · 기억에 반영한다. 기억에 적었으면 그 약속을 돌려준다.
   */
  const apply = useCallback((key: string, result: MallSessionProbeResult): Promise<void> | null => {
    setResults((current) => ({ ...current, [key]: result }));
    setChecking((current) => {
      const rest = new Set(current);
      rest.delete(key);
      return rest;
    });
    // 사람이 직접 로그인했다 — 막아 뒀던 자동 로그인을 다시 연다. 이 경로로 확인해도
    // 풀려야 한다(서버 일괄 확인에만 넣으면 화면에서 본 로그인은 표시가 안 풀린다).
    if (result.state === 'signed_in') clearMallAutoLoginBlock(key);
    const record = loginCheckRecord(result);
    const known = rememberedRef.current;
    if (!record || !known || !shouldRememberLogin(record, result.checkedAt, known, recordedRef.current.get(key))) {
      return null;
    }
    recordedRef.current.set(key, { outcome: record.outcome, at: result.checkedAt });
    return recordMallOperationOutcome(record);
  }, []);

  const run = useCallback(
    async (force: boolean, only?: readonly string[]) => {
      const all = keysKey ? keysKey.split(',') : [];
      const keys = only ? all.filter((key) => only.includes(key)) : all;
      if (keys.length === 0 || runningRef.current) return;
      const cache = force ? null : readCache();
      if (cache && Date.now() - cache.at < CACHE_TTL_MS && keys.every((key) => cache.results[key])) {
        setResults(cache.results);
        setCheckedAt(cache.at);
        setStatus('done');
        return;
      }
      runningRef.current = true;
      try {
        const runtime = await detectMallSessionProbe();
        if (runtime.status === 'outdated') {
          setExtensionVersion(runtime.version);
          setStatus('outdated');
          return;
        }
        if (runtime.status !== 'ready') {
          setStatus('no_extension');
          return;
        }
        setStatus('running');
        setChecking(new Set(keys));
        const next: Record<string, MallSessionProbeResult> = {};
        const recordings: Promise<void>[] = [];
        const take = (key: string, result: MallSessionProbeResult) => {
          next[key] = result;
          const recording = apply(key, result);
          if (recording) recordings.push(recording);
        };
        const lookAgain: string[] = [];
        let cursor = 0;
        const worker = async () => {
          while (cursor < keys.length) {
            const key = keys[cursor];
            cursor += 1;
            if (key === undefined) break;
            const result = await probeMallSession(runtime.extensionId, key, siteUrlsRef.current[key] ?? null);
            if (couldNotLook(result)) lookAgain.push(key);
            else take(key, result);
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, keys.length) }, () => worker()));
        for (const key of lookAgain) {
          take(key, await probeMallSession(runtime.extensionId, key, siteUrlsRef.current[key] ?? null));
        }
        const at = Date.now();
        writeCache(next, only ? null : at);
        if (!only) setCheckedAt(at);
        setStatus('done');
        if (recordings.length > 0) {
          await Promise.all(recordings);
          void queryClientRef.current.invalidateQueries({ queryKey: queryKeys.mallOperationOutcomes.all });
        }
      } finally {
        runningRef.current = false;
      }
    },
    [keysKey, apply],
  );

  useEffect(() => {
    if (sitesReady) void run(false);
  }, [run, sitesReady]);

  const recheck = useCallback(() => {
    void run(true);
  }, [run]);

  const recheckFailed = useCallback(() => {
    const failed = Object.values(resultsRef.current)
      .filter((result) => result.state !== 'signed_in')
      .map((result) => result.mallKey);
    if (failed.length > 0) void run(true, failed);
  }, [run]);

  /**
   * 한 몰만 다시 본다 — 로그인을 다시 시도한 뒤. 전체 확인이 도는 중이어도 기다리지 않는다
   * (그 몰은 전체 확인도 한 번 더 보지만, 둘 다 몰을 본 사실이다).
   */
  const recheckMall = useCallback(
    async (key: string) => {
      const runtime = await detectMallSessionProbe();
      if (runtime.status !== 'ready') return;
      setChecking((current) => new Set(current).add(key));
      const result = await probeMallSession(runtime.extensionId, key, siteUrlsRef.current[key] ?? null);
      const recording = apply(key, result);
      writeCache({ [key]: result }, null);
      if (recording) {
        await recording;
        void queryClientRef.current.invalidateQueries({ queryKey: queryKeys.mallOperationOutcomes.all });
      }
    },
    [apply],
  );

  return { results, checking, status, checkedAt, extensionVersion, recheck, recheckFailed, recheckMall };
}
