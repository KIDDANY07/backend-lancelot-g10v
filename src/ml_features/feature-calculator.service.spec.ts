import {
  AcwrCalculatorService,
  TrainingLoadRecord,
} from 'src/fatigue_alerts/acwr-calculator.service'
import { addDaysToKey } from 'src/common/utils/date.util'
import { InjuryMechanism } from 'src/injuries/entities/injury.entity'
import { InjuryRiskLevel } from 'src/injury_risk_assessments/entities/injury-risk-assessment.entity'
import { FeatureLabelQuality } from './entities/athlete-daily-features.entity'
import {
  ACUTE_EWMA_LAMBDA,
  CHRONIC_EWMA_LAMBDA,
  FeatureCalculatorService,
} from './feature-calculator.service'

const DATE = '2026-03-28'

function daily(
  daysBack: number,
  rpe: number,
  duration_min: number,
  source: 'training' | 'match' = 'training',
): TrainingLoadRecord {
  return { date: addDaysToKey(DATE, -daysBack), rpe, duration_min, source }
}

describe('FeatureCalculatorService', () => {
  let service: FeatureCalculatorService

  beforeEach(() => {
    service = new FeatureCalculatorService(new AcwrCalculatorService())
  })

  describe('computeEwma', () => {
    it('starts at the first value and applies lambda recursively', () => {
      expect(service.computeEwma([100, 200, 0], 0.25)).toBeCloseTo(93.75)
    })

    it('returns 0 for an empty series', () => {
      expect(service.computeEwma([], 0.25)).toBe(0)
    })
  })

  describe('computeEwmaAcwr', () => {
    it('is 1 for a perfectly constant load', () => {
      const map = new Map<string, number>()
      for (let i = 0; i < 60; i++) map.set(addDaysToKey(DATE, -i), 300)
      expect(service.computeEwmaAcwr(map, DATE)).toBe(1)
    })

    it('rises above 1 after a load spike and uses lambdas 2/8 and 2/29', () => {
      const map = new Map<string, number>()
      for (let i = 0; i < 60; i++)
        map.set(addDaysToKey(DATE, -i), i < 7 ? 600 : 300)

      const loads = Array.from({ length: 60 }, (_, k) =>
        59 - k < 7 ? 600 : 300,
      )
      const expected =
        Math.round(
          (service.computeEwma(loads, ACUTE_EWMA_LAMBDA) /
            service.computeEwma(loads, CHRONIC_EWMA_LAMBDA)) *
            100,
        ) / 100

      const acwr = service.computeEwmaAcwr(map, DATE)
      expect(acwr).toBe(expected)
      expect(acwr).toBeGreaterThan(1)
    })

    it('is null without any load in the 60-day window', () => {
      expect(service.computeEwmaAcwr(new Map(), DATE)).toBeNull()
    })
  })

  describe('computeMonotony', () => {
    it('is null when the daily standard deviation is 0 (constant week)', () => {
      expect(
        service.computeMonotony([300, 300, 300, 300, 300, 300, 300]),
      ).toBeNull()
    })

    it('is null for a week without load', () => {
      expect(service.computeMonotony([0, 0, 0, 0, 0, 0, 0])).toBeNull()
    })

    it('divides the daily mean by the daily standard deviation', () => {
      expect(service.computeMonotony([100, 300, 100, 300])).toBe(2)
    })
  })

  describe('computeLoadFeatures', () => {
    it('computes strain as weekly load x monotony', () => {
      const records = [daily(0, 5, 60), daily(1, 5, 60), daily(2, 5, 60)]
      const features = service.computeLoadFeatures(records, [], DATE)
      const weekLoads = [300, 300, 300, 0, 0, 0, 0]
      const monotony = service.computeMonotony(weekLoads) as number

      expect(features.monotony_7d).toBe(monotony)
      expect(features.strain_7d).toBe(Math.round(900 * monotony * 100) / 100)
    })

    it('leaves strain null when monotony is null', () => {
      const records = Array.from({ length: 7 }, (_, i) => daily(i, 5, 60))
      const features = service.computeLoadFeatures(records, [], DATE)
      expect(features.monotony_7d).toBeNull()
      expect(features.strain_7d).toBeNull()
    })

    it('reuses the simple 7/28-day ACWR', () => {
      const records = Array.from({ length: 28 }, (_, i) => daily(i, 5, 40))
      const features = service.computeLoadFeatures(records, [], DATE)
      expect(features.acute_load_7d).toBe(200)
      expect(features.chronic_load_28d).toBe(200)
      expect(features.acwr).toBe(1)
    })

    it('counts sessions, average RPE and high-RPE sessions in their windows', () => {
      const records = [
        daily(0, 9, 60, 'match'),
        daily(3, 6, 60),
        daily(10, 8, 60),
        daily(20, 9, 60),
      ]
      const features = service.computeLoadFeatures(records, [], DATE)
      expect(features.sessions_7d).toBe(2)
      expect(features.rpe_avg_7d).toBe(7.5)
      expect(features.high_rpe_sessions_14d).toBe(2)
    })

    it('has null average RPE without sessions in the week', () => {
      expect(service.computeLoadFeatures([], [], DATE).rpe_avg_7d).toBeNull()
    })

    it('sums match minutes of the last 7 days, with or without RPE', () => {
      const features = service.computeLoadFeatures(
        [],
        [
          { date: DATE, minutes_played: 90 },
          { date: addDaysToKey(DATE, -6), minutes_played: 45 },
          { date: addDaysToKey(DATE, -7), minutes_played: 90 },
        ],
        DATE,
      )
      expect(features.match_minutes_7d).toBe(135)
    })

    it('ignores records after the snapshot date (no future leakage)', () => {
      const withFuture = [daily(0, 5, 60), daily(-1, 10, 120)]
      expect(service.computeLoadFeatures(withFuture, [], DATE)).toEqual(
        service.computeLoadFeatures([daily(0, 5, 60)], [], DATE),
      )
    })
  })

  describe('computeMedicalFeatures', () => {
    it('is available with no injuries', () => {
      expect(service.computeMedicalFeatures([], DATE)).toEqual({
        prior_injuries_count: 0,
        prior_non_contact_injuries_count: 0,
        days_since_last_injury: null,
        is_recovering: false,
        is_available: true,
      })
    })

    it('is not available while injured without recovery date', () => {
      const features = service.computeMedicalFeatures(
        [{ injury_date: '2026-03-20', recovery_date: null }],
        DATE,
      )
      expect(features.is_available).toBe(false)
      expect(features.days_since_last_injury).toBe(8)
    })

    it('is not available when the recovery date is after the snapshot date', () => {
      const features = service.computeMedicalFeatures(
        [{ injury_date: '2026-03-20', recovery_date: '2026-03-29' }],
        DATE,
      )
      expect(features.is_available).toBe(false)
    })

    it('is available (and recovering) on and after the recovery date', () => {
      const features = service.computeMedicalFeatures(
        [{ injury_date: '2026-03-01', recovery_date: DATE }],
        DATE,
      )
      expect(features.is_available).toBe(true)
      expect(features.is_recovering).toBe(true)
    })

    it('stops being recovering 28 days after the recovery date', () => {
      const features = service.computeMedicalFeatures(
        [{ injury_date: '2026-01-01', recovery_date: '2026-02-28' }],
        DATE,
      )
      expect(features.is_recovering).toBe(false)
    })

    it('ignores injuries after the snapshot date and counts non-contact ones', () => {
      const features = service.computeMedicalFeatures(
        [
          {
            injury_date: '2025-10-01',
            recovery_date: '2025-10-20',
            mechanism: InjuryMechanism.SIN_CONTACTO,
          },
          {
            injury_date: '2026-01-10',
            recovery_date: '2026-01-15',
            mechanism: InjuryMechanism.CONTACTO,
          },
          {
            injury_date: '2026-03-30',
            mechanism: InjuryMechanism.SIN_CONTACTO,
          },
        ],
        DATE,
      )
      expect(features.prior_injuries_count).toBe(2)
      expect(features.prior_non_contact_injuries_count).toBe(1)
      expect(features.days_since_last_injury).toBe(77)
      expect(features.is_available).toBe(true)
    })
  })

  describe('computeAgeYears', () => {
    it('computes the age in years with 2 decimals', () => {
      expect(service.computeAgeYears('2012-03-28', DATE)).toBe(14)
    })

    it('is null without birth date', () => {
      expect(service.computeAgeYears(null, DATE)).toBeNull()
    })
  })

  describe('findSeasonForDate', () => {
    const seasons = [
      { id_season: 1, start_date: '2025-02-01', end_date: '2025-11-30' },
      { id_season: 2, start_date: '2026-02-01', end_date: null },
    ]

    it('finds the season containing the date (open-ended seasons included)', () => {
      expect(service.findSeasonForDate(seasons, DATE)?.id_season).toBe(2)
      expect(service.findSeasonForDate(seasons, '2025-06-01')?.id_season).toBe(
        1,
      )
    })

    it('is null between seasons', () => {
      expect(service.findSeasonForDate(seasons, '2025-12-15')).toBeNull()
    })
  })

  describe('computeFeatures', () => {
    it('combines context, load and medical features', () => {
      const features = service.computeFeatures({
        date: DATE,
        records: [daily(0, 5, 60)],
        matchAppearances: [],
        injuries: [],
        context: {
          id_season: 2,
          id_category: 3,
          position: 'delantero',
          birth_date: '2012-03-28',
          rules_risk_level: InjuryRiskLevel.MEDIO,
        },
      })
      expect(features).toMatchObject({
        date: DATE,
        id_season: 2,
        id_category: 3,
        position: 'delantero',
        age_years: 14,
        sessions_7d: 1,
        is_available: true,
        rules_risk_level: InjuryRiskLevel.MEDIO,
      })
    })
  })

  describe('computeLabel', () => {
    it('is true with a non-contact injury in (date, date + 7]', () => {
      expect(
        service.computeLabel(DATE, [
          {
            injury_date: '2026-04-04',
            mechanism: InjuryMechanism.SIN_CONTACTO,
          },
        ]),
      ).toEqual({
        label_injury_7d: true,
        label_quality: FeatureLabelQuality.LABELED,
      })
    })

    it('excludes an injury on the snapshot date itself and after date + 7', () => {
      expect(
        service.computeLabel(DATE, [
          { injury_date: DATE, mechanism: InjuryMechanism.SIN_CONTACTO },
          {
            injury_date: '2026-04-05',
            mechanism: InjuryMechanism.SIN_CONTACTO,
          },
        ]),
      ).toEqual({
        label_injury_7d: false,
        label_quality: FeatureLabelQuality.LABELED,
      })
    })

    it('treats contact injuries as negative', () => {
      expect(
        service.computeLabel(DATE, [
          { injury_date: '2026-03-30', mechanism: InjuryMechanism.CONTACTO },
        ]).label_injury_7d,
      ).toBe(false)
    })

    it('is unknown when the only injuries in the window have no mechanism', () => {
      expect(
        service.computeLabel(DATE, [
          { injury_date: '2026-03-30', mechanism: null },
          { injury_date: '2026-03-31', mechanism: InjuryMechanism.CONTACTO },
        ]),
      ).toEqual({
        label_injury_7d: null,
        label_quality: FeatureLabelQuality.UNKNOWN_MECHANISM,
      })
    })

    it('is true when a non-contact injury coexists with one without mechanism', () => {
      expect(
        service.computeLabel(DATE, [
          { injury_date: '2026-03-30', mechanism: null },
          {
            injury_date: '2026-03-31',
            mechanism: InjuryMechanism.SIN_CONTACTO,
          },
        ]).label_injury_7d,
      ).toBe(true)
    })

    it('is false without injuries', () => {
      expect(service.computeLabel(DATE, []).label_injury_7d).toBe(false)
    })
  })

  describe('isLabelMature', () => {
    it('requires 7 full days after the snapshot date', () => {
      expect(service.isLabelMature(DATE, '2026-04-04')).toBe(true)
      expect(service.isLabelMature(DATE, '2026-04-03')).toBe(false)
    })
  })
})
