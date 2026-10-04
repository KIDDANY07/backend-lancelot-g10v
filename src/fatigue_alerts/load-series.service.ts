import { Injectable } from '@nestjs/common'
import { enumerateDateKeys, parseDateKey } from 'src/common/utils/date.util'
import {
  AcwrCalculatorService,
  AcwrThresholdsInput,
  TrainingLoadRecord,
} from './acwr-calculator.service'
import { FatigueAlertLevel } from './entities/fatigue-alert.entity'

export interface AcwrSeriesPoint {
  date: string
  daily_load: number
  sessions: number
  acute_load: number
  chronic_load: number
  acwr: number | null
  level: FatigueAlertLevel | null
}

@Injectable()
export class LoadSeriesService {
  constructor(private readonly acwrCalculatorService: AcwrCalculatorService) {}

  buildSeries(
    records: TrainingLoadRecord[],
    from: string,
    to: string,
    thresholds: AcwrThresholdsInput,
  ): AcwrSeriesPoint[] {
    const dailyLoadMap = this.acwrCalculatorService.buildDailyLoadMap(records)
    const sessionsByDate = new Map<string, number>()
    for (const record of records)
      sessionsByDate.set(
        record.date,
        (sessionsByDate.get(record.date) ?? 0) + 1,
      )

    return enumerateDateKeys(from, to).map((date) => {
      const result = this.acwrCalculatorService.calculate(
        records,
        parseDateKey(date),
        thresholds,
      )
      return {
        date,
        daily_load: dailyLoadMap.get(date) ?? 0,
        sessions: sessionsByDate.get(date) ?? 0,
        acute_load: result.acute_load,
        chronic_load: result.chronic_load,
        acwr: result.acwr_value,
        level: result.level,
      }
    })
  }
}
