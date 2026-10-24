import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { AthletesInCategoriesService } from 'src/athletes_in_categories/athletes_in_categories.service'
import { AthletesInCategory } from 'src/athletes_in_categories/entities/athletes_in_category.entity'
import { Category } from 'src/categories/entities/category.entity'
import { extractErrorMessage } from 'src/common/utils/error-message.util'
import {
  pickBaseAssignments,
  referenceYearOf,
  sportingAge,
} from 'src/common/utils/sport-age.util'
import {
  DevelopmentObjective,
  DevelopmentObjectiveStatus,
} from 'src/development_objectives/entities/development-objective.entity'
import { Season, SeasonStatus } from 'src/seasons/entities/season.entity'
import { SeasonsService } from 'src/seasons/seasons.service'
import {
  TalentFlag,
  TalentFlagStatus,
} from 'src/talent_flags/entities/talent-flag.entity'
import { WeightedProgressIndex } from 'src/weighted_progress_index/entities/weighted-progress-index.entity'
import { ApplySeasonPlanDto } from './dto/apply-season-plan.dto'
import {
  PlanCategoryInfo,
  SeasonPlanningRulesService,
} from './season-planning-rules.service'
import { SeasonPlanQueryDto } from './dto/season-plan-query.dto'
import { paginateList } from 'src/common/utils/pagination.util'

@Injectable()
export class SeasonPlanningService {
  private readonly logger = new Logger(SeasonPlanningService.name)

  constructor(
    @InjectRepository(AthletesInCategory)
    private readonly athletesInCategoryRepository: Repository<AthletesInCategory>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    @InjectRepository(WeightedProgressIndex)
    private readonly weightedProgressIndexRepository: Repository<WeightedProgressIndex>,
    @InjectRepository(TalentFlag)
    private readonly talentFlagsRepository: Repository<TalentFlag>,
    @InjectRepository(DevelopmentObjective)
    private readonly developmentObjectivesRepository: Repository<DevelopmentObjective>,
    private readonly seasonsService: SeasonsService,
    private readonly athletesInCategoriesService: AthletesInCategoriesService,
    private readonly seasonPlanningRulesService: SeasonPlanningRulesService,
  ) {}

  private async findSeasonOrFail(id_season: number) {
    const season = await this.seasonsService.findOneById(id_season)
    if (!season)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta temporada',
      })
    return season
  }

  private async resolveTarget(source: Season, id_target_season?: number) {
    if (!id_target_season) return this.seasonsService.findNext(source)
    const target = await this.findSeasonOrFail(id_target_season)
    if (target.id_season === source.id_season)
      throw new BadRequestException({
        status: 'Error',
        mensaje:
          'La temporada del siguiente ciclo debe ser distinta de la temporada de origen',
      })
    if (target.start_date <= source.start_date)
      throw new BadRequestException({
        status: 'Error',
        mensaje: `La temporada del siguiente ciclo debe empezar después de ${source.name}`,
      })
    return target
  }

  private async loadCategories() {
    const categories = await this.categoriesRepository.find()
    return categories.map((category): PlanCategoryInfo => ({
      id_category: category.id_category,
      name: category.name,
      min_age: Number(category.min_age),
      max_age: Number(category.max_age),
    }))
  }

  private async loadSourceAssignments(
    id_season: number,
    categories: PlanCategoryInfo[],
  ) {
    const maxAgeById = new Map(
      categories.map((category) => [category.id_category, category.max_age]),
    )
    const assignments = await this.athletesInCategoryRepository
      .createQueryBuilder('assignment')
      .leftJoin('assignment.user', 'user')
      .addSelect([
        'user.id_user',
        'user.name',
        'user.lastname',
        'user.birth_date',
      ])
      .where('assignment.id_season = :id_season', { id_season })
      .getMany()
    return pickBaseAssignments(
      assignments,
      (assignment) => maxAgeById.get(assignment.id_category) ?? Infinity,
    ) as Map<number, AthletesInCategory>
  }

  private loadOpenObjectives(id_season: number, userIds: number[]) {
    if (userIds.length === 0) return Promise.resolve([])
    return this.developmentObjectivesRepository.find({
      where: {
        id_season,
        id_user: In(userIds),
        status: DevelopmentObjectiveStatus.OPEN,
      },
      order: { target_date: 'ASC', id_objective: 'ASC' },
    })
  }

  private seasonSummary(season: Season | null) {
    if (!season) return null
    return {
      id_season: season.id_season,
      name: season.name,
      status: season.status,
      start_date: season.start_date,
      end_date: season.end_date ?? null,
    }
  }

  private async buildPlan(id_season: number, id_target_season?: number) {
    const source = await this.findSeasonOrFail(id_season)
    const target = await this.resolveTarget(source, id_target_season)
    const referenceYear = target
      ? referenceYearOf(target.start_date)
      : referenceYearOf(source.start_date) + 1

    const categories = await this.loadCategories()
    const categoryById = new Map(
      categories.map((category) => [category.id_category, category]),
    )
    const baseByUser = await this.loadSourceAssignments(id_season, categories)
    const userIds = [...baseByUser.keys()]

    const [indices, reviewedFlags, objectives, targetAssignments] =
      await Promise.all([
        userIds.length
          ? this.weightedProgressIndexRepository.find({
              where: { id_season, id_user: In(userIds) },
              relations: { profile: true },
            })
          : Promise.resolve([]),
        userIds.length
          ? this.talentFlagsRepository.find({
              where: {
                id_season,
                id_user: In(userIds),
                status: TalentFlagStatus.REVIEWED,
              },
            })
          : Promise.resolve([]),
        this.loadOpenObjectives(id_season, userIds),
        target && userIds.length
          ? this.athletesInCategoryRepository.find({
              where: { id_season: target.id_season, id_user: In(userIds) },
            })
          : Promise.resolve([]),
      ])

    const indexByUser = new Map(indices.map((index) => [index.id_user, index]))
    const talentUsers = new Set(reviewedFlags.map((flag) => flag.id_user))
    const objectivesByUser = new Map<number, DevelopmentObjective[]>()
    for (const objective of objectives) {
      const list = objectivesByUser.get(objective.id_user) ?? []
      list.push(objective)
      objectivesByUser.set(objective.id_user, list)
    }
    const plannedByUser = new Map<number, string[]>()
    for (const assignment of targetAssignments) {
      const list = plannedByUser.get(assignment.id_user) ?? []
      list.push(categoryById.get(assignment.id_category)?.name ?? '')
      plannedByUser.set(assignment.id_user, list)
    }

    const athletes = [...baseByUser.values()].map((assignment) => {
      const current = categoryById.get(assignment.id_category) ?? null
      const age = sportingAge(assignment.user?.birth_date, referenceYear)
      const suggestion = this.seasonPlanningRulesService.suggestCategory(
        age,
        referenceYear,
        current,
        categories,
      )
      const promotion = this.seasonPlanningRulesService.suggestPromotion(
        suggestion.category,
        talentUsers.has(assignment.id_user),
        categories,
      )
      const index = indexByUser.get(assignment.id_user)
      const focus = index
        ? this.seasonPlanningRulesService.focusDimension({
            physical_score: Number(index.physical_score),
            technical_score: Number(index.technical_score),
            tactical_score:
              Number(index.profile?.w_tactical ?? 0) > 0
                ? Number(index.tactical_score)
                : null,
            participation_score: Number(index.participation_score),
          })
        : null
      const eligible =
        age === null
          ? []
          : this.seasonPlanningRulesService.eligibleCategories(age, categories)
      const athlete = {
        id_user: assignment.id_user,
        name: assignment.user?.name ?? '',
        lastname: assignment.user?.lastname ?? '',
        position: assignment.position ?? null,
        current_category: current
          ? { id_category: current.id_category, name: current.name }
          : null,
        sporting_age: age,
        suggested_category: suggestion.category
          ? {
              id_category: suggestion.category.id_category,
              name: suggestion.category.name,
            }
          : null,
        suggestion_reason: suggestion.reason,
        promotion_category: promotion.category
          ? {
              id_category: promotion.category.id_category,
              name: promotion.category.name,
            }
          : null,
        promotion_reason: promotion.reason,
        eligible_category_ids: eligible.map((category) => category.id_category),
        index_value: index ? Number(index.index_value) : null,
        focus_dimension: focus?.dimension ?? null,
        focus_score: focus?.score ?? null,
        open_objectives: (objectivesByUser.get(assignment.id_user) ?? []).map(
          (objective) => ({
            id_objective: objective.id_objective,
            description: objective.description,
            target_date: objective.target_date,
          }),
        ),
        planned_categories: plannedByUser.get(assignment.id_user) ?? [],
      }
      return {
        ...athlete,
        default_decision:
          this.seasonPlanningRulesService.defaultDecision(athlete),
      }
    })

    athletes.sort((a, b) => {
      const ageA = categoryById.get(a.current_category?.id_category ?? 0)
      const ageB = categoryById.get(b.current_category?.id_category ?? 0)
      return (
        (ageA?.max_age ?? Infinity) - (ageB?.max_age ?? Infinity) ||
        a.lastname.localeCompare(b.lastname, 'es') ||
        a.name.localeCompare(b.name, 'es')
      )
    })

    return { source, target, referenceYear, athletes }
  }

  async getPlan(id_season: number, query: SeasonPlanQueryDto = {}) {
    const { source, target, referenceYear, athletes } = await this.buildPlan(
      id_season,
      query.id_target_season,
    )
    const { items, pagination } = paginateList(athletes, query)
    return {
      status: 'Success',
      mensaje: target
        ? `Plan del siguiente ciclo de ${source.name} hacia ${target.name}`
        : `Plan del siguiente ciclo de ${source.name}; crea la temporada siguiente para aplicarlo`,
      plan: {
        source: this.seasonSummary(source),
        target: this.seasonSummary(target),
        reference_year: referenceYear,
        athletes: items,
        default_applicable: athletes.filter((athlete) =>
          this.seasonPlanningRulesService.isApplicable(
            athlete.default_decision,
          ),
        ).length,
      },
      pagination,
    }
  }

  private async assign(
    id_user: number,
    id_category: number,
    id_season: number,
    position: string | null,
  ) {
    const existing = await this.athletesInCategoryRepository.findOne({
      where: { id_user, id_category, id_season },
    })
    if (existing) return false
    await this.athletesInCategoriesService.create({
      id_user,
      id_category,
      id_season,
      ...(position ? { position } : {}),
    })
    return true
  }

  async applyPlan(
    id_season: number,
    applySeasonPlanDto: ApplySeasonPlanDto,
    requested_by: number | null,
  ) {
    const plan = await this.buildPlan(
      id_season,
      applySeasonPlanDto.id_target_season,
    )
    const { source, target } = plan
    if (!target)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'Elige la temporada del siguiente ciclo',
      })
    if (target.status === SeasonStatus.CLOSED)
      throw new BadRequestException({
        status: 'Error',
        mensaje: `${target.name} está cerrada; elige una temporada planeada o activa`,
      })

    const overrides = new Map(
      (applySeasonPlanDto.overrides ?? []).map((override) => [
        override.id_user,
        override,
      ]),
    )
    const names = new Map(
      plan.athletes.map((athlete) => [
        athlete.id_user,
        `${athlete.name} ${athlete.lastname}`.trim(),
      ]),
    )
    const items = plan.athletes.flatMap((athlete) => {
      const decision = this.seasonPlanningRulesService.resolveDecision(
        athlete.default_decision,
        overrides.get(athlete.id_user),
      )
      if (!this.seasonPlanningRulesService.isApplicable(decision)) return []
      return [
        {
          id_user: athlete.id_user,
          id_category: decision.id_category as number,
          id_promotion_category:
            decision.promote && athlete.promotion_category
              ? athlete.promotion_category.id_category
              : null,
          carry_objectives:
            decision.carry && athlete.open_objectives.length > 0,
        },
      ]
    })
    if (items.length === 0)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'El plan no tiene deportistas para aplicar',
      })

    const categories = await this.loadCategories()
    const baseByUser = await this.loadSourceAssignments(id_season, categories)
    const requestedIds = items.map((item) => item.id_user)
    const objectives = await this.loadOpenObjectives(
      id_season,
      requestedIds.filter((id) => baseByUser.has(id)),
    )
    const existingTargetObjectives = requestedIds.length
      ? await this.developmentObjectivesRepository.find({
          where: { id_season: target.id_season, id_user: In(requestedIds) },
        })
      : []
    const existingDescriptions = new Set(
      existingTargetObjectives.map(
        (objective) => `${objective.id_user}:${objective.description.trim()}`,
      ),
    )

    let assigned = 0
    let skipped = 0
    let objectivesCarried = 0
    const failed: { id_user: number; athlete_name: string; mensaje: string }[] =
      []

    for (const item of items) {
      const athlete_name = names.get(item.id_user) ?? ''
      const base = baseByUser.get(item.id_user)
      if (!base) {
        failed.push({
          id_user: item.id_user,
          athlete_name,
          mensaje: `No estaba asignado en ${source.name}`,
        })
        continue
      }
      const position = base.position ?? null
      try {
        const categoryIds = [
          item.id_category,
          ...(item.id_promotion_category &&
          item.id_promotion_category !== item.id_category
            ? [item.id_promotion_category]
            : []),
        ]
        for (const id_category of categoryIds) {
          if (
            await this.assign(
              item.id_user,
              id_category,
              target.id_season,
              position,
            )
          )
            assigned++
          else skipped++
        }
        if (item.carry_objectives) {
          for (const objective of objectives) {
            if (objective.id_user !== item.id_user) continue
            const key = `${objective.id_user}:${objective.description.trim()}`
            if (existingDescriptions.has(key)) continue
            await this.developmentObjectivesRepository.save({
              id_user: objective.id_user,
              id_season: target.id_season,
              description: objective.description,
              target_date: this.seasonPlanningRulesService.carriedTargetDate(
                objective.target_date,
                target.start_date,
                target.end_date ?? null,
              ),
              status: DevelopmentObjectiveStatus.OPEN,
              set_by: requested_by,
            })
            existingDescriptions.add(key)
            objectivesCarried++
          }
        }
      } catch (error) {
        const mensaje = extractErrorMessage(error)
        failed.push({ id_user: item.id_user, athlete_name, mensaje })
        this.logger.error(
          `Error al planificar el siguiente ciclo del deportista ${item.id_user}: ${mensaje}`,
        )
      }
    }

    return {
      status: 'Success',
      mensaje: `Plan aplicado en ${target.name}: ${assigned} ${assigned === 1 ? 'asignación nueva' : 'asignaciones nuevas'} y ${objectivesCarried} ${objectivesCarried === 1 ? 'objetivo llevado' : 'objetivos llevados'}`,
      assigned,
      skipped,
      objectives_carried: objectivesCarried,
      failed,
    }
  }
}
