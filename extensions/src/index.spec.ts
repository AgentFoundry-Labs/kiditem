import { describe, expect, it } from 'vitest';
import manifest from '../kiditem-os/manifest.json';
import * as KidItemRuntime from './index';

describe('KidItemRuntime', () => {
  it('speaks the loadable manifest version', () => {
    expect(KidItemRuntime.version).toBe(manifest.version);
    expect(KidItemRuntime.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
