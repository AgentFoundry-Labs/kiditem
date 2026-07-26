'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';

type ParamValues = Readonly<Record<string, string>>;

interface SessionBackedUrlStateOptions<State> {
  storageKey: string;
  paramKeys: readonly string[];
  createDefault: () => State;
  parse: (values: ParamValues, defaults: State) => State;
  serialize: (state: State) => ParamValues;
}

interface InitialState<State> {
  defaults: State;
  hasUrlState: boolean;
  state: State;
}

export function useSessionBackedUrlState<State>({
  storageKey,
  paramKeys,
  createDefault,
  parse,
  serialize,
}: SessionBackedUrlStateOptions<State>): readonly [
  State,
  Dispatch<SetStateAction<State>>,
  boolean,
] {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const initialRef = useRef<InitialState<State> | null>(null);

  if (initialRef.current === null) {
    const defaults = createDefault();
    const urlValues = pickParams(searchParams, paramKeys);
    const hasUrlState = Object.keys(urlValues).length > 0;
    initialRef.current = {
      defaults,
      hasUrlState,
      state: hasUrlState ? parse(urlValues, defaults) : defaults,
    };
  }

  const initial = initialRef.current;
  const [state, setState] = useState(initial.state);
  const [ready, setReady] = useState(initial.hasUrlState);

  useEffect(() => {
    if (initial.hasUrlState) return;
    const stored = readStoredValues(storageKey, paramKeys);
    if (stored) setState(parse(stored, initial.defaults));
    setReady(true);
  }, [initial, paramKeys, parse, storageKey]);

  useEffect(() => {
    if (!ready) return;
    const encoded = serialize(state);
    safeStorageSet('session', storageKey, JSON.stringify(encoded));

    const next = new URLSearchParams(search);
    for (const key of paramKeys) {
      const value = encoded[key];
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const nextSearch = next.toString();
    if (nextSearch === search) return;
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, { scroll: false });
  }, [paramKeys, pathname, ready, router, search, serialize, state, storageKey]);

  return [state, setState, ready] as const;
}

function pickParams(
  params: Pick<URLSearchParams, 'get'>,
  keys: readonly string[],
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null) values[key] = value;
  }
  return values;
}

function readStoredValues(
  storageKey: string,
  keys: readonly string[],
): Record<string, string> | null {
  const raw = safeStorageGet('session', storageKey);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const values: Record<string, string> = {};
    for (const key of keys) {
      if (typeof record[key] === 'string') values[key] = record[key];
    }
    return values;
  } catch {
    return null;
  }
}
