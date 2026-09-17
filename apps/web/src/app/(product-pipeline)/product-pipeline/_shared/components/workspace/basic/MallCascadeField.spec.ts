import { describe, expect, it } from 'vitest';
import { joinCascade, splitCascade } from './MallCascadeField';

/**
 * 분류 한 줄의 모양.
 *
 * 어댑터는 `1단 > 2단 > 3단 > 4단` 문자열 하나만 안다. 몇 단인지·목록이 어디서
 * 오는지는 칸이 알고, 값은 항상 이 모양이어야 폼 빌더가 4단으로 쪼갤 수 있다.
 */
describe('분류 경로', () => {
  it('앞뒤 공백을 털고 나눈다', () => {
    expect(splitCascade('생활/건강 > 문구/사무용품 >문구용품>  지우개 '))
      .toEqual(['생활/건강', '문구/사무용품', '문구용품', '지우개']);
  });

  it('빈 단은 버린다 — 반쪽 경로를 만들지 않는다', () => {
    expect(splitCascade('생활/건강 > > 문구용품')).toEqual(['생활/건강', '문구용품']);
  });

  it('다시 이으면 같은 모양이다', () => {
    const parts = ['생활/건강', '문구/사무용품', '문구용품', '지우개'];
    expect(splitCascade(joinCascade(parts))).toEqual(parts);
  });

  it('분류 이름에 슬래시가 있어도 나뉘지 않는다', () => {
    // `생활/건강` 처럼 이름 자체에 `/` 가 들어간다. 구분자는 `>` 뿐이다.
    expect(splitCascade('생활/건강 > 문구/사무용품')).toEqual(['생활/건강', '문구/사무용품']);
  });
});
