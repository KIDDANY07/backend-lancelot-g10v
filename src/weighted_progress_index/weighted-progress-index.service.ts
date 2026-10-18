import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { plainToInstance } from 'class-transformer'
import { In, Repository } from 'typeorm'
import { AthletesInCategory } from 'src/athletes_in_categories/entities/athletes_in_category.entity'
import { Category } from 'src/categories/entities/category.entity'
import {
  comparisonKey,
  ContributionGroup,
  matchMinutesFor,
  positionInfo,
} from 'src/common/positions/position-catalog'
import { Match } from 'src/matches/entities/match.entity'
import { MatchStatistic } from 'src/match_statistics/entities/match-statistic.entity'
import { PhysicalEvaluation } from 'src/physical_evaluations/entities/physical-evaluation.entity'
import { PositionWeightProfilesService } from 'src/position_weight_profiles/position-weight-profiles.service'
import { SeasonsService } from 'src/seasons/seasons.service'
import { TechnicalEvaluation } from 'src/technical_evaluations/entities/technical-evaluation.entity'
import { EvaluationDimension } from 'src/technical_evaluations/evaluation-catalog'
import { TrainingLoad } from 'src/training_loads/entities/training-load.entity'
import { TrainingSession } from 'src/training_sessions/entities/training-session.entity'
import { UsersService } from 'src/users/users.service'
import { extractErrorMessage } from 'src/common/utils/error-message.util'
import { FilterWeightedProgressIndexDto } from './dto/filter-weighted-progress-index.dto'
import { ResponseWeightedProgressIndexDto } from './dto/response-weighted-progress-index.dto'
import { WeightedProgressIndex } from './entities/weighted-progress-index.entity'
import {
  ContributionResult,
  MatchAppearance,
  ProgressIndexCalculatorService,
} from './progress-index-calculator.service'

@Injectable()
export class WeightedProgressIndexService {
  constructor(
    @InjectRepository(WeightedProgressIndex)
    private readonly weightedProgressIndexRepository: Repository<WeightedProgressIndex>,
    @InjectRepository(AthletesInCategory)
    private readonly athletesInCategoryRepository: Repository<AthletesInCategory>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    @InjectRepository(PhysicalEvaluation)
    private readonly physicalEvaluationsRepository: Repository<PhysicalEvaluation>,
    @InjectRepository(TechnicalEvaluation)
    private readonly technicalEvaluationsRepository: Repository<TechnicalEvaluation>,
    @InjectRepository(TrainingSession)
    private readonly trainingSessionsRepository: Repository<TrainingSession>,
    @InjectRepository(TrainingLoad)
    private readonly trainingLoadsRepository: Repository<TrainingLoad>,
    @InjectRepository(Match)
    private readonly matchesRepository: Repository<Match>,
    @InjectRepository(MatchStatistic)
    private readonly matchStatisticsRepository: Repository<MatchStatistic>,
    private readonly usersService: UsersService,
    private readonly seasonsService: SeasonsService,
    private readonly positionWeightProfilesService: PositionWeightProfilesService,
    private readonly progressIndexCalculatorService: ProgressIndexCalculatorService,
  ) {}

  async findOneById(id_index: number) {
    return this.weightedProgressIndexRepository.findOne({
      where: { id_index },
      relations: { athlete: true },
    })
  }

  async findAll(filters: FilterWeightedProgressIndexDto) {
    const { page = 1, limit = 10, id_user, id_season } = filters
    const query = this.weightedProgressIndexRepository
      .createQueryBuilder('index')
      .leftJoinAndSelect('index.athlete', 'athlete')
      .orderBy('index.id_season', 'DESC')
      .addOrderBy('index.index_value', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)

    if (id_user) query.andWhere('index.id_user = :id_user', { id_user })
    if (id_season) query.andWhere('index.id_season = :id_season', { id_season })

    const [indices, total] = await query.getManyAndCount()
    if (!total)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay índices de progreso ponderado registrados',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de índices de progreso ponderado exitosa',
      indices: plainToInstance(ResponseWeightedProgressIndexDto, indices, {
        excludeExtraneousValues: true,
      }),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async getById(id_index: number) {
    const index = await this.findOneById(id_index)
    if (!index)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este índice de progreso ponderado',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de índice de progreso ponderado exitosa',
      index: plainToInstance(ResponseWeightedProgressIndexDto, index, {
        excludeExtraneousValues: true,
      }),
    }
  }

  private async getLatestPhysicalMetrics(id_user: number, id_season: number) {
    const evaluations = await this.physicalEvaluationsRepository.find({
      where: { id_user, id_season },
      order: { eval_date: 'DESC', id_eval: 'DESC' },
    })
    const latest = evaluations[0]
    return {
      vo2max:
        latest?.vo2max_estimado != null ? Number(latest.vo2max_estimado) : null,
      speed20m: latest?.speed_20m != null ? Number(latest.speed_20m) : null,
    }
  }

  async recalculateForSeason(id_season: number) {
    const season = await this.seasonsService.findOneById(id_season)
    if (!season)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta temporada',
      })

    const assignments = await this.athletesInCategoryRepository.find({
      where: { id_season },
      select: { id_user: true },
    })
    const userIds = [...new Set(assignments.map((a) => a.id_user))]

    let recalculated = 0
    const failed: { id_user: number; mensaje: string }[] = []
    for (const id_user of userIds) {
      try {
        await this.calculateForAthleteSeason(id_user, id_season)
        recalculated++
      } catch (error) {
        failed.push({ id_user, mensaje: extractErrorMessage(error) })
      }
    }

    return {
      status: 'Success',
      mensaje: `Recálculo de índices de la temporada completado: ${recalculated} recalculados, ${failed.length} con error`,
      recalculated,
      failed,
    }
  }

  async calculateForAthleteSeason(id_user: number, id_season: number) {
    const athlete = await this.usersService.findOneById(id_user)
    if (!athlete)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe este deportista',
      })

    const season = await this.seasonsService.findOneById(id_season)
    if (!season)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe esta temporada',
      })

    const seasonAssignments = await this.athletesInCategoryRepository
      .createQueryBuilder('assignment')
      .leftJoin('assignment.category', 'category')
      .where('assignment.id_user = :id_user', { id_user })
      .andWhere('assignment.id_season = :id_season', { id_season })
      .orderBy('category.max_age', 'ASC')
      .addOrderBy('assignment.id_ath_cat', 'ASC')
      .getMany()
    const baseAssignment = seasonAssignments[0]
    const athInCat = baseAssignment
      ? {
          ...baseAssignment,
          position:
            baseAssignment.position ??
            seasonAssignments.find((assignment) => assignment.position)
              ?.position ??
            null,
        }
      : null
    if (!athInCat)
      throw new BadRequestException({
        status: 'Error',
        mensaje:
          'El deportista no está asignado a una categoría en esta temporada',
      })
    if (!athInCat.position)
      throw new BadRequestException({
        status: 'Error',
        mensaje:
          'El deportista no tiene una posición asignada en esta categoría/temporada',
      })

    const category = await this.categoriesRepository.findOne({
      where: { id_category: athInCat.id_category },
    })
    if (!category)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe la categoría asignada al deportista',
      })

    const profile =
      await this.positionWeightProfilesService.findByPositionAndAgeCategory(
        athInCat.position,
        category.name,
      )
    if (!profile)
      throw new BadRequestException({
        status: 'Error',
        mensaje: `No existe un perfil de pesos configurado para la posición "${athInCat.position}" y la categoría "${category.name}". Configúralo en /position-weight-profiles antes de recalcular.`,
      })

    // --- Physical score: percentile within the category+season cohort ---
    const cohort = await this.athletesInCategoryRepository.find({
      where: { id_category: athInCat.id_category, id_season },
    })
    const cohortMetrics = await Promise.all(
      cohort.map((member) =>
        this.getLatestPhysicalMetrics(member.id_user, id_season),
      ),
    )
    const athleteMetrics = await this.getLatestPhysicalMetrics(
      id_user,
      id_season,
    )
    const cohortVo2max = cohortMetrics
      .map((m) => m.vo2max)
      .filter((v): v is number => v !== null)
    const cohortSpeed20m = cohortMetrics
      .map((m) => m.speed20m)
      .filter((v): v is number => v !== null)

    const physical = this.progressIndexCalculatorService.computePhysicalScore({
      athleteVo2max: athleteMetrics.vo2max,
      cohortVo2max,
      athleteSpeed20m: athleteMetrics.speed20m,
      cohortSpeed20m,
    })

    // --- Technical and tactical scores: average of each dimension's evaluations, scaled to 0-100 ---
    const evaluations = await this.technicalEvaluationsRepository.find({
      where: { id_user, id_season },
    })
    const scoresOf = (dimension: EvaluationDimension) =>
      evaluations
        .filter((evaluation) => evaluation.dimension === dimension)
        .map((evaluation) => Number(evaluation.score))
    const technical = this.progressIndexCalculatorService.computeTechnicalScore(
      scoresOf(EvaluationDimension.TECNICA),
    )
    const tactical = this.progressIndexCalculatorService.computeTacticalScore(
      scoresOf(EvaluationDimension.TACTICA),
    )

    // --- Participation score: attendance, minutes and contribution across all the athlete's categories ---
    const categoryIds = [
      ...new Set(seasonAssignments.map((assignment) => assignment.id_category)),
    ]
    const positionByCategory = new Map(
      seasonAssignments.map((assignment) => [
        assignment.id_category,
        assignment.position ?? athInCat.position,
      ]),
    )
    const totalSessions = await this.trainingSessionsRepository.count({
      where: { id_category: In(categoryIds), id_season },
    })
    let trainingRatio: number | null = null
    if (totalSessions > 0) {
      const attendedSessions = await this.trainingLoadsRepository
        .createQueryBuilder('load')
        .innerJoin('load.session', 'session')
        .where('load.id_user = :id_user', { id_user })
        .andWhere('session.id_category IN (:...categoryIds)', { categoryIds })
        .andWhere('session.id_season = :id_season', { id_season })
        .select('DISTINCT load.id_session', 'id_session')
        .getRawMany()
      trainingRatio = Math.min(1, attendedSessions.length / totalSessions)
    }

    const seasonMatches = await this.matchesRepository
      .createQueryBuilder('match')
      .innerJoin('match.competency', 'competency')
      .where('match.id_category IN (:...categoryIds)', { categoryIds })
      .andWhere('competency.id_season = :id_season', { id_season })
      .getMany()
    let matchRatio: number | null = null
    let contribution: ContributionResult = { score: null, warnings: [] }
    if (seasonMatches.length > 0) {
      const matchIds = seasonMatches.map((m) => m.id_match)
      const { totalMinutes } = await this.matchStatisticsRepository
        .createQueryBuilder('stat')
        .select('COALESCE(SUM(stat.minutes_played), 0)', 'totalMinutes')
        .where('stat.id_user = :id_user', { id_user })
        .andWhere('stat.id_match IN (:...matchIds)', { matchIds })
        .getRawOne()
      const availableMinutes = seasonMatches.reduce(
        (sum, match) =>
          sum + matchMinutesFor(positionByCategory.get(match.id_category)),
        0,
      )
      matchRatio = Math.min(1, Number(totalMinutes) / availableMinutes)
      contribution = await this.computeContribution(
        id_user,
        id_season,
        athInCat.position,
        cohort,
      )
    }

    const participation =
      this.progressIndexCalculatorService.computeParticipationScore(
        trainingRatio,
        matchRatio,
        contribution.score === null ? null : contribution.score / 100,
      )

    const index_value = this.progressIndexCalculatorService.computeIndex(
      {
        physical: physical.score,
        technical: technical.score,
        tactical: tactical.score,
        participation: participation.score,
      },
      profile,
    )

    const warnings = [
      ...physical.warnings,
      ...technical.warnings,
      ...(Number(profile.w_tactical) > 0 ? tactical.warnings : []),
      ...participation.warnings,
      ...contribution.warnings,
    ]

    const existing = await this.weightedProgressIndexRepository.findOne({
      where: { id_user, id_season },
    })
    const saved = await this.weightedProgressIndexRepository.save({
      ...(existing ?? {}),
      id_user,
      id_season,
      id_profile: profile.id_profile,
      physical_score: physical.score,
      technical_score: technical.score,
      tactical_score: tactical.score,
      participation_score: participation.score,
      contribution_score: contribution.score,
      index_value,
      warnings: warnings.length > 0 ? warnings : null,
    })

    return this.getById(saved.id_index)
  }

  private async computeContribution(
    id_user: number,
    id_season: number,
    position: string,
    cohort: AthletesInCategory[],
  ): Promise<ContributionResult> {
    const info = positionInfo(position)
    if (!info)
      return {
        score: null,
        warnings: [
          `La posición "${position}" no está en el catálogo de posiciones: no se calcula su contribución en partidos`,
        ],
      }
    const key = comparisonKey(info)
    const peers = cohort
      .filter((member) => {
        const memberInfo = positionInfo(member.position)
        return memberInfo !== null && comparisonKey(memberInfo) === key
      })
      .map((member) => member.id_user)
    const userIds = [...new Set([id_user, ...peers])]
    const appearances = await this.loadSeasonAppearances(userIds, id_season)
    const appearancesOf = (user: number) => appearances.get(user) ?? []
    const calculator = this.progressIndexCalculatorService

    if (info.group === ContributionGroup.ARQUERO)
      return calculator.computeGoalkeeperScore(
        calculator.computeGoalkeeperMetrics(appearancesOf(id_user)),
        userIds.map((user) =>
          calculator.computeGoalkeeperMetrics(appearancesOf(user)),
        ),
      )

    const rateOf = (user: number) =>
      calculator.computeFieldContributionRate(appearancesOf(user))
    return calculator.computeFieldContributionScore(
      rateOf(id_user),
      userIds.map(rateOf).filter((rate): rate is number => rate !== null),
    )
  }

  private async loadSeasonAppearances(
    userIds: number[],
    id_season: number,
  ): Promise<Map<number, MatchAppearance[]>> {
    const [stats, assignments] = await Promise.all([
      this.matchStatisticsRepository
        .createQueryBuilder('stat')
        .innerJoinAndSelect('stat.match', 'match')
        .innerJoin('match.competency', 'competency')
        .where('stat.id_user IN (:...userIds)', { userIds })
        .andWhere('competency.id_season = :id_season', { id_season })
        .getMany(),
      this.athletesInCategoryRepository.find({
        where: { id_user: In(userIds), id_season },
        order: { id_ath_cat: 'ASC' },
      }),
    ])
    const positionOf = new Map(
      assignments.map((assignment) => [
        `${assignment.id_user}|${assignment.id_category}`,
        assignment.position,
      ]),
    )
    const anyPosition = new Map<number, string>()
    for (const assignment of assignments)
      if (assignment.position && !anyPosition.has(assignment.id_user))
        anyPosition.set(assignment.id_user, assignment.position)

    const result = new Map<number, MatchAppearance[]>()
    for (const stat of stats) {
      const position =
        positionOf.get(`${stat.id_user}|${stat.match.id_category}`) ??
        anyPosition.get(stat.id_user)
      const list = result.get(stat.id_user) ?? []
      list.push({
        minutes: Number(stat.minutes_played),
        matchMinutes: matchMinutesFor(position),
        goals: Number(stat.goals),
        assists: Number(stat.assists),
        saves: stat.saves ?? null,
        goals_conceded: stat.goals_conceded ?? null,
      })
      result.set(stat.id_user, list)
    }
    return result
  }
}
