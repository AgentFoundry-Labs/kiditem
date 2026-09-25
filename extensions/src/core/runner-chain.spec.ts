import { describe, expect, it } from 'vitest';
import { nextOperationFrom } from './runner';

describe('nextOperationFrom — 실행 연쇄 규칙', () => {
  it('result.next가 {kind, scope}면 다음 실행이다', () => {
    expect(nextOperationFrom({ next: { kind: 'channels.wing_catalog_details', scope: { channelAccountId: 'x' } } }))
      .toEqual({ kind: 'channels.wing_catalog_details', scope: { channelAccountId: 'x' } });
  });
  it('next가 없거나 null이면 연쇄 없음', () => {
    expect(nextOperationFrom({ chunks: 2 })).toBeNull();
    expect(nextOperationFrom({ next: null })).toBeNull();
    expect(nextOperationFrom(null)).toBeNull();
  });
  it('모양이 틀리면(kind 형식·scope 없음) 연쇄하지 않는다', () => {
    expect(nextOperationFrom({ next: { kind: 'bogus', scope: {} } })).toBeNull();
    expect(nextOperationFrom({ next: { kind: 'a.b' } })).toBeNull();
  });
});
