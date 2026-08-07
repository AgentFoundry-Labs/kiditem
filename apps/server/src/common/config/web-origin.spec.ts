import { describe, expect, it } from 'vitest';
import { requireWebOrigin } from './web-origin';

describe('requireWebOrigin', () => {
  it('rejects a URL with a path because WEB_ORIGIN must be an origin', () => {
    expect(() => requireWebOrigin({
      WEB_ORIGIN: 'http://kiditem-office/app',
    })).toThrow('WEB_ORIGIN은 경로 없는 canonical http(s) origin이어야 합니다');
  });
});
