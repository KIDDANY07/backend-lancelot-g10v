import { Injectable } from '@nestjs/common'
import { FatigueAlertLevel } from './entities/fatigue-alert.entity'

export type TrainingLoadSource = 'training' | 'match'

export interface TrainingLoadRecord {
  date: string
  rpe: number
  duration_min: number
  source?: TrainingLoadSource
}

export interface AcwrThresholdsInput {
  low_min: number
  low_max: number
  medium_max: number
}

export interface AcwrResult {
  acute_load: number
  chronic_load: number
  acwr_value: number | null
  rpe_avg: number
  level: FatigueAlertLevel | null
}

export const ACUTE_WINDOW_DAYS = 7
export const CHRONIC_WINDOW_DAYS = 28

@Injectable()
export class AcwrCalculatorService {
  private toDateOnlyUTC(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    )
  }

  private dateKey(date: Date): string {
    return date.toISOString().slice(0, 10)
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date)
    result.setUTCDate(result.getUTCDate() + days)
    return result
  }

  buildDailyLoadMap(records: TrainingLoadRecord[]): Map<string, number> {
    const map = new Map<string, number>()
    for (const record of records) {
      const sessionLoad = record.rpe * record.duration_min
      map.set(record.date, (map.get(record.date) ?? 0) + sessionLoad)
    }
    return map
  }

  private averageLoadInWindow(
    dailyLoadMap: Map<string, number>,
    referenceDate: Date,
    windowDays: number,
  ): number {
    const refDay = this.toDateOnlyUTC(referenceDate)
    let sum = 0
    for (let i = 0; i < windowDays; i++) {
      const day = this.addDays(refDay, -i)
      sum += dailyLoadMap.get(this.dateKey(day)) ?? 0
    }
    return Math.round((sum / windowDays) * 100) / 100
  }

  private averageRpeInWindow(
    records: TrainingLoadRecord[],
    referenceDate: Date,
    windowDays: number,
  ): number {
    const refDay = this.toDateOnlyUTC(referenceDate)
    const windowStart = this.addDays(refDay, -(windowDays - 1))
    const inWindow = records.filter((record) => {
      const day = this.toDateOnlyUTC(new Date(record.date))
      return day >= windowStart && day <= refDay
    })
    if (inWindow.length === 0) return 0
    const sum = inWindow.reduce((acc, record) => acc + record.rpe, 0)
    return Math.round((sum / inWindow.length) * 10) / 10
  }

  computeAcwr(acuteLoad: number, chronicLoad: number): number | null {
    if (chronicLoad === 0) return null
    return Math.round((acuteLoad / chronicLoad) * 100) / 100
  }

  classifyLevel(
    acwr: number | null,
    thresholds: AcwrThresholdsInput,
  ): FatigueAlertLevel | null {
    if (acwr === null) return null
    if (acwr < thresholds.low_min) return FatigueAlertLevel.ALTO
    if (acwr <= thresholds.low_max) return FatigueAlertLevel.BAJO
    if (acwr <= thresholds.medium_max) return FatigueAlertLevel.MEDIO
    return FatigueAlertLevel.ALTO
  }

  calculate(
    records: TrainingLoadRecord[],
    referenceDate: Date,
    thresholds: AcwrThresholdsInput,
  ): AcwrResult {
    const dailyLoadMap = this.buildDailyLoadMap(records)
    const acute_load = this.averageLoadInWindow(
      dailyLoadMap,
      referenceDate,
      ACUTE_WINDOW_DAYS,
    )
    const chronic_load = this.averageLoadInWindow(
      dailyLoadMap,
      referenceDate,
      CHRONIC_WINDOW_DAYS,
    )
    const acwr_value = this.computeAcwr(acute_load, chronic_load)
    const rpe_avg = this.averageRpeInWindow(
      records,
      referenceDate,
      ACUTE_WINDOW_DAYS,
    )
    const level = this.classifyLevel(acwr_value, thresholds)
    return { acute_load, chronic_load, acwr_value, rpe_avg, level }
  }
}
