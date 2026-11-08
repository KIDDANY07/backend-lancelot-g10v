import { BadRequestException, Injectable } from '@nestjs/common'
import {
  addDaysToKey,
  daysBetween,
  parseDateKey,
  toDateKey,
} from 'src/common/utils/date.util'
import { percentage } from 'src/common/utils/ratio.util'

export const DEFAULT_PERIOD_DAYS = 28
export const DAILY_GRANULARITY_MAX_DAYS = 92
export const RISK_LEVEL_ORDER = ['bajo', 'medio', 'alto'] as const

export type Granularity = 'day' | 'week'

export interface Period {
  from: string
  to: string
  days: number
}

export interface SeasonRange {
  start_date: string
  end_date?: string | null
}

export interface LoadAggregateRow {
  period: string
  loads: number
  athletes: number
  total_load: number
  avg_rpe: number | null
}

export interface AcwrAggregateRow {
  period: string
  acwr_avg: number | null
  athletes: number
  underload: number
  optimal: number
  caution: number
  overload: number
}

export interface LoadSeriesPoint {
  period: string
  loads: number
  athletes_with_load: number
  load_per_athlete: number | null
  avg_rpe: number | null
  acwr_avg: number | null
  acwr_athletes: number
  acwr_zones: {
    subcarga: number
    optima: number
    precaucion: number
    sobrecarga: number
  }
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function round(value: number | null, decimals = 2): number | null {
  if (value === null) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

@Injectable()
export class DashboardMetricsService {
  resolvePeriod(
    input: { from?: string; to?: string },
    season: SeasonRange | null,
    today: string,
  ): Period {
    let defaultTo = today
    let defaultFrom = addDaysToKey(today, -(DEFAULT_PERIOD_DAYS - 1))
    if (season) {
      const seasonStart = String(season.start_date).slice(0, 10)
      const seasonEnd = season.end_date
        ? String(season.end_date).slice(0, 10)
        : today
      defaultFrom = seasonStart
      defaultTo = seasonEnd < today ? seasonEnd : today
      if (defaultTo < seasonStart) defaultTo = seasonEnd
    }
    const to = input.to ?? defaultTo
    const from =
      input.from ??
      (input.to && !season
        ? addDaysToKey(to, -(DEFAULT_PERIOD_DAYS - 1))
        : defaultFrom)
    if (from > to)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'La fecha inicial no puede ser posterior a la final',
      })
    return { from, to, days: daysBetween(from, to) + 1 }
  }

  granularityFor(period: Period): Granularity {
    return period.days <= DAILY_GRANULARITY_MAX_DAYS ? 'day' : 'week'
  }

  weekStart(dateKey: string): string {
    const date = parseDateKey(dateKey)
    const weekday = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - weekday)
    return toDateKey(date)
  }

  periodKeys(period: Period, granularity: Granularity): string[] {
    const keys: string[] = []
    const step = granularity === 'day' ? 1 : 7
    let key = granularity === 'day' ? period.from : this.weekStart(period.from)
    while (key <= period.to) {
      keys.push(key)
      key = addDaysToKey(key, step)
    }
    return keys
  }

  buildLoadSeries(
    keys: string[],
    loadRows: LoadAggregateRow[],
    acwrRows: AcwrAggregateRow[],
  ): LoadSeriesPoint[] {
    const loads = new Map(loadRows.map((row) => [row.period, row]))
    const acwr = new Map(acwrRows.map((row) => [row.period, row]))
    return keys.map((period) => {
      const load = loads.get(period)
      const ratio = acwr.get(period)
      const athletes = load ? Number(load.athletes) : 0
      return {
        period,
        loads: load ? Number(load.loads) : 0,
        athletes_with_load: athletes,
        load_per_athlete:
          load && athletes > 0
            ? round(Number(load.total_load) / athletes, 1)
            : null,
        avg_rpe: load ? round(finite(load.avg_rpe)) : null,
        acwr_avg: ratio ? round(finite(ratio.acwr_avg)) : null,
        acwr_athletes: ratio ? Number(ratio.athletes) : 0,
        acwr_zones: {
          subcarga: ratio ? Number(ratio.underload) : 0,
          optima: ratio ? Number(ratio.optimal) : 0,
          precaucion: ratio ? Number(ratio.caution) : 0,
          sobrecarga: ratio ? Number(ratio.overload) : 0,
        },
      }
    })
  }

  coverage(registered: number, expected: number): number | null {
    return percentage(registered, expected)
  }

  monthKeys(period: Period): string[] {
    const keys: string[] = []
    let year = Number(period.from.slice(0, 4))
    let month = Number(period.from.slice(5, 7))
    const last = period.to.slice(0, 7)
    for (;;) {
      const key = `${year}-${String(month).padStart(2, '0')}`
      if (key > last) break
      keys.push(key)
      month++
      if (month > 12) {
        month = 1
        year++
      }
    }
    return keys
  }

  fillByKey<T extends { key: string }>(
    keys: string[],
    rows: T[],
    empty: (key: string) => T,
  ): T[] {
    const byKey = new Map(rows.map((row) => [row.key, row]))
    return keys.map((key) => byKey.get(key) ?? empty(key))
  }

  histogram(
    counts: { bucket: number; total: number }[],
    buckets: number,
    lower: number,
    width: number,
    decimals = 2,
  ): { from: number; to: number; total: number }[] {
    const byBucket = new Map(counts.map((row) => [row.bucket, row.total]))
    return Array.from({ length: buckets }, (_, index) => ({
      from: Number((lower + index * width).toFixed(decimals)),
      to: Number((lower + (index + 1) * width).toFixed(decimals)),
      total: byBucket.get(index + 1) ?? 0,
    }))
  }
}
