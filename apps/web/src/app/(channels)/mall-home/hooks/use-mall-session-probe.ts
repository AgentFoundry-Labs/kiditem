'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MallOperationOutcomeSummaryRow } from '@kiditem/shared/mall-operation-outcomes';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import { clearMallAutoLoginBlock } from '@/lib/mall-login-block';
import { recordMallOperationOutcome } from '@/lib/mall-operation-outcomes-api';
import {
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

const CACHE_KEY = 'kiditem.mall-home.session-probe.v1';
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
 * 쇼핑몰 홈을 열면 연결된 몰마다 로그인 상태를 조용히 확인한다 — 로그인은 하지 않는다.
 *
 * 확장이 한 번에 세 몰씩 확인하고, 결과가 오는 대로 화면에 반영한다. 10분 안에 다시 열면
 * 이 탭에 둔 결과를 쓴다. '다시 확인'은 바로 다시 묻는다. 확장이 없거나 옛 버전이면 확인하지
 * 않고 그렇다고 알린다.
 *
 * 로그인됨 · 로그인 필요는 기억(`login_check`)에 남는다. 기억 요약을 아직 못 받았으면 적지
 * 않고, 받은 뒤에는 상태가 바뀌었거나 6시간이 지났을 때만 적는다.
 */
export function useMallSessionProbe(
  mallKeys: readonly string[] | null,
  remembered: readonly MallOperationOutcomeSummaryRow[] | null,
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
  const recordedRef = useRef(new Map<string, RecordedLoginCheck>());
  useEffect(() => {
    rememberedRef.current = remembered;
    queryClientRef.current = queryClient;
  }, [remembered, queryClient]);
  const keysKey = useMemo(() => (mallKeys ? [...new Set(mallKeys)].sort().join(',') : ''), [mallKeys]);

  const run = useCallback(
    async (force: boolean) => {
      const keys = keysKey ? keysKey.split(',') : [];
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
        let cursor = 0;
        const worker = async () => {
          while (cursor < keys.length) {
            const key = keys[cursor];
            cursor += 1;
            if (key === undefined) break;
            const result = await probeMallSession(runtime.extensionId, key);
            next[key] = result;
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
            if (record && known && shouldRememberLogin(record, result.checkedAt, known, recordedRef.current.get(key))) {
              recordedRef.current.set(key, { outcome: record.outcome, at: result.checkedAt });
              recordings.push(recordMallOperationOutcome(record));
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, keys.length) }, () => worker()));
        const at = Date.now();
        safeStorageSet('session', CACHE_KEY, JSON.stringify({ at, results: next } satisfies ProbeCache));
        setCheckedAt(at);
        setStatus('done');
        if (recordings.length > 0) {
          await Promise.all(recordings);
          void queryClientRef.current.invalidateQueries({ queryKey: queryKeys.mallOperationOutcomes.all });
        }
      } finally {
        runningRef.current = false;
      }
    },
    [keysKey],
  );

  useEffect(() => {
    void run(false);
  }, [run]);

  const recheck = useCallback(() => {
    void run(true);
  }, [run]);

  return { results, checking, status, checkedAt, extensionVersion, recheck };
}
