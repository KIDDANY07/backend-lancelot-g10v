import { BadRequestException } from '@nestjs/common'
import { DashboardMetricsService } from './dashboard-metrics.service'

describe('DashboardMetricsService', () => {
  const metrics = new DashboardMetricsService()
  const TODAY = '2026-11-07'

  describe('resolvePeriod', () => {
    it('uses the last 28 days by default', () => {
      expect(metrics.resolvePeriod({}, null, TODAY)).toEqual({
        from: '2026-10-11',
        to: TODAY,
        days: 28,
      })
    })

    it('uses the season range until today when no dates are given', () => {
      const period = metrics.resolvePeriod(
        {},
        { start_date: '2026-04-15', end_date: '2026-11-30' },
        TODAY,
      )
      expect(period).toEqual({ from: '2026-04-15', to: TODAY, days: 207 })
    })

    it('uses the season end when the season already finished', () => {
      const period = metrics.resolvePeriod(
        {},
        { start_date: '2025-02-01', end_date: '2025-06-30' },
        TODAY,
      )
      expect(period.from).toBe('2025-02-01')
      expect(period.to).toBe('2025-06-30')
    })

    it('respects explicit dates', () => {
      expect(
        metrics.resolvePeriod(
          { from: '2026-10-01', to: '2026-10-07' },
          null,
          TODAY,
        ),
      ).toEqual({ from: '2026-10-01', to: '2026-10-07', days: 7 })
    })

    it('rejects a start date after the end date', () => {
      expect(() =>
        metrics.resolvePeriod(
          { from: '2026-10-10', to: '2026-10-01' },
          null,
          TODAY,
        ),
      ).toThrow(BadRequestException)
    })
  })

  describe('series', () => {
    it('is daily up to 92 days and weekly afterwards', () => {
      expect(metrics.granularityFor({ from: 'a', to: 'b', days: 92 })).toBe(
        'day',
      )
      expect(metrics.granularityFor({ from: 'a', to: 'b', days: 93 })).toBe(
        'week',
      )
    })

    it('builds weekly keys starting on Monday', () => {
      const keys = metrics.periodKeys(
        { from: '2026-10-08', to: '2026-10-20', days: 13 },
        'week',
      )
      expect(keys).toEqual(['2026-10-05', '2026-10-12', '2026-10-19'])
    })

    it('fills periods without data with nulls instead of zeros', () => {
      const series = metrics.buildLoadSeries(
        ['2026-10-01', '2026-10-02'],
        [
          {
            period: '2026-10-01',
            loads: 4,
            athletes: 2,
            total_load: 1600,
            avg_rpe: 6.5,
          },
        ],
        [
          {
            period: '2026-10-01',
            acwr_avg: 1.234,
            athletes: 2,
            underload: 0,
            optimal: 1,
            caution: 1,
            overload: 0,
          },
        ],
      )
      expect(series[0]).toMatchObject({
        loads: 4,
        load_per_athlete: 800,
        avg_rpe: 6.5,
        acwr_avg: 1.23,
        acwr_zones: { optima: 1, precaucion: 1 },
      })
      expect(series[1]).toMatchObject({
        loads: 0,
        athletes_with_load: 0,
        load_per_athlete: null,
        avg_rpe: null,
        acwr_avg: null,
      })
    })
  })

  it('returns no coverage when nothing was expected', () => {
    expect(metrics.coverage(0, 0)).toBeNull()
    expect(metrics.coverage(9, 12)).toBe(75)
  })

  it('lists every month of the period, across years', () => {
    expect(
      metrics.monthKeys({ from: '2025-11-20', to: '2026-02-03', days: 76 }),
    ).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('fills missing periods with empty rows instead of skipping them', () => {
    const rows = metrics.fillByKey(
      ['2026-01', '2026-02'],
      [{ key: '2026-02', total: 3 }],
      (key) => ({ key, total: 0 }),
    )
    expect(rows).toEqual([
      { key: '2026-01', total: 0 },
      { key: '2026-02', total: 3 },
    ])
  })

  it('builds histogram bins with explicit edges and zero counts', () => {
    expect(metrics.histogram([{ bucket: 2, total: 5 }], 3, 0, 0.1, 1)).toEqual([
      { from: 0, to: 0.1, total: 0 },
      { from: 0.1, to: 0.2, total: 5 },
      { from: 0.2, to: 0.3, total: 0 },
    ])
  })
})
