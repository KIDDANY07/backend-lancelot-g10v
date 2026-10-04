import { Injectable } from '@nestjs/common'
import {
  ACUTE_WINDOW_DAYS,
  AcwrCalculatorService,
  TrainingLoadRecord,
} from 'src/fatigue_alerts/acwr-calculator.service'
import {
  addDaysToKey,
  daysBetween,
  enumerateDateKeys,
  parseDateKey,
} from 'src/common/utils/date.util'
import { InjuryMechanism } from 'src/injuries/entities/injury.entity'
import { InjuryRiskLevel } from 'src/injury_risk_assessments/entities/injury-risk-assessment.entity'
import { FeatureLabelQuality } from './entities/athlete-daily-features.entity'

export const EWMA_WINDOW_DAYS = 60
export const ACUTE_EWMA_LAMBDA = 2 / (7 + 1)
export const CHRONIC_EWMA_LAMBDA = 2 / (28 + 1)
export const HIGH_RPE_THRESHOLD = 8
export const HIGH_RPE_WINDOW_DAYS = 14
export const RETURN_TO_PLAY_WINDOW_DAYS = 28
export const LABEL_WINDOW_DAYS = 7

export interface FeatureInjury {
  injury_date: string
  recovery_date?: string | null
  mechanism?: InjuryMechanism | null
}

export interface FeatureMatchAppearance {
  date: string
  minutes_played: number
}

export interface FeatureSeason {
  id_season: number
  start_date: string
  end_date?: string | null
}

export interface FeatureContext {
  id_season?: number | null
  id_category?: number | null
  position?: string | null
  birth_date?: string | null
  rules_risk_level?: InjuryRiskLevel | null
}

export interface LoadFeatures {
  acute_load_7d: number
  chronic_load_28d: number
  acwr: number | null
  acwr_ewma: number | null
  monotony_7d: number | null
  strain_7d: number | null
  sessions_7d: number
  rpe_avg_7d: number | null
  match_minutes_7d: number
  high_rpe_sessions_14d: number
}

export interface MedicalFeatures {
  prior_injuries_count: number
  prior_non_contact_injuries_count: number
  days_since_last_injury: number | null
  is_recovering: boolean
  is_available: boolean
}

export interface DailyFeatures extends LoadFeatures, MedicalFeatures {
  date: string
  id_season: number | null
  id_category: number | null
  position: string | null
  age_years: number | null
  rules_risk_level: InjuryRiskLevel | null
}

export interface FeatureLabel {
  label_injury_7d: boolean | null
  label_quality: FeatureLabelQuality
}

export interface DailyFeaturesInput {
  date: string
  records: TrainingLoadRecord[]
  matchAppearances: FeatureMatchAppearance[]
  injuries: FeatureInjury[]
  context: FeatureContext
}

@Injectable()
export class FeatureCalculatorService {
  constructor(private readonly acwrCalculatorService: AcwrCalculatorService) {}

  private round2(value: number): number {
    return Math.round(value * 100) / 100
  }

  private inWindow(date: string, from: string, to: string): boolean {
    return date >= from && date <= to
  }

  computeEwma(values: number[], lambda: number): number {
    if (values.length === 0) return 0
    let ewma = values[0]
    for (let i = 1; i < values.length; i++)
      ewma = lambda * values[i] + (1 - lambda) * ewma
    return ewma
  }

  computeEwmaAcwr(
    dailyLoadMap: Map<string, number>,
    date: string,
  ): number | null {
    const days = enumerateDateKeys(
      addDaysToKey(date, -(EWMA_WINDOW_DAYS - 1)),
      date,
    )
    const loads = days.map((day) => dailyLoadMap.get(day) ?? 0)
    const acute = this.computeEwma(loads, ACUTE_EWMA_LAMBDA)
    const chronic = this.computeEwma(loads, CHRONIC_EWMA_LAMBDA)
    if (chronic === 0) return null
    return this.round2(acute / chronic)
  }

  computeMonotony(dailyLoads: number[]): number | null {
    if (dailyLoads.length === 0) return null
    const mean = dailyLoads.reduce((sum, l) => sum + l, 0) / dailyLoads.length
    const variance =
      dailyLoads.reduce((sum, l) => sum + (l - mean) ** 2, 0) /
      dailyLoads.length
    const sd = Math.sqrt(variance)
    if (sd < 1e-9) return null
    return this.round2(mean / sd)
  }

  computeLoadFeatures(
    records: TrainingLoadRecord[],
    matchAppearances: FeatureMatchAppearance[],
    date: string,
  ): LoadFeatures {
    const { acute_load, chronic_load, acwr_value } =
      this.acwrCalculatorService.calculate(records, parseDateKey(date), {
        low_min: 0,
        low_max: 0,
        medium_max: 0,
      })
    const dailyLoadMap = this.acwrCalculatorService.buildDailyLoadMap(records)

    const weekStart = addDaysToKey(date, -(ACUTE_WINDOW_DAYS - 1))
    const weekLoads = enumerateDateKeys(weekStart, date).map(
      (day) => dailyLoadMap.get(day) ?? 0,
    )
    const monotony_7d = this.computeMonotony(weekLoads)
    const weeklyLoad = weekLoads.reduce((sum, l) => sum + l, 0)

    const weekRecords = records.filter((r) =>
      this.inWindow(r.date, weekStart, date),
    )
    const rpe_avg_7d =
      weekRecords.length > 0
        ? this.round2(
            weekRecords.reduce((sum, r) => sum + r.rpe, 0) / weekRecords.length,
          )
        : null

    const highRpeStart = addDaysToKey(date, -(HIGH_RPE_WINDOW_DAYS - 1))
    const high_rpe_sessions_14d = records.filter(
      (r) =>
        this.inWindow(r.date, highRpeStart, date) &&
        r.rpe >= HIGH_RPE_THRESHOLD,
    ).length

    const match_minutes_7d = matchAppearances
      .filter((m) => this.inWindow(m.date, weekStart, date))
      .reduce((sum, m) => sum + Number(m.minutes_played), 0)

    return {
      acute_load_7d: acute_load,
      chronic_load_28d: chronic_load,
      acwr: acwr_value,
      acwr_ewma: this.computeEwmaAcwr(dailyLoadMap, date),
      monotony_7d,
      strain_7d:
        monotony_7d === null ? null : this.round2(weeklyLoad * monotony_7d),
      sessions_7d: weekRecords.length,
      rpe_avg_7d,
      match_minutes_7d,
      high_rpe_sessions_14d,
    }
  }

  computeMedicalFeatures(
    injuries: FeatureInjury[],
    date: string,
  ): MedicalFeatures {
    const prior = injuries.filter((i) => i.injury_date <= date)
    const lastInjuryDate = prior.reduce<string | null>(
      (latest, i) =>
        latest === null || i.injury_date > latest ? i.injury_date : latest,
      null,
    )
    const is_available = !prior.some(
      (i) => !i.recovery_date || i.recovery_date > date,
    )
    const is_recovering = prior.some(
      (i) =>
        !!i.recovery_date &&
        i.recovery_date <= date &&
        daysBetween(i.recovery_date, date) < RETURN_TO_PLAY_WINDOW_DAYS,
    )
    return {
      prior_injuries_count: prior.length,
      prior_non_contact_injuries_count: prior.filter(
        (i) => i.mechanism === InjuryMechanism.SIN_CONTACTO,
      ).length,
      days_since_last_injury:
        lastInjuryDate === null ? null : daysBetween(lastInjuryDate, date),
      is_recovering,
      is_available,
    }
  }

  computeAgeYears(birth_date: string | null | undefined, date: string) {
    if (!birth_date) return null
    return this.round2(daysBetween(birth_date, date) / 365.25)
  }

  findSeasonForDate<T extends FeatureSeason>(
    seasons: T[],
    date: string,
  ): T | null {
    const matching = seasons
      .filter(
        (s) => s.start_date <= date && (!s.end_date || s.end_date >= date),
      )
      .sort((a, b) => b.start_date.localeCompare(a.start_date))
    return matching[0] ?? null
  }

  computeFeatures(input: DailyFeaturesInput): DailyFeatures {
    const { date, context } = input
    return {
      date,
      id_season: context.id_season ?? null,
      id_category: context.id_category ?? null,
      position: context.position ?? null,
      age_years: this.computeAgeYears(context.birth_date, date),
      ...this.computeLoadFeatures(input.records, input.matchAppearances, date),
      ...this.computeMedicalFeatures(input.injuries, date),
      rules_risk_level: context.rules_risk_level ?? null,
    }
  }

  isLabelMature(date: string, today: string): boolean {
    return addDaysToKey(date, LABEL_WINDOW_DAYS) <= today
  }

  computeLabel(date: string, injuries: FeatureInjury[]): FeatureLabel {
    const windowEnd = addDaysToKey(date, LABEL_WINDOW_DAYS)
    const inWindow = injuries.filter(
      (i) => i.injury_date > date && i.injury_date <= windowEnd,
    )
    if (inWindow.some((i) => i.mechanism === InjuryMechanism.SIN_CONTACTO))
      return {
        label_injury_7d: true,
        label_quality: FeatureLabelQuality.LABELED,
      }
    if (inWindow.some((i) => !i.mechanism))
      return {
        label_injury_7d: null,
        label_quality: FeatureLabelQuality.UNKNOWN_MECHANISM,
      }
    return {
      label_injury_7d: false,
      label_quality: FeatureLabelQuality.LABELED,
    }
  }
}
