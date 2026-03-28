import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatTime,
  formatNumber,
  formatCurrency,
  formatKRW,
  formatPercent,
  getModuleColor,
  getStatusColor,
  getStatusBg,
  timeAgo,
  getProfitColor,
  getProductStatusBadge,
  getGradeColor,
} from '@/lib/utils'

describe('formatTime', () => {
  it('returns minutes only when less than 60', () => {
    expect(formatTime(30)).toBe('30분')
  })

  it('returns hours only when no remainder', () => {
    expect(formatTime(120)).toBe('2시간')
  })

  it('returns hours and minutes when both present', () => {
    expect(formatTime(90)).toBe('1시간 30분')
  })

  it('handles zero minutes', () => {
    expect(formatTime(0)).toBe('0분')
  })
})

describe('formatNumber', () => {
  it('formats large numbers with commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0')
  })
})

describe('formatKRW', () => {
  it('rounds and formats currency amounts', () => {
    expect(formatKRW(12345.6)).toBe('12,346')
  })

  it('handles zero', () => {
    expect(formatKRW(0)).toBe('0')
  })
})

describe('formatPercent', () => {
  it('formats to one decimal place', () => {
    expect(formatPercent(12.345)).toBe('12.3%')
  })

  it('adds trailing zero for whole numbers', () => {
    expect(formatPercent(5)).toBe('5.0%')
  })
})

describe('getModuleColor', () => {
  it('returns correct color for known module', () => {
    expect(getModuleColor('order')).toBe('#3B82F6')
  })

  it('returns gray for unknown module', () => {
    expect(getModuleColor('unknown')).toBe('#6B7280')
  })
})

describe('getStatusColor', () => {
  it('returns emerald for success', () => {
    expect(getStatusColor('success')).toBe('text-emerald-400')
  })

  it('returns red for error', () => {
    expect(getStatusColor('error')).toBe('text-red-400')
  })

  it('returns gray for unknown status', () => {
    expect(getStatusColor('whatever')).toBe('text-gray-500')
  })
})

describe('getStatusBg', () => {
  it('returns emerald bg for success', () => {
    expect(getStatusBg('success')).toContain('emerald')
  })

  it('returns gray bg for unknown', () => {
    expect(getStatusBg('whatever')).toContain('gray')
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

  it('returns 방금 전 for less than 1 minute', () => {
    expect(timeAgo('2026-03-28T11:59:30Z')).toBe('방금 전')
  })

  it('returns minutes for less than 1 hour', () => {
    expect(timeAgo('2026-03-28T11:30:00Z')).toBe('30분 전')
  })

  it('returns hours for less than 1 day', () => {
    expect(timeAgo('2026-03-28T06:00:00Z')).toBe('6시간 전')
  })

  it('returns days for less than 1 week', () => {
    expect(timeAgo('2026-03-25T12:00:00Z')).toBe('3일 전')
  })
})

describe('getProfitColor', () => {
  it('returns red for negative rate', () => {
    expect(getProfitColor(-5)).toContain('red')
  })

  it('returns orange for low rate', () => {
    expect(getProfitColor(2)).toContain('orange')
  })

  it('returns green for good rate', () => {
    expect(getProfitColor(10)).toContain('green')
  })
})

describe('getProductStatusBadge', () => {
  it('returns 판매중 for active', () => {
    const badge = getProductStatusBadge('active')
    expect(badge.label).toBe('판매중')
    expect(badge.color).toContain('green')
  })

  it('returns 중지 for inactive', () => {
    expect(getProductStatusBadge('inactive').label).toBe('중지')
  })

  it('returns raw status for unknown', () => {
    expect(getProductStatusBadge('custom').label).toBe('custom')
  })
})

describe('getGradeColor', () => {
  it('returns blue for grade A', () => {
    expect(getGradeColor('A')).toContain('blue')
  })

  it('returns orange for grade C', () => {
    expect(getGradeColor('C')).toContain('orange')
  })

  it('returns gray for unknown grade', () => {
    expect(getGradeColor('Z')).toContain('gray')
  })
})
