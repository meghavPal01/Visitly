import { describe, expect, it } from 'vitest'
import { delta, duration, fmtTime, inr, pct, ymd } from './format'

describe('format helpers', () => {
  it('shows a dash for missing values', () => {
    expect(pct(null)).toBe('—'); expect(inr(undefined)).toBe('—'); expect(duration(null)).toBe('—')
  })
  it('formats percentages and rupees', () => {
    expect(pct(0.256)).toBe('26%')
    expect(inr(2_500_000)).toBe('₹25.0 L')
    expect(inr(12_000_000)).toBe('₹1.2 Cr')
    expect(inr(4500)).toBe('₹4,500')
  })
  it('formats durations in a readable unit', () => {
    expect(duration(45)).toBe('45 sec'); expect(duration(300)).toBe('5.0 min'); expect(duration(7200)).toBe('2.0 hr')
  })
  it('renders times in IST regardless of the browser zone', () => {
    expect(fmtTime('2026-01-05T04:30:00Z')).toBe('10:00 AM')
    expect(ymd(new Date('2026-01-05T20:00:00Z'))).toBe('2026-01-06')
  })
})

describe('delta', () => {
  it('returns null when there is nothing to compare', () => {
    expect(delta(5, null)).toBeNull(); expect(delta(5, 0)).toBeNull()
  })
  it('marks a rise as good by default and bad when lower is better', () => {
    expect(delta(120, 100)).toEqual({ dir: 'up', label: '20%', good: true })
    expect(delta(120, 100, { lowerIsBetter: true })).toEqual({ dir: 'up', label: '20%', good: false })
  })
  it('compares ratios in percentage points', () => {
    expect(delta(0.5, 0.4, { kind: 'ratio' })).toEqual({ dir: 'up', label: '10 pts', good: true })
  })
  it('reports flat when the change rounds to zero', () => {
    expect(delta(100, 100.2)).toEqual({ dir: 'flat', label: 'no change', good: null })
  })
})
