import { Injectable } from '@nestjs/common'
import {
  naturalCategoryFor,
  pickBaseAssignments,
  referenceYearOf,
  sportingAge,
} from 'src/common/utils/sport-age.util'
import { matchMinutesFor } from 'src/common/positions/position-catalog'
import {
  TALENT_FEATURE_VERSION,
  TalentLabelQuality,
} from './entities/athlete-season-features.entity'

export interface TalentCategoryInput {
  id_category: number
  min_age: number
  max_age: number
}

export interface TalentSeasonInput {
  id_season: number
  start_date: string
  end_date: string | null
}

export interface TalentAssignmentInput {
  id_ath_cat?: number
  id_user: number
  id_season: number
  id_category: number
  position: string | null
  birth_date: string | null
}

export interface TalentIndexInput {
  id_user: number
  id_season: number
  index_value: number
  physical_score: number
  technical_score: number
  tactical_score: number | null
  participation_score: number
  contribution_score: number | null
}

export interface TalentInjuryInput {
  id_user: number
  injury_date: string
  severe: boolean
}

export interface TalentMinutesInput {
  id_user: number
  id_season: number
  id_category: number
  minutes: number
}

export interface TalentMatchCountInput {
  id_season: number
  id_category: number
  matches: number
}

export interface TalentDatasetInput {
  seasons: TalentSeasonInput[]
  categories: TalentCategoryInput[]
  assignments: TalentAssignmentInput[]
  indices: TalentIndexInput[]
  injuries: TalentInjuryInput[]
  rulesFlagged: { id_user: number; id_season: number }[]
  minutes: TalentMinutesInput[]
  matchCounts: TalentMatchCountInput[]
  today: string
}

export interface TalentNextCategoryShare {
  category: TalentCategoryInput
  share: number
}

export interface TalentFeatureRow {
  id_user: number
  id_season: number
  season_start: string
  id_category: number
  position: string | null
  age_years: number | null
  birth_quarter: number | null
  years_to_category_max: number | null
  plays_up: boolean
  seasons_in_club: number
  cohort_size: number
  index_value: number
  index_percentile: number
  physical_score: number
  technical_score: number
  tactical_score: number | null
  participation_score: number
  contribution_score: number | null
  index_delta: number | null
  injuries_in_season: number
  severe_injury: boolean
  rules_flagged: boolean
  label_promoted: boolean | null
  label_quality: TalentLabelQuality
  feature_version: string
}

const NEUTRAL_PERCENTILE = 50
export const CONSOLIDATION_MINUTES_SHARE = 0.5
export const PROMOTION_MINUTES_SHARE = 0.3

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function dayBefore(date: string) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - 1)
  return day.toISOString().slice(0, 10)
}

@Injectable()
export class TalentFeatureCalculatorService {
  birthQuarter(birthDate: string | null): number | null {
    if (!birthDate) return null
    const month = Number(String(birthDate).slice(5, 7))
    return Number.isFinite(month) && month >= 1 ? Math.ceil(month / 3) : null
  }

  percentile(value: number, cohort: number[]): number {
    if (cohort.length <= 1) return NEUTRAL_PERCENTILE
    return round2(
      (cohort.filter((item) => item <= value).length / cohort.length) * 100,
    )
  }

  isAboveNatural(
    category: TalentCategoryInput,
    age: number | null,
    categories: TalentCategoryInput[],
  ): boolean {
    if (age === null) return false
    const natural = naturalCategoryFor(age, categories)
    return natural !== null && category.max_age > natural.max_age
  }

  label(input: {
    birthDate: string | null
    nextSeason: TalentSeasonInput | null
    nextSeasonHasAssignments: boolean
    nextShares: TalentNextCategoryShare[]
    categories: TalentCategoryInput[]
  }): { quality: TalentLabelQuality; promoted: boolean | null } {
    if (!input.nextSeason || !input.nextSeasonHasAssignments)
      return { quality: TalentLabelQuality.PENDING, promoted: null }
    const age = sportingAge(
      input.birthDate,
      referenceYearOf(input.nextSeason.start_date),
    )
    if (input.nextShares.length === 0 || age === null)
      return { quality: TalentLabelQuality.EXCLUDED, promoted: null }
    const base = [...input.nextShares].sort(
      (a, b) =>
        a.category.max_age - b.category.max_age ||
        a.category.min_age - b.category.min_age,
    )[0]
    const consolidated = base.share >= CONSOLIDATION_MINUTES_SHARE
    const promoted = input.nextShares.some(
      (item) =>
        this.isAboveNatural(item.category, age, input.categories) &&
        item.share >= PROMOTION_MINUTES_SHARE,
    )
    return {
      quality: TalentLabelQuality.LABELED,
      promoted: consolidated || promoted,
    }
  }

  buildRows(input: TalentDatasetInput): TalentFeatureRow[] {
    const seasons = [...input.seasons].sort((a, b) =>
      a.start_date.localeCompare(b.start_date),
    )
    const categoryById = new Map(
      input.categories.map((category) => [category.id_category, category]),
    )
    const indexByKey = new Map(
      input.indices.map((index) => [
        `${index.id_user}:${index.id_season}`,
        index,
      ]),
    )
    const minutesByKey = new Map<string, number>()
    for (const item of input.minutes) {
      const key = `${item.id_user}:${item.id_season}:${item.id_category}`
      minutesByKey.set(key, (minutesByKey.get(key) ?? 0) + item.minutes)
    }
    const matchesByKey = new Map(
      input.matchCounts.map((item) => [
        `${item.id_season}:${item.id_category}`,
        item.matches,
      ]),
    )
    const shareOf = (
      item: TalentAssignmentInput,
      category: TalentCategoryInput,
    ) => {
      const matches =
        matchesByKey.get(`${item.id_season}:${category.id_category}`) ?? 0
      if (matches <= 0) return 0
      const minutes =
        minutesByKey.get(
          `${item.id_user}:${item.id_season}:${category.id_category}`,
        ) ?? 0
      return minutes / (matches * matchMinutesFor(item.position))
    }
    const flagged = new Set(
      input.rulesFlagged.map((flag) => `${flag.id_user}:${flag.id_season}`),
    )
    const assignmentsBySeason = new Map<number, TalentAssignmentInput[]>()
    for (const assignment of input.assignments) {
      const list = assignmentsBySeason.get(assignment.id_season) ?? []
      list.push(assignment)
      assignmentsBySeason.set(assignment.id_season, list)
    }

    const rows: TalentFeatureRow[] = []
    seasons.forEach((season, position) => {
      const nextSeason = seasons[position + 1] ?? null
      const seasonAssignments = assignmentsBySeason.get(season.id_season) ?? []
      const nextAssignments = nextSeason
        ? (assignmentsBySeason.get(nextSeason.id_season) ?? [])
        : []
      const previousSeason = position > 0 ? seasons[position - 1] : null
      const seasonEnd =
        season.end_date ??
        (nextSeason ? dayBefore(nextSeason.start_date) : input.today)
      const referenceYear = referenceYearOf(season.start_date)

      const base = pickBaseAssignments(
        seasonAssignments,
        (assignment) =>
          categoryById.get(assignment.id_category)?.max_age ?? Infinity,
      )
      const cohorts = new Map<number, number[]>()
      for (const assignment of base.values()) {
        const index = indexByKey.get(
          `${assignment.id_user}:${season.id_season}`,
        )
        if (!index) continue
        const values = cohorts.get(assignment.id_category) ?? []
        values.push(index.index_value)
        cohorts.set(assignment.id_category, values)
      }

      for (const assignment of base.values()) {
        const index = indexByKey.get(
          `${assignment.id_user}:${season.id_season}`,
        )
        const category = categoryById.get(assignment.id_category)
        if (!index || !category) continue
        const age = sportingAge(assignment.birth_date, referenceYear)
        const cohort = cohorts.get(assignment.id_category) ?? []
        const previousIndex = previousSeason
          ? indexByKey.get(`${assignment.id_user}:${previousSeason.id_season}`)
          : undefined
        const seasonsInClub = seasons
          .slice(0, position)
          .filter((earlier) =>
            (assignmentsBySeason.get(earlier.id_season) ?? []).some(
              (item) => item.id_user === assignment.id_user,
            ),
          ).length
        const injuries = input.injuries.filter(
          (injury) =>
            injury.id_user === assignment.id_user &&
            injury.injury_date >= season.start_date &&
            injury.injury_date <= seasonEnd,
        )
        const label = this.label({
          birthDate: assignment.birth_date,
          nextSeason,
          nextSeasonHasAssignments: nextAssignments.length > 0,
          nextShares: nextAssignments
            .filter((item) => item.id_user === assignment.id_user)
            .flatMap((item) => {
              const next = categoryById.get(item.id_category)
              return next
                ? [{ category: next, share: shareOf(item, next) }]
                : []
            }),
          categories: input.categories,
        })

        rows.push({
          id_user: assignment.id_user,
          id_season: season.id_season,
          season_start: season.start_date,
          id_category: assignment.id_category,
          position: assignment.position,
          age_years: age,
          birth_quarter: this.birthQuarter(assignment.birth_date),
          years_to_category_max: age === null ? null : category.max_age - age,
          plays_up: this.isAboveNatural(category, age, input.categories),
          seasons_in_club: seasonsInClub,
          cohort_size: cohort.length,
          index_value: index.index_value,
          index_percentile: this.percentile(index.index_value, cohort),
          physical_score: index.physical_score,
          technical_score: index.technical_score,
          tactical_score: index.tactical_score,
          participation_score: index.participation_score,
          contribution_score: index.contribution_score,
          index_delta: previousIndex
            ? round2(index.index_value - previousIndex.index_value)
            : null,
          injuries_in_season: injuries.length,
          severe_injury: injuries.some((injury) => injury.severe),
          rules_flagged: flagged.has(
            `${assignment.id_user}:${season.id_season}`,
          ),
          label_promoted: label.promoted,
          label_quality: label.quality,
          feature_version: TALENT_FEATURE_VERSION,
        })
      }
    })
    return rows
  }
}
