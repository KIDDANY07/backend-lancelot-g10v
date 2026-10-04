import { addDaysToKey } from 'src/common/utils/date.util'
import {
  AcwrCalculatorService,
  TrainingLoadRecord,
} from './acwr-calculator.service'
import { FatigueAlertLevel } from './entities/fatigue-alert.entity'
import { LoadSeriesService } from './load-series.service'

const THRESHOLDS = { low_min: 0.8, low_max: 1.3, medium_max: 1.5 }
const TO = '2026-03-28'

function record(
  daysBack: number,
  rpe: number,
  duration_min: number,
): TrainingLoadRecord {
  return { date: addDaysToKey(TO, -daysBack), rpe, duration_min }
}

describe('LoadSeriesService', () => {
  let service: LoadSeriesService

  beforeEach(() => {
    service = new LoadSeriesService(new AcwrCalculatorService())
  })

  it('returns one point per day of the range, both ends included', () => {
    const series = service.buildSeries([], addDaysToKey(TO, -6), TO, THRESHOLDS)
    expect(series).toHaveLength(7)
    expect(series[0].date).toBe(addDaysToKey(TO, -6))
    expect(series[6].date).toBe(TO)
  })

  it('reports daily load and sessions, with 0 on rest days', () => {
    const series = service.buildSeries(
      [record(0, 5, 60), record(0, 3, 30), record(2, 6, 50)],
      addDaysToKey(TO, -2),
      TO,
      THRESHOLDS,
    )
    expect(series.map((p) => p.daily_load)).toEqual([300, 0, 390])
    expect(series.map((p) => p.sessions)).toEqual([1, 0, 2])
  })

  it('matches the ACWR calculator for each day', () => {
    const records = Array.from({ length: 28 }, (_, i) => record(i, 5, 40))
    const [point] = service.buildSeries(records, TO, TO, THRESHOLDS)
    expect(point).toMatchObject({
      acute_load: 200,
      chronic_load: 200,
      acwr: 1,
      level: FatigueAlertLevel.BAJO,
    })
  })

  it('has null ACWR and level without chronic load', () => {
    const [point] = service.buildSeries([], TO, TO, THRESHOLDS)
    expect(point.acwr).toBeNull()
    expect(point.level).toBeNull()
  })
})
