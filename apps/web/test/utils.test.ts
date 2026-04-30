import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatDurationMinutes, timeAgo } from '@/lib/utils'

// AGENTS.md 규칙: "Test infrastructure core only (api-client, api-error).
// No implementation detail tests."
//
// 순수 format 함수 (formatNumber, formatKRW, formatPercent) 및 매핑 함수
// (getModuleColor, getProfitColor, getProductStatusBadge, getGradeColor) 의
// 결과값 고정 테스트는 구현 디테일 — 규칙 위반이라 제거했다.
//
// 아래 두 가지만 유지: 단순 mapping 이상의 경계값 계산 로직.
//   - formatDurationMinutes: 분 → "N시간 M분" (modulo + 조건부)
//   - timeAgo: 시간차 → 4개 경계 (방금/분/시간/일)

describe('formatDurationMinutes', () => {
  it.each([
    [0, '0분'],
    [30, '30분'],
    [90, '1시간 30분'],
    [120, '2시간'],
  ])('%i 분 → "%s"', (minutes, expected) => {
    expect(formatDurationMinutes(minutes)).toBe(expected)
  })
})

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['2026-03-28T11:59:30Z', '방금 전'],
    ['2026-03-28T11:30:00Z', '30분 전'],
    ['2026-03-28T06:00:00Z', '6시간 전'],
    ['2026-03-25T12:00:00Z', '3일 전'],
  ])('%s → "%s"', (input, expected) => {
    expect(timeAgo(input)).toBe(expected)
  })
})
