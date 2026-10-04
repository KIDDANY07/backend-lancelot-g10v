import {
  addDaysToKey,
  daysBetween,
  enumerateDateKeys,
  parseDateKey,
  toDateKey,
} from './date.util'
import { percentage } from './ratio.util'

describe('date.util', () => {
  it('converts between Date and YYYY-MM-DD in UTC', () => {
    expect(toDateKey(parseDateKey('2026-03-28'))).toBe('2026-03-28')
  })

  it('adds days across month and year boundaries', () => {
    expect(addDaysToKey('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDaysToKey('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('counts days between two dates', () => {
    expect(daysBetween('2026-03-01', '2026-03-28')).toBe(27)
    expect(daysBetween('2026-03-28', '2026-03-01')).toBe(-27)
  })

  it('enumerates an inclusive range', () => {
    expect(enumerateDateKeys('2026-03-30', '2026-04-02')).toEqual([
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
      '2026-04-02',
    ])
    expect(enumerateDateKeys('2026-04-02', '2026-03-30')).toEqual([])
  })
})

describe('ratio.util', () => {
  it('returns a percentage with 2 decimals', () => {
    expect(percentage(1, 3)).toBe(33.33)
    expect(percentage(0, 5)).toBe(0)
  })

  it('returns null instead of dividing by zero', () => {
    expect(percentage(0, 0)).toBeNull()
  })
})
