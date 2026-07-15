'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function useUrlControlledTab<const Values extends readonly string[]>({
  key,
  values,
  defaultValue,
}: {
  key: string;
  values: Values;
  defaultValue: Values[number];
}): readonly [Values[number], (value: Values[number]) => void] {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedValue = searchParams.get(key);
  const value = values.find((candidate) => candidate === requestedValue) ?? defaultValue;

  const setValue = useCallback((nextValue: Values[number]) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set(key, nextValue);
    const query = nextParams.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }, [key, pathname, router, searchParams]);

  return [value, setValue] as const;
}
