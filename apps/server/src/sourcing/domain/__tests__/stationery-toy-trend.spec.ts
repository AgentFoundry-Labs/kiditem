import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATIONERY_TOY_TREND_SEEDS,
  matchStationeryToyTrend,
} from '../stationery-toy-trend';

describe('stationery/toy trend relevance', () => {
  it('matches stationery and toy terms across Korean, English, and Chinese', () => {
    expect(matchStationeryToyTrend(['신상 캐릭터 필통 리뷰'])).toBe('필기구·학용품');
    expect(matchStationeryToyTrend(['mini blind box toy unboxing'])).toBe('완구');
    expect(matchStationeryToyTrend(['儿童积木拼装新品'])).toBe('블록·조립완구');
  });

  it('accepts an explicit user seed even when it is outside the built-in dictionary', () => {
    expect(matchStationeryToyTrend(['산리오 신상 랜덤깡'], ['산리오'])).toBe('산리오');
    expect(matchStationeryToyTrend(['신상 인형 언박싱'])).toBe('인형·피규어');
  });

  it('accepts Korean product nouns with particles or a copula but rejects unrelated compounds', () => {
    expect(matchStationeryToyTrend(['신상 인형을 언박싱해 봤어요'])).toBe('인형·피규어');
    expect(matchStationeryToyTrend(['어떤 배우의 피규어일까요?'])).toBe('인형·피규어');
    expect(matchStationeryToyTrend(['학생용 노트북 추천'])).toBeNull();
    expect(matchStationeryToyTrend(['블록체인 기술 쉽게 이해하기'])).toBeNull();
  });

  it('rejects general entertainment, sports, politics, and generic DIY videos', () => {
    expect(matchStationeryToyTrend(['월드컵 VVIP석에 앉으면 생기는 일'])).toBeNull();
    expect(matchStationeryToyTrend(['오늘의 정치 뉴스 속보'])).toBeNull();
    expect(matchStationeryToyTrend(['중장비 없이 철골 올리는 handmade skills'])).toBeNull();
    expect(matchStationeryToyTrend(['로블록스 새벽 3시에 게임을 하면 안 되는 이유'])).toBeNull();
    expect(matchStationeryToyTrend(['이 인형이 아니었다면'])).toBeNull();
  });

  it('keeps a Korean and Chinese default seed for every baseline category', () => {
    expect(DEFAULT_STATIONERY_TOY_TREND_SEEDS).toHaveLength(10);
    expect(DEFAULT_STATIONERY_TOY_TREND_SEEDS.every((seed) => seed.keyword && seed.keywordCn)).toBe(true);
  });
});
