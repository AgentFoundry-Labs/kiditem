import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateProductBasicsDto } from './update-product-basics.dto';
import { BOUNDED_STRING_MAP_LIMITS } from './bounded-string-map.validator';

/**
 * 몰별 등록 칸 값.
 *
 * `manualBasics` 는 `rawData` JSON 안에 병합돼 남는 오버레이라 한 번 들어간 키는
 * 지워지지 않는다. 그래서 모양보다 **크기**가 진짜 위험이다 — 자유 JSON 을 그대로
 * 받으면 후보 한 건의 `rawData` 가 끝없이 자란다.
 *
 * 뜻은 검사하지 않는다. 어느 몰이 어떤 칸을 요구하는지 아는 것은 프런트 어댑터이고,
 * 서버가 그 목록을 또 적으면 몰을 늘릴 때마다 두 곳을 고쳐야 한다.
 */
describe('UpdateProductBasicsDto 몰 등록 칸', () => {
  const dtoOf = (body: Record<string, unknown>) =>
    plainToInstance(UpdateProductBasicsDto, body);

  const errorsOn = async (body: Record<string, unknown>) => {
    const errors = await validate(dtoOf(body), { whitelist: true });
    return errors.map((error) => error.property);
  };

  it('몰키 → 칸키 → 문자열 을 받는다', async () => {
    const body = {
      mallRegisterValues: {
        '11st': { categoryPath: '문구/사무용품>디자인/팬시용품>기능성 팬시' },
        'teacher-mall': { quantity: '2' },
      },
      mallRegisterShared: { certNumber: 'CB065R1579-2008' },
    };
    expect(await errorsOn(body)).toEqual([]);
    expect(dtoOf(body).mallRegisterValues!['11st']!.categoryPath)
      .toBe('문구/사무용품>디자인/팬시용품>기능성 팬시');
  });

  it('보내지 않아도 된다 — 부분 저장이 기존 값을 지우지 않는다', async () => {
    expect(await errorsOn({ name: '상품' })).toEqual([]);
  });

  it('빈 객체를 받는다 — 값을 전부 지우는 저장이다', async () => {
    expect(await errorsOn({ mallRegisterValues: {}, mallRegisterShared: {} })).toEqual([]);
  });

  it('값이 문자열이 아니면 막는다', async () => {
    expect(await errorsOn({ mallRegisterValues: { '11st': { quantity: 3 } } }))
      .toContain('mallRegisterValues');
    expect(await errorsOn({ mallRegisterShared: { certNumber: null } }))
      .toContain('mallRegisterShared');
  });

  it('층이 맞지 않으면 막는다', async () => {
    // 몰별 값은 두 층이고 공통 값은 한 층이다. 서로 바꿔 보내면 되읽을 때 깨진다.
    expect(await errorsOn({ mallRegisterValues: { '11st': '문구/사무용품' } }))
      .toContain('mallRegisterValues');
    expect(await errorsOn({ mallRegisterShared: { certNumber: { value: 'x' } } }))
      .toContain('mallRegisterShared');
  });

  it('배열은 객체가 아니다', async () => {
    expect(await errorsOn({ mallRegisterShared: ['CB065R1579-2008'] }))
      .toContain('mallRegisterShared');
  });

  it('값이 길면 막는다 — rawData 가 끝없이 자라지 않게 한다', async () => {
    const tooLong = 'x'.repeat(BOUNDED_STRING_MAP_LIMITS.maxValueLength + 1);
    expect(await errorsOn({ mallRegisterShared: { certNumber: tooLong } }))
      .toContain('mallRegisterShared');
    const atLimit = 'x'.repeat(BOUNDED_STRING_MAP_LIMITS.maxValueLength);
    expect(await errorsOn({ mallRegisterShared: { certNumber: atLimit } })).toEqual([]);
  });

  it('키가 너무 많거나 너무 길면 막는다', async () => {
    const manyKeys = Object.fromEntries(
      Array.from({ length: BOUNDED_STRING_MAP_LIMITS.maxKeys + 1 }, (_, i) => [`k${i}`, 'v']),
    );
    expect(await errorsOn({ mallRegisterShared: manyKeys })).toContain('mallRegisterShared');

    const longKey = { ['k'.repeat(BOUNDED_STRING_MAP_LIMITS.maxKeyLength + 1)]: 'v' };
    expect(await errorsOn({ mallRegisterShared: longKey })).toContain('mallRegisterShared');
  });

  it('막을 때 무엇이 잘못됐는지 말한다', async () => {
    const errors = await validate(
      dtoOf({ mallRegisterValues: { '11st': { quantity: 3 } } }),
      { whitelist: true },
    );
    expect(Object.values(errors[0]!.constraints ?? {}).join(' '))
      .toContain('값은 문자열이어야 합니다');
  });
});
