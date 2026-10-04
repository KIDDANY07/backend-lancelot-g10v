import { Injectable } from '@nestjs/common'

export enum TalentCriterionCode {
  HIGH_PERCENTILE = 'percentil_alto',
  MULTIDIMENSIONAL_PROFILE = 'perfil_multidimensional',
  SUSTAINED_IMPROVEMENT = 'mejora_sostenida',
  AVAILABILITY = 'disponibilidad',
}

export interface TalentDetectionThresholds {
  min_percentile: number
  min_dimension_score: number
  min_improvement_delta: number
  min_participation_score: number
  exclude_severe_injury: boolean
  min_supporting_criteria: number
  near_max_age_months: number
}

export const DEFAULT_TALENT_DETECTION_THRESHOLDS: TalentDetectionThresholds = {
  min_percentile: 80,
  min_dimension_score: 40,
  min_improvement_delta: 5,
  min_participation_score: 50,
  exclude_severe_injury: true,
  min_supporting_criteria: 1,
  near_max_age_months: 12,
}

export const SUPPORTING_CRITERIA_COUNT = 2

export const SMALL_COHORT_SIZE = 5

export interface TalentCategoryInfo {
  id_category: number
  name: string
  min_age: number
  max_age: number
}

export interface TalentDetectionInput {
  index_value: number
  percentile: number
  cohort_size: number
  physical_score: number
  technical_score: number
  participation_score: number
  previous_index_value: number | null
  had_severe_injury: boolean
  birth_date: string | null
  reference_date: Date
  category: TalentCategoryInfo
  categories: TalentCategoryInfo[]
  thresholds: TalentDetectionThresholds
}

export interface TalentDetectionResult {
  flagged: boolean
  triggered_criteria: TalentCriterionCode[]
  score: number
  criteria_text: string
  recommended_action: string
  warnings: string[]
}

export const PRIORITY_FOLLOW_UP_ACTION =
  'Seguimiento prioritario en su categoría actual'

@Injectable()
export class TalentDetectionRulesService {
  private round2(value: number): number {
    return Math.round(value * 100) / 100
  }

  private format(value: number): string {
    return this.round2(value).toFixed(2)
  }

  private parseDate(date: string): Date {
    return new Date(`${date.slice(0, 10)}T00:00:00Z`)
  }

  private addMonths(date: Date, months: number): Date {
    const result = new Date(date)
    result.setUTCMonth(result.getUTCMonth() + months)
    return result
  }

  private addYears(date: Date, years: number): Date {
    const result = new Date(date)
    result.setUTCFullYear(result.getUTCFullYear() + years)
    return result
  }

  findNextCategory(
    current: TalentCategoryInfo,
    categories: TalentCategoryInfo[],
  ): TalentCategoryInfo | null {
    const higher = categories
      .filter((category) => category.min_age > current.min_age)
      .sort((a, b) => a.min_age - b.min_age)
    return higher[0] ?? null
  }

  isNearMaxAge(
    birth_date: string,
    max_age: number,
    reference_date: Date,
    months: number,
  ): boolean {
    const reachesMaxAge = this.addYears(this.parseDate(birth_date), max_age)
    return reachesMaxAge <= this.addMonths(reference_date, months)
  }

  isBornInFirstQuarter(birth_date: string): boolean {
    return this.parseDate(birth_date).getUTCMonth() <= 2
  }

  evaluate(input: TalentDetectionInput): TalentDetectionResult {
    const { thresholds } = input
    const triggered: TalentCriterionCode[] = []
    const lines: string[] = []
    const warnings: string[] = []

    const highPercentile = input.percentile >= thresholds.min_percentile
    if (highPercentile) triggered.push(TalentCriterionCode.HIGH_PERCENTILE)
    lines.push(
      `Percentil ${this.format(input.percentile)} del índice (${this.format(input.index_value)}) en su cohorte (mínimo ${thresholds.min_percentile}): ${highPercentile ? 'cumple' : 'no cumple'}`,
    )

    const minDimension = Math.min(
      input.physical_score,
      input.technical_score,
      input.participation_score,
    )
    const multidimensional = minDimension >= thresholds.min_dimension_score
    if (multidimensional)
      triggered.push(TalentCriterionCode.MULTIDIMENSIONAL_PROFILE)
    lines.push(
      `Perfil multidimensional: físico ${this.format(input.physical_score)}; técnico ${this.format(input.technical_score)}; participación ${this.format(input.participation_score)} (mínimo ${thresholds.min_dimension_score} en cada dimensión): ${multidimensional ? 'cumple' : 'no cumple'}`,
    )

    let supporting = 0
    if (input.previous_index_value === null) {
      warnings.push(
        'Sin índice de la temporada anterior: no se evaluó la mejora sostenida',
      )
      lines.push('Mejora frente a la temporada anterior: sin datos')
    } else {
      const delta = input.index_value - input.previous_index_value
      const improved = delta >= thresholds.min_improvement_delta
      if (improved) {
        triggered.push(TalentCriterionCode.SUSTAINED_IMPROVEMENT)
        supporting++
      }
      lines.push(
        `Mejora de ${delta >= 0 ? '+' : ''}${this.format(delta)} puntos frente a la temporada anterior (mínimo ${thresholds.min_improvement_delta}): ${improved ? 'cumple' : 'no cumple'}`,
      )
    }

    const blockedByInjury =
      thresholds.exclude_severe_injury && input.had_severe_injury
    const available =
      input.participation_score >= thresholds.min_participation_score &&
      !blockedByInjury
    if (available) {
      triggered.push(TalentCriterionCode.AVAILABILITY)
      supporting++
    }
    lines.push(
      `Disponibilidad: participación ${this.format(input.participation_score)} (mínimo ${thresholds.min_participation_score})${input.had_severe_injury ? ' con lesión severa en la temporada' : ' sin lesión severa'}: ${available ? 'cumple' : 'no cumple'}`,
    )

    const flagged =
      highPercentile &&
      multidimensional &&
      supporting >= thresholds.min_supporting_criteria

    if (input.cohort_size < SMALL_COHORT_SIZE)
      warnings.push(
        `Cohorte pequeña (${input.cohort_size} deportistas): el percentil es poco estable`,
      )

    let recommended_action = PRIORITY_FOLLOW_UP_ACTION
    if (!input.birth_date) {
      warnings.push(
        'Sin fecha de nacimiento: no se evaluó la proximidad a la edad máxima de la categoría ni el efecto de edad relativa',
      )
    } else {
      const nearMaxAge = this.isNearMaxAge(
        input.birth_date,
        input.category.max_age,
        input.reference_date,
        thresholds.near_max_age_months,
      )
      if (nearMaxAge) {
        const next = this.findNextCategory(input.category, input.categories)
        if (next) recommended_action = `Evaluar ascenso a ${next.name}`
        else
          warnings.push(
            'Cumple la edad máxima de su categoría pero no hay una categoría superior configurada',
          )
      }
      if (this.isBornInFirstQuarter(input.birth_date))
        warnings.push(
          'Posible efecto de edad relativa: nacido en el primer trimestre',
        )
    }

    return {
      flagged,
      triggered_criteria: triggered,
      score: this.round2(input.percentile),
      criteria_text: lines.join('. '),
      recommended_action,
      warnings,
    }
  }
}
