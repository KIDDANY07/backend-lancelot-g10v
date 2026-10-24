import { Injectable } from '@nestjs/common'
import {
  eligibleCategoriesFor,
  naturalCategoryFor,
} from 'src/common/utils/sport-age.util'

export enum PlanFocusDimension {
  FISICA = 'fisica',
  TECNICA = 'tecnica',
  TACTICA = 'tactica',
  PARTICIPACION = 'participacion',
}

export interface PlanCategoryInfo {
  id_category: number
  name: string
  min_age: number
  max_age: number
}

export interface PlanIndexScores {
  physical_score: number
  technical_score: number
  tactical_score: number | null
  participation_score: number
}

export interface CategorySuggestion {
  category: PlanCategoryInfo | null
  reason: string
}

export interface PromotionSuggestion {
  category: PlanCategoryInfo | null
  reason: string | null
}

export interface FocusSuggestion {
  dimension: PlanFocusDimension
  score: number
}

export interface PlanDecision {
  include: boolean
  id_category: number | null
  promote: boolean
  carry: boolean
}

export interface PlanDecisionInput {
  suggested_category: { id_category: number } | null
  promotion_category: { id_category: number } | null
  open_objectives: unknown[]
  planned_categories: string[]
}

@Injectable()
export class SeasonPlanningRulesService {
  defaultDecision(athlete: PlanDecisionInput): PlanDecision {
    return {
      include:
        athlete.suggested_category !== null &&
        athlete.planned_categories.length === 0,
      id_category: athlete.suggested_category?.id_category ?? null,
      promote: athlete.promotion_category !== null,
      carry: athlete.open_objectives.length > 0,
    }
  }

  resolveDecision(
    defaults: PlanDecision,
    override?: Partial<PlanDecision>,
  ): PlanDecision {
    return {
      include: override?.include ?? defaults.include,
      id_category: override?.id_category ?? defaults.id_category,
      promote: override?.promote ?? defaults.promote,
      carry: override?.carry ?? defaults.carry,
    }
  }

  isApplicable(decision: PlanDecision) {
    return decision.include && decision.id_category !== null
  }

  eligibleCategories(age: number, categories: PlanCategoryInfo[]) {
    return eligibleCategoriesFor(age, categories)
  }

  suggestCategory(
    age: number | null,
    referenceYear: number,
    current: PlanCategoryInfo | null,
    categories: PlanCategoryInfo[],
  ): CategorySuggestion {
    if (age === null)
      return {
        category: null,
        reason:
          'Sin fecha de nacimiento: registra la fecha para proponer su categoría',
      }
    const natural = naturalCategoryFor(age, categories)
    if (!natural)
      return {
        category: null,
        reason: `Cumple ${age} años en ${referenceYear} y supera la edad máxima de todas las categorías del club`,
      }
    if (current && current.max_age >= age && current.max_age >= natural.max_age)
      return {
        category: current,
        reason: `Sigue en ${current.name}: cumple ${age} años en ${referenceYear}`,
      }
    return {
      category: natural,
      reason: `Pasa a ${natural.name} por edad: cumple ${age} años en ${referenceYear}`,
    }
  }

  suggestPromotion(
    suggested: PlanCategoryInfo | null,
    hasReviewedTalentFlag: boolean,
    categories: PlanCategoryInfo[],
  ): PromotionSuggestion {
    if (!hasReviewedTalentFlag || !suggested)
      return { category: null, reason: null }
    const next = categories
      .filter((category) => category.max_age > suggested.max_age)
      .sort((a, b) => a.max_age - b.max_age)[0]
    if (!next)
      return {
        category: null,
        reason:
          'Tiene una señalización de talento revisada, pero ya está en la categoría más alta del club',
      }
    return {
      category: next,
      reason: `Señalización de talento revisada: puede entrenar también en ${next.name}`,
    }
  }

  focusDimension(scores: PlanIndexScores): FocusSuggestion {
    const candidates: FocusSuggestion[] = [
      {
        dimension: PlanFocusDimension.FISICA,
        score: Number(scores.physical_score),
      },
      {
        dimension: PlanFocusDimension.TECNICA,
        score: Number(scores.technical_score),
      },
      ...(scores.tactical_score === null
        ? []
        : [
            {
              dimension: PlanFocusDimension.TACTICA,
              score: Number(scores.tactical_score),
            },
          ]),
      {
        dimension: PlanFocusDimension.PARTICIPACION,
        score: Number(scores.participation_score),
      },
    ]
    return candidates.reduce((lowest, candidate) =>
      candidate.score < lowest.score ? candidate : lowest,
    )
  }

  carriedTargetDate(
    original: string,
    targetStart: string,
    targetEnd: string | null,
  ) {
    if (targetEnd) return targetEnd
    if (original >= targetStart) return original
    const date = new Date(`${targetStart}T00:00:00Z`)
    date.setUTCFullYear(date.getUTCFullYear() + 1)
    date.setUTCDate(date.getUTCDate() - 1)
    return date.toISOString().slice(0, 10)
  }
}
