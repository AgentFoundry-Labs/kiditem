import { afterEach, describe, expect, it, vi } from 'vitest';
import * as KidItemRuntime from './index';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('KidItemRuntime', () => {
  it('reports the installed manifest version at call time', () => {
    vi.stubGlobal('chrome', { runtime: { getManifest: () => ({ version: '9.8.7' }) } });

    expect(KidItemRuntime.version()).toBe('9.8.7');
  });
});
