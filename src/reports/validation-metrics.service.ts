import { Injectable } from '@nestjs/common'
import { addDaysToKey } from 'src/common/utils/date.util'
import { percentage } from 'src/common/utils/ratio.util'

export const VALIDATION_WINDOW_DAYS = 7

const POSITIVE_LEVELS = new Set(['medio', 'alto'])

export interface ReviewItem {
  level: string
  status: string
}

export interface StatusSummary {
  total: number
  by_level: Record<string, number>
  by_status: Record<string, number>
  dismissal_rate: number | null
  warnings: string[]
}

export interface RiskSignal {
  id_user: number
  date: string
  level: string | null
}

export interface InjuryEvent {
  id_user: number
  injury_date: string
}

export interface SensitivityResult {
  injuries: number
  preceded_by_alert: number
  sensitivity: number | null
  warnings: string[]
}

export interface PredictiveValueResult {
  alerts: number
  followed_by_injury: number
  positive_predictive_value: number | null
  pending_window: number
  warnings: string[]
}

export interface TalentItem {
  source: string
  status: string
}

export interface TalentSourceSummary {
  total: number
  by_status: Record<string, number>
  acceptance_rate: number | null
}

export interface TalentSummary {
  by_source: Record<string, TalentSourceSummary>
  warnings: string[]
}

export interface AgreementRow {
  risk_level: string | null
  rules_risk_level: string | null
}

export interface AgreementResult {
  compared: number
  both_positive: number
  both_negative: number
  only_ml_positive: number
  only_rules_positive: number
  agreement: number | null
  warnings: string[]
}

@Injectable()
export class ValidationMetricsService {
  isPositiveLevel(level: string | null | undefined): boolean {
    return !!level && POSITIVE_LEVELS.has(level)
  }

  private countBy<T>(
    items: T[],
    key: (item: T) => string,
    knownKeys: string[],
  ): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const known of knownKeys) counts[known] = 0
    for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1
    return counts
  }

  summarizeReviews(
    items: ReviewItem[],
    levels: string[],
    statuses: string[],
    label: string,
  ): StatusSummary {
    const by_status = this.countBy(items, (i) => i.status, statuses)
    const reviewed = by_status.reviewed ?? 0
    const dismissed = by_status.dismissed ?? 0
    const dismissal_rate = percentage(dismissed, reviewed + dismissed)
    const warnings: string[] = []
    if (dismissal_rate === null)
      warnings.push(
        `${label}: ninguna fue revisada ni descartada en el periodo; no se calcula la tasa de descarte`,
      )
    return {
      total: items.length,
      by_level: this.countBy(items, (i) => i.level, levels),
      by_status,
      dismissal_rate,
      warnings,
    }
  }

  sensitivity(
    injuries: InjuryEvent[],
    signals: RiskSignal[],
    label: string,
    windowDays = VALIDATION_WINDOW_DAYS,
  ): SensitivityResult {
    const positives = signals.filter((s) => this.isPositiveLevel(s.level))
    const preceded = injuries.filter((injury) => {
      const from = addDaysToKey(injury.injury_date, -windowDays)
      return positives.some(
        (s) =>
          s.id_user === injury.id_user &&
          s.date >= from &&
          s.date < injury.injury_date,
      )
    }).length
    const sensitivity = percentage(preceded, injuries.length)
    const warnings: string[] = []
    if (sensitivity === null)
      warnings.push(
        `${label}: no hay lesiones sin contacto en el periodo; no se calcula la sensibilidad`,
      )
    return {
      injuries: injuries.length,
      preceded_by_alert: preceded,
      sensitivity,
      warnings,
    }
  }

  positivePredictiveValue(
    signals: RiskSignal[],
    injuries: InjuryEvent[],
    today: string,
    label: string,
    windowDays = VALIDATION_WINDOW_DAYS,
  ): PredictiveValueResult {
    const positives = signals.filter((s) => this.isPositiveLevel(s.level))
    const evaluable = positives.filter(
      (s) => addDaysToKey(s.date, windowDays) <= today,
    )
    const followed = evaluable.filter((signal) => {
      const until = addDaysToKey(signal.date, windowDays)
      return injuries.some(
        (i) =>
          i.id_user === signal.id_user &&
          i.injury_date > signal.date &&
          i.injury_date <= until,
      )
    }).length
    const positive_predictive_value = percentage(followed, evaluable.length)
    const pending_window = positives.length - evaluable.length
    const warnings: string[] = []
    if (positive_predictive_value === null)
      warnings.push(
        `${label}: no hay alertas medio o alto con los ${windowDays} días siguientes ya cumplidos; no se calcula el valor predictivo`,
      )
    if (pending_window > 0)
      warnings.push(
        `${label}: ${pending_window} alertas recientes no se evaluaron porque aún no pasan ${windowDays} días`,
      )
    return {
      alerts: evaluable.length,
      followed_by_injury: followed,
      positive_predictive_value,
      pending_window,
      warnings,
    }
  }

  talentAcceptance(
    items: TalentItem[],
    sources: string[],
    statuses: string[],
  ): TalentSummary {
    const by_source: Record<string, TalentSourceSummary> = {}
    const warnings: string[] = []
    for (const source of sources) {
      const ofSource = items.filter((i) => i.source === source)
      const by_status = this.countBy(ofSource, (i) => i.status, statuses)
      const reviewed = by_status.reviewed ?? 0
      const dismissed = by_status.dismissed ?? 0
      const acceptance_rate = percentage(reviewed, reviewed + dismissed)
      if (acceptance_rate === null && ofSource.length > 0)
        warnings.push(
          `Talento (${source}): ninguna señalización fue revisada ni descartada; no se calcula la tasa de aceptación`,
        )
      by_source[source] = {
        total: ofSource.length,
        by_status,
        acceptance_rate,
      }
    }
    return { by_source, warnings }
  }

  agreement(rows: AgreementRow[]): AgreementResult {
    let both_positive = 0
    let both_negative = 0
    let only_ml_positive = 0
    let only_rules_positive = 0
    for (const row of rows) {
      const ml = this.isPositiveLevel(row.risk_level)
      const rules = this.isPositiveLevel(row.rules_risk_level)
      if (ml && rules) both_positive++
      else if (!ml && !rules) both_negative++
      else if (ml) only_ml_positive++
      else only_rules_positive++
    }
    const agreement = percentage(both_positive + both_negative, rows.length)
    const warnings: string[] = []
    if (agreement === null)
      warnings.push(
        'Modo sombra: no hay predicciones del ML en el periodo; no se calcula la concordancia',
      )
    return {
      compared: rows.length,
      both_positive,
      both_negative,
      only_ml_positive,
      only_rules_positive,
      agreement,
      warnings,
    }
  }
}
