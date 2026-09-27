import { describe, expect, it } from 'vitest';
import { shouldPressRegister } from './submit-gate';

// ADR-0019 관문 세 조건: 실행이 [등록]을 부탁했고(plan.submit), 그 몰 명세에 검증된 누르기(`submit`)가 있고, 채우기에 경고·수동
// 단계가 없다. 옛 `executionContext` 세 칸 검사는 실행 계약(token·plan)이 대신한다.
describe('shouldPressRegister — [등록]을 누를지 정하는 한 곳(ADR-0019)', () => {
  const clean = { warnings: [], manualSteps: [] };

  it.each([
    [{ submit: true, verifiedSubmit: true, ...clean }, { press: true }],
    [{ submit: false, verifiedSubmit: true, ...clean }, { press: false, skipped: null }],
    [{ submit: true, verifiedSubmit: false, ...clean }, { press: false, skipped: 'no_verified_submit' }],
    [{ submit: false, verifiedSubmit: false, ...clean }, { press: false, skipped: null }],
    [{ submit: true, verifiedSubmit: true, warnings: ['상세 사진을 올리지 못했습니다'], manualSteps: [] }, { press: false, skipped: 'fill_warnings' }],
    [{ submit: true, verifiedSubmit: true, warnings: [], manualSteps: ['고시를 직접 고르세요'] }, { press: false, skipped: 'manual_steps' }],
    [{ submit: true, verifiedSubmit: false, warnings: ['x'], manualSteps: ['y'] }, { press: false, skipped: 'no_verified_submit' }],
  ])('%j → %j', (input, expected) => {
    expect(shouldPressRegister(input)).toEqual(expected);
  });
});
