import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { plainToInstance } from 'class-transformer'
import { Repository } from 'typeorm'
import { AthletesInCategory } from 'src/athletes_in_categories/entities/athletes_in_category.entity'
import { Category } from 'src/categories/entities/category.entity'
import { Match } from 'src/matches/entities/match.entity'
import { MatchStatistic } from 'src/match_statistics/entities/match-statistic.entity'
import { PhysicalEvaluation } from 'src/physical_evaluations/entities/physical-evaluation.entity'
import { PositionWeightProfilesService } from 'src/position_weight_profiles/position-weight-profiles.service'
import { SeasonsService } from 'src/seasons/seasons.service'
import { TechnicalEvaluation } from 'src/technical_evaluations/entities/technical-evaluation.entity'
import { TrainingLoad } from 'src/training_loads/entities/training-load.entity'
import { TrainingSession } from 'src/training_sessions/entities/training-session.entity'
import { UsersService } from 'src/users/users.service'
import { extractErrorMessage } from 'src/common/utils/error-message.util'
import { FilterWeightedProgressIndexDto } from './dto/filter-weighted-progress-index.dto'
import { ResponseWeightedProgressIndexDto } from './dto/response-weighted-progress-index.dto'
import { WeightedProgressIndex } from './entities/weighted-progress-index.entity'
import { ProgressIndexCalculatorService } from './progress-index-calculator.service'

const STANDARD_MATCH_MINUTES = 90

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

    const athInCat = await this.athletesInCategoryRepository.findOne({
      where: { id_user, id_season },
    })
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

    // --- Technical score: average of the season's evaluations, scaled to 0-100 ---
    const technicalEvaluations = await this.technicalEvaluationsRepository.find(
      {
        where: { id_user, id_season },
      },
    )
    const technical = this.progressIndexCalculatorService.computeTechnicalScore(
      technicalEvaluations.map((e) => Number(e.score)),
    )

    // --- Participation score: training attendance + match-minutes ratios ---
    const totalSessions = await this.trainingSessionsRepository.count({
      where: { id_category: athInCat.id_category, id_season },
    })
    let trainingRatio: number | null = null
    if (totalSessions > 0) {
      const attendedSessions = await this.trainingLoadsRepository
        .createQueryBuilder('load')
        .innerJoin('load.session', 'session')
        .where('load.id_user = :id_user', { id_user })
        .andWhere('session.id_category = :id_category', {
          id_category: athInCat.id_category,
        })
        .andWhere('session.id_season = :id_season', { id_season })
        .select('DISTINCT load.id_session', 'id_session')
        .getRawMany()
      trainingRatio = Math.min(1, attendedSessions.length / totalSessions)
    }

    const seasonMatches = await this.matchesRepository
      .createQueryBuilder('match')
      .innerJoin('match.competency', 'competency')
      .where('match.id_category = :id_category', {
        id_category: athInCat.id_category,
      })
      .andWhere('competency.id_season = :id_season', { id_season })
      .getMany()
    let matchRatio: number | null = null
    if (seasonMatches.length > 0) {
      const matchIds = seasonMatches.map((m) => m.id_match)
      const { totalMinutes } = await this.matchStatisticsRepository
        .createQueryBuilder('stat')
        .select('COALESCE(SUM(stat.minutes_played), 0)', 'totalMinutes')
        .where('stat.id_user = :id_user', { id_user })
        .andWhere('stat.id_match IN (:...matchIds)', { matchIds })
        .getRawOne()
      matchRatio = Math.min(
        1,
        Number(totalMinutes) / (seasonMatches.length * STANDARD_MATCH_MINUTES),
      )
    }

    const participation =
      this.progressIndexCalculatorService.computeParticipationScore(
        trainingRatio,
        matchRatio,
      )

    const index_value = this.progressIndexCalculatorService.computeIndex(
      physical.score,
      technical.score,
      participation.score,
      profile,
    )

    const warnings = [
      ...physical.warnings,
      ...technical.warnings,
      ...participation.warnings,
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
      participation_score: participation.score,
      index_value,
      warnings: warnings.length > 0 ? warnings : null,
    })

    return this.getById(saved.id_index)
  }
}
