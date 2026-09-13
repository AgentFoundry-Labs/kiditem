import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useRocketPoSource } from './use-rocket-po-source';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it('only reads on mount, retains an uncertain request key, and retires it after matching polled FAILED', async () => {
  const channelAccountId = '22222222-2222-4222-8222-222222222222';
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const plan = { channelAccountId, from: '2026-07-01', to: '2026-07-31', status: '', dateType: 'WAREHOUSING_PLAN_DATE',
    requireConfirmation: true, sourceType: 'coupang_rocket_po_catalog', parserVersion: 'rocket-po-v1',
    vendorExpectations: { rocketVendorId: null, sharedCoupangVendorId: null } };
  const attempt = { attemptId, channelAccountId, state: 'RUNNING', generation: '1', plan,
    expiresAt: '2099-01-01T00:00:00Z', actualCutoffAt: null, errorCode: null, errorMessage: null };
  let current = { ...attempt };
  let started = false;
  const keys: string[] = [];
  const methods: string[] = [];
  localStorage.setItem('kiditem-order-ext-id', 'rocket-extension');
  vi.stubGlobal('chrome', { runtime: { sendMessage(_id: string, message: Record<string, unknown>, callback: (result: unknown) => void) {
    if (message.action === 'collectRocketPoRows') throw new Error('port disconnected');
    callback(message.action === 'ping' ? { success: true, version: 'test', capabilities: {
      kiditemEnvironmentProfilesV1: true, coupangRocketPoSourceOwnerV1: true,
    } } : { success: true });
  } } });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname;
    methods.push(init?.method ?? 'GET');
    if (path === '/api/auth/extension-handoff') return Response.json({ token: 'a'.repeat(43) });
    if (path.endsWith('/attempts')) {
      keys.push(new Headers(init?.headers).get('Idempotency-Key')!);
      started = true; return Response.json(current);
    }
    if (path.endsWith('/source')) return Response.json({ ready: false,
      latestAttempt: started ? current : null, latestComplete: null });
    return Response.json(current);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const hook = renderHook(() => useRocketPoSource(channelAccountId), { wrapper });
  await waitFor(() => expect(hook.result.current.data?.ready).toBe(false));
  expect(methods.every((method) => method === 'GET')).toBe(true);
  const collect = () => hook.result.current.collect({ from: plan.from, to: plan.to,
    createPreviewRequest: () => ({ channelAccountId, sourceImportRunId: attemptId, editedQuantities: {} }) });
  await act(async () => { await expect(collect()).rejects.toMatchObject({ attempt: { state: 'RUNNING' } }); });
  await act(async () => { await expect(collect()).rejects.toMatchObject({ attempt: { state: 'RUNNING' } }); });
  expect(keys[1]).toBe(keys[0]);
  current = { ...attempt, state: 'FAILED' };
  await act(async () => { await hook.result.current.refetch(); });
  await waitFor(() => expect(hook.result.current.data?.latestAttempt?.state).toBe('FAILED'));
  await act(async () => { await expect(collect()).rejects.toMatchObject({ attempt: { state: 'FAILED' } }); });
  expect(keys[2]).not.toBe(keys[0]);
  hook.unmount(); client.clear();
});
