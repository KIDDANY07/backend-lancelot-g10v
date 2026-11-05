import {
  AcwrCalculatorService,
  TrainingLoadRecord,
} from './acwr-calculator.service'
import { FatigueAlertLevel } from './entities/fatigue-alert.entity'

const THRESHOLDS = { low_min: 0.8, low_max: 1.3, medium_max: 1.5 }

function offsetDate(base: Date, daysBack: number): string {
  const day = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()),
  )
  day.setUTCDate(day.getUTCDate() - daysBack)
  return day.toISOString().slice(0, 10)
}

describe('AcwrCalculatorService', () => {
  let service: AcwrCalculatorService
  const referenceDate = new Date('2026-03-28T12:00:00Z')

  beforeEach(() => {
    service = new AcwrCalculatorService()
  })

  describe('buildDailyLoadMap', () => {
    it('sums multiple sessions on the same day', () => {
      const records: TrainingLoadRecord[] = [
        { date: '2026-03-01', rpe: 5, duration_min: 60 },
        { date: '2026-03-01', rpe: 3, duration_min: 30 },
      ]
      const map = service.buildDailyLoadMap(records)
      expect(map.get('2026-03-01')).toBe(300 + 90)
    })

    it('keeps different days separate', () => {
      const records: TrainingLoadRecord[] = [
        { date: '2026-03-01', rpe: 5, duration_min: 60 },
        { date: '2026-03-02', rpe: 4, duration_min: 60 },
      ]
      const map = service.buildDailyLoadMap(records)
      expect(map.get('2026-03-01')).toBe(300)
      expect(map.get('2026-03-02')).toBe(240)
    })
  })

  describe('computeAcwr', () => {
    it('returns null when there is no chronic baseline (chronic_load = 0)', () => {
      expect(service.computeAcwr(100, 0)).toBeNull()
    })

    it('divides acute by chronic and rounds to 2 decimals', () => {
      expect(service.computeAcwr(100, 50)).toBe(2)
      expect(service.computeAcwr(100, 33)).toBe(3.03)
    })
  })

  describe('classifyLevel', () => {
    it('returns null when acwr could not be computed', () => {
      expect(service.classifyLevel(null, THRESHOLDS)).toBeNull()
    })

    it('classifies destreno (below low_min) as alto', () => {
      expect(service.classifyLevel(0.5, THRESHOLDS)).toBe(
        FatigueAlertLevel.ALTO,
      )
    })

    it('classifies the safe zone (low_min..low_max) as bajo, boundaries included', () => {
      expect(service.classifyLevel(0.8, THRESHOLDS)).toBe(
        FatigueAlertLevel.BAJO,
      )
      expect(service.classifyLevel(1.0, THRESHOLDS)).toBe(
        FatigueAlertLevel.BAJO,
      )
      expect(service.classifyLevel(1.3, THRESHOLDS)).toBe(
        FatigueAlertLevel.BAJO,
      )
    })

    it('classifies the watch zone (low_max..medium_max) as medio', () => {
      expect(service.classifyLevel(1.31, THRESHOLDS)).toBe(
        FatigueAlertLevel.MEDIO,
      )
      expect(service.classifyLevel(1.5, THRESHOLDS)).toBe(
        FatigueAlertLevel.MEDIO,
      )
    })

    it('classifies overload (above medium_max) as alto', () => {
      expect(service.classifyLevel(1.51, THRESHOLDS)).toBe(
        FatigueAlertLevel.ALTO,
      )
    })
  })

  describe('calculate', () => {
    it('handles an athlete with no sessions at all', () => {
      const result = service.calculate([], referenceDate, THRESHOLDS)
      expect(result).toEqual({
        acute_load: 0,
        chronic_load: 0,
        acwr_value: null,
        rpe_avg: 0,
        level: null,
      })
    })

    it('handles a single day of data (no chronic history yet)', () => {
      const records: TrainingLoadRecord[] = [
        { date: offsetDate(referenceDate, 0), rpe: 10, duration_min: 70 },
      ]
      const result = service.calculate(records, referenceDate, THRESHOLDS)

      expect(result.acute_load).toBe(100)
      expect(result.chronic_load).toBe(25)
      expect(result.acwr_value).toBeNull()
      expect(result.rpe_avg).toBe(10)
      expect(result.level).toBeNull()
    })

    it('does not compute acwr until three of the four chronic weeks have load', () => {
      const twoWeeks: TrainingLoadRecord[] = [0, 3, 8, 10].map((daysBack) => ({
        date: offsetDate(referenceDate, daysBack),
        rpe: 5,
        duration_min: 60,
      }))
      expect(
        service.calculate(twoWeeks, referenceDate, THRESHOLDS).acwr_value,
      ).toBeNull()

      const threeWeeks = [
        ...twoWeeks,
        { date: offsetDate(referenceDate, 16), rpe: 5, duration_min: 60 },
      ]
      expect(
        service.calculate(threeWeeks, referenceDate, THRESHOLDS).acwr_value,
      ).not.toBeNull()
    })

    it('detects an abrupt load spike in the last 7 days against a steady chronic baseline', () => {
      const records: TrainingLoadRecord[] = []
      // Steady baseline load for the 21 days before the acute window
      for (let daysBack = 27; daysBack >= 7; daysBack--) {
        records.push({
          date: offsetDate(referenceDate, daysBack),
          rpe: 5,
          duration_min: 20,
        })
      }
      // Sudden spike during the acute (last 7 days) window
      for (let daysBack = 6; daysBack >= 0; daysBack--) {
        records.push({
          date: offsetDate(referenceDate, daysBack),
          rpe: 8,
          duration_min: 50,
        })
      }

      const result = service.calculate(records, referenceDate, THRESHOLDS)

      expect(result.acute_load).toBe(400)
      expect(result.chronic_load).toBe(175)
      expect(result.acwr_value).toBe(2.29)
      expect(result.rpe_avg).toBe(8)
      expect(result.level).toBe(FatigueAlertLevel.ALTO)
    })

    it('stays in the safe zone when acute and chronic load are balanced', () => {
      const records: TrainingLoadRecord[] = []
      for (let daysBack = 27; daysBack >= 0; daysBack--) {
        records.push({
          date: offsetDate(referenceDate, daysBack),
          rpe: 5,
          duration_min: 40,
        })
      }

      const result = service.calculate(records, referenceDate, THRESHOLDS)

      expect(result.acute_load).toBe(200)
      expect(result.chronic_load).toBe(200)
      expect(result.acwr_value).toBe(1)
      expect(result.level).toBe(FatigueAlertLevel.BAJO)
    })

    it('detects destreno (undertraining) when recent load drops far below the chronic baseline', () => {
      const records: TrainingLoadRecord[] = []
      for (let daysBack = 27; daysBack >= 7; daysBack--) {
        records.push({
          date: offsetDate(referenceDate, daysBack),
          rpe: 6,
          duration_min: 60,
        })
      }
      // No training at all in the last 7 days

      const result = service.calculate(records, referenceDate, THRESHOLDS)

      expect(result.acute_load).toBe(0)
      expect(result.chronic_load).toBeGreaterThan(0)
      expect(result.acwr_value).toBe(0)
      expect(result.level).toBe(FatigueAlertLevel.ALTO)
    })
  })
})
