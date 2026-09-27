import { describe, expect, it } from 'vitest';
import { registrationSubmitAllowed } from './registration-submit-gate';

describe('registrationSubmitAllowed (ADR-0019, KID-364)', () => {
  it('lets the browser press [등록] only for a form or API mall whose send is not an approval request', () => {
    expect(registrationSubmitAllowed('coupang')).toBe(true);
    expect(registrationSubmitAllowed('kakao')).toBe(true);
    expect(registrationSubmitAllowed('kidsnote')).toBe(false);
    expect(registrationSubmitAllowed('always')).toBe(false);
    expect(registrationSubmitAllowed('onch')).toBe(false);
    expect(registrationSubmitAllowed('no-such-mall')).toBe(false);
  });
});
