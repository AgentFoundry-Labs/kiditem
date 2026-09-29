import { describe, expect, it } from 'vitest';
import { environmentForSender, environmentForTab, requireEnvironment, TAB_BINDINGS_KEY } from './environment';

describe('KidItem 환경(보내는 창 origin → 환경·API 주소)', () => {
  it('로컬 웹 창은 local, API는 4000번이다', () => {
    const environment = environmentForSender('http://localhost:3000/orders?tab=1');
    expect(environment).toEqual({
      environmentId: 'local',
      webOrigin: 'http://localhost:3000',
      apiOrigin: 'http://localhost:4000',
      webUrlPattern: 'http://localhost:3000/*',
    });
  });

  it('사무실 웹 창은 office, API는 같은 주소다', () => {
    expect(environmentForSender('http://kiditem-office/dashboard')?.apiOrigin).toBe('http://kiditem-office');
  });

  it('모르는 origin·주소 아닌 값은 환경이 없다(거절)', () => {
    expect(environmentForSender('http://localhost:3001/')).toBeNull();
    expect(environmentForSender('https://kiditem-office/')).toBeNull();
    expect(environmentForSender('not a url')).toBeNull();
    expect(environmentForSender(undefined)).toBeNull();
  });

  it('환경 id는 표에 있는 것만 받는다', () => {
    expect(requireEnvironment('office').webOrigin).toBe('http://kiditem-office');
    expect(() => requireEnvironment('staging')).toThrow();
  });

  it('탭 환경은 팝업이 묶어 둔 옛 저장 키에서 읽는다(모르는 값은 없음)', async () => {
    const stored: Record<string, unknown> = { [TAB_BINDINGS_KEY]: { 12: 'office', 13: 'staging' } };
    const storage = { get: async (key: string) => ({ [key]: stored[key] }) };
    expect(TAB_BINDINGS_KEY).toBe('kiditem_coupang_environment_tab_bindings_v1');
    expect(await environmentForTab(storage, 12)).toBe('office');
    expect(await environmentForTab(storage, 13)).toBeNull();
    expect(await environmentForTab(storage, 99)).toBeNull();
    expect(await environmentForTab(storage, undefined)).toBeNull();
  });
});
