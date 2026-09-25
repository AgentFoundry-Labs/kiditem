import { describe, expect, it } from 'vitest';
import { registerSite, registeredSites, siteFactoryFor } from './registry';

describe('sites/registry — 사이트가 자기 이름으로 등록하고 입구가 이름으로 찾는다', () => {
  it('등록한 사이트를 이름으로 찾고, 없는 이름은 null이다', () => {
    const factory = { name: 'spec-lookup', create: () => ({ handle: true }) };
    registerSite(factory);

    expect(siteFactoryFor('spec-lookup')).toBe(factory);
    expect(siteFactoryFor('spec-missing')).toBeNull();
  });

  it('같은 이름을 두 번 등록하면 던진다', () => {
    registerSite({ name: 'spec-dup', create: () => null });

    expect(() => registerSite({ name: 'spec-dup', create: () => null })).toThrow('duplicate site: spec-dup');
  });

  it('등록된 사이트 목록은 이름 사전순이다', () => {
    registerSite({ name: 'spec-z', create: () => null });
    registerSite({ name: 'spec-a', origin: 'https://a.example.com', create: () => null });

    const names = registeredSites().map((site) => site.name).filter((name) => ['spec-a', 'spec-z'].includes(name));
    expect(names).toEqual(['spec-a', 'spec-z']);
  });
});
