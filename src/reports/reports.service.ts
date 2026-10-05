import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { plainToInstance } from 'class-transformer'
import { In, Repository } from 'typeorm'
import { AthletesInCategory } from 'src/athletes_in_categories/entities/athletes_in_category.entity'
import { DevelopmentObjective } from 'src/development_objectives/entities/development-objective.entity'
import { FatigueAlert } from 'src/fatigue_alerts/entities/fatigue-alert.entity'
import { InjuryRiskAssessment } from 'src/injury_risk_assessments/entities/injury-risk-assessment.entity'
import { Injury } from 'src/injuries/entities/injury.entity'
import { Match } from 'src/matches/entities/match.entity'
import { MatchStatistic } from 'src/match_statistics/entities/match-statistic.entity'
import { PhysicalEvaluation } from 'src/physical_evaluations/entities/physical-evaluation.entity'
import { ResponseInjuryRiskAssessmentDto } from 'src/injury_risk_assessments/dto/response-injury-risk-assessment.dto'
import { ResponseFatigueAlertDto } from 'src/fatigue_alerts/dto/response-fatigue-alert.dto'
import { ResponseInjuryDto } from 'src/injuries/dto/response-injury.dto'
import { ResponseWeightedProgressIndexDto } from 'src/weighted_progress_index/dto/response-weighted-progress-index.dto'
import { ResponseTalentFlagDto } from 'src/talent_flags/dto/response-talent-flag.dto'
import { SeasonsService } from 'src/seasons/seasons.service'
import { TalentFlag } from 'src/talent_flags/entities/talent-flag.entity'
import { TechnicalEvaluation } from 'src/technical_evaluations/entities/technical-evaluation.entity'
import { TrainingLoad } from 'src/training_loads/entities/training-load.entity'
import { TrainingSession } from 'src/training_sessions/entities/training-session.entity'
import { UsersService } from 'src/users/users.service'
import { WeightedProgressIndex } from 'src/weighted_progress_index/entities/weighted-progress-index.entity'

const STANDARD_MATCH_MINUTES = 90

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(AthletesInCategory)
    private readonly athletesInCategoryRepository: Repository<AthletesInCategory>,
    @InjectRepository(PhysicalEvaluation)
    private readonly physicalEvaluationsRepository: Repository<PhysicalEvaluation>,
    @InjectRepository(TechnicalEvaluation)
    private readonly technicalEvaluationsRepository: Repository<TechnicalEvaluation>,
    @InjectRepository(DevelopmentObjective)
    private readonly developmentObjectivesRepository: Repository<DevelopmentObjective>,
    @InjectRepository(Injury)
    private readonly injuriesRepository: Repository<Injury>,
    @InjectRepository(FatigueAlert)
    private readonly fatigueAlertsRepository: Repository<FatigueAlert>,
    @InjectRepository(InjuryRiskAssessment)
    private readonly injuryRiskAssessmentsRepository: Repository<InjuryRiskAssessment>,
    @InjectRepository(TalentFlag)
    private readonly talentFlagsRepository: Repository<TalentFlag>,
    @InjectRepository(TrainingSession)
    private readonly trainingSessionsRepository: Repository<TrainingSession>,
    @InjectRepository(TrainingLoad)
    private readonly trainingLoadsRepository: Repository<TrainingLoad>,
    @InjectRepository(Match)
    private readonly matchesRepository: Repository<Match>,
    @InjectRepository(MatchStatistic)
    private readonly matchStatisticsRepository: Repository<MatchStatistic>,
    @InjectRepository(WeightedProgressIndex)
    private readonly weightedProgressIndexRepository: Repository<WeightedProgressIndex>,
    private readonly usersService: UsersService,
    private readonly seasonsService: SeasonsService,
  ) {}

  async getSeasonSummary(id_user: number, id_season: number) {
    const athlete = await this.usersService.findOneById(id_user)
    if (!athlete)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este deportista',
      })

    const season = await this.seasonsService.findOneById(id_season)
    if (!season)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta temporada',
      })

    const assignments = await this.athletesInCategoryRepository
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.category', 'category')
      .where('assignment.id_user = :id_user', { id_user })
      .andWhere('assignment.id_season = :id_season', { id_season })
      .orderBy('category.max_age', 'ASC')
      .addOrderBy('assignment.id_ath_cat', 'ASC')
      .getMany()
    const athInCat = assignments[0] ?? null
    const categoryIds = assignments.map((assignment) => assignment.id_category)

    const seasonStart = season.start_date
    const seasonEnd = season.end_date ?? new Date().toISOString().slice(0, 10)

    const [
      physicalEvaluations,
      technicalEvaluations,
      developmentObjectives,
      weightedProgressIndex,
      talentFlags,
    ] = await Promise.all([
      this.physicalEvaluationsRepository.find({
        where: { id_user, id_season },
        order: { eval_date: 'ASC' },
      }),
      this.technicalEvaluationsRepository.find({
        where: { id_user, id_season },
        order: { eval_date: 'ASC' },
      }),
      this.developmentObjectivesRepository.find({
        where: { id_user, id_season },
        order: { target_date: 'ASC' },
      }),
      this.weightedProgressIndexRepository.findOne({
        where: { id_user, id_season },
        relations: { athlete: true },
      }),
      this.talentFlagsRepository.find({
        where: { id_user, id_season },
        relations: { athlete: true },
        order: { created_at: 'DESC' },
      }),
    ])

    const injuries = await this.injuriesRepository
      .createQueryBuilder('injury')
      .where('injury.id_user = :id_user', { id_user })
      .andWhere('injury.injury_date BETWEEN :start AND :end', {
        start: seasonStart,
        end: seasonEnd,
      })
      .orderBy('injury.injury_date', 'ASC')
      .getMany()

    const fatigueAlerts = await this.fatigueAlertsRepository
      .createQueryBuilder('alert')
      .where('alert.id_user = :id_user', { id_user })
      .andWhere('alert.date BETWEEN :start AND :end', {
        start: seasonStart,
        end: seasonEnd,
      })
      .orderBy('alert.date', 'ASC')
      .getMany()

    const injuryRiskAssessments = await this.injuryRiskAssessmentsRepository
      .createQueryBuilder('assessment')
      .where('assessment.id_user = :id_user', { id_user })
      .andWhere('assessment.assessment_date BETWEEN :start AND :end', {
        start: seasonStart,
        end: seasonEnd,
      })
      .orderBy('assessment.assessment_date', 'ASC')
      .getMany()

    let trainingParticipation = {
      total_sessions: 0,
      sessions_attended: 0,
      attendance_rate: 0,
      avg_rpe: 0,
      total_session_load: 0,
    }
    let matchParticipation = {
      matches_in_season: 0,
      matches_played: 0,
      total_minutes: 0,
      goals: 0,
      assists: 0,
      yellow_cards: 0,
      red_cards: 0,
    }

    if (athInCat) {
      const totalSessions = await this.trainingSessionsRepository.count({
        where: { id_category: In(categoryIds), id_season },
      })
      const loads = await this.trainingLoadsRepository
        .createQueryBuilder('load')
        .innerJoin('load.session', 'session')
        .where('load.id_user = :id_user', { id_user })
        .andWhere('session.id_category IN (:...categoryIds)', { categoryIds })
        .andWhere('session.id_season = :id_season', { id_season })
        .getMany()
      const sessionsAttended = new Set(loads.map((l) => l.id_session)).size
      const avgRpe =
        loads.length > 0
          ? Math.round(
              (loads.reduce((sum, l) => sum + l.rpe, 0) / loads.length) * 10,
            ) / 10
          : 0
      const totalSessionLoad = loads.reduce((sum, l) => sum + l.session_load, 0)

      trainingParticipation = {
        total_sessions: totalSessions,
        sessions_attended: sessionsAttended,
        attendance_rate:
          totalSessions > 0
            ? Math.round((sessionsAttended / totalSessions) * 10000) / 100
            : 0,
        avg_rpe: avgRpe,
        total_session_load: totalSessionLoad,
      }

      const seasonMatches = await this.matchesRepository
        .createQueryBuilder('match')
        .innerJoin('match.competency', 'competency')
        .where('match.id_category IN (:...categoryIds)', { categoryIds })
        .andWhere('competency.id_season = :id_season', { id_season })
        .getMany()

      if (seasonMatches.length > 0) {
        const matchIds = seasonMatches.map((m) => m.id_match)
        const relevantStats = await this.matchStatisticsRepository.find({
          where: { id_user, id_match: In(matchIds) },
        })
        matchParticipation = {
          matches_in_season: seasonMatches.length,
          matches_played: relevantStats.length,
          total_minutes: relevantStats.reduce(
            (sum, s) => sum + s.minutes_played,
            0,
          ),
          goals: relevantStats.reduce((sum, s) => sum + s.goals, 0),
          assists: relevantStats.reduce((sum, s) => sum + s.assists, 0),
          yellow_cards: relevantStats.reduce(
            (sum, s) => sum + s.yellow_cards,
            0,
          ),
          red_cards: relevantStats.reduce((sum, s) => sum + s.red_cards, 0),
        }
      }
    }

    return {
      status: 'Success',
      mensaje: 'Resumen de temporada generado con éxito',
      summary: {
        athlete: {
          id_user: athlete.id_user,
          name: athlete.name,
          lastname: athlete.lastname,
          position: athInCat?.position ?? null,
          category: athInCat?.category?.name ?? null,
          categories: assignments.map((assignment) => ({
            id_category: assignment.id_category,
            name: assignment.category?.name ?? null,
            position: assignment.position ?? null,
          })),
        },
        season: {
          id_season: season.id_season,
          name: season.name,
          start_date: season.start_date,
          end_date: season.end_date,
          status: season.status,
        },
        physical_evaluations: physicalEvaluations,
        technical_evaluations: technicalEvaluations,
        development_objectives: developmentObjectives,
        injuries: plainToInstance(ResponseInjuryDto, injuries, {
          excludeExtraneousValues: true,
        }),
        fatigue_alerts: plainToInstance(
          ResponseFatigueAlertDto,
          fatigueAlerts,
          {
            excludeExtraneousValues: true,
          },
        ),
        injury_risk_assessments: plainToInstance(
          ResponseInjuryRiskAssessmentDto,
          injuryRiskAssessments,
          { excludeExtraneousValues: true },
        ),
        talent_flags: plainToInstance(ResponseTalentFlagDto, talentFlags, {
          excludeExtraneousValues: true,
        }),
        training_participation: trainingParticipation,
        match_participation: matchParticipation,
        weighted_progress_index: weightedProgressIndex
          ? plainToInstance(
              ResponseWeightedProgressIndexDto,
              weightedProgressIndex,
              { excludeExtraneousValues: true },
            )
          : null,
      },
    }
  }

  async getSeasonComparison(id_user: number) {
    const athlete = await this.usersService.findOneById(id_user)
    if (!athlete)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este deportista',
      })

    const indices = await this.weightedProgressIndexRepository
      .createQueryBuilder('index')
      .leftJoinAndSelect('index.season', 'season')
      .where('index.id_user = :id_user', { id_user })
      .orderBy('season.start_date', 'ASC')
      .getMany()

    if (indices.length === 0)
      throw new NotFoundException({
        status: 'Error',
        mensaje:
          'No hay índices de progreso calculados para este deportista en ninguna temporada. Ejecuta POST /progress-index/recalculate/:id_user primero.',
      })

    return {
      status: 'Success',
      mensaje: 'Comparación entre temporadas generada con éxito',
      athlete: {
        id_user: athlete.id_user,
        name: athlete.name,
        lastname: athlete.lastname,
      },
      comparison: indices.map((index) => ({
        id_season: index.id_season,
        season_name: index.season.name,
        start_date: index.season.start_date,
        end_date: index.season.end_date,
        physical_score: index.physical_score,
        technical_score: index.technical_score,
        participation_score: index.participation_score,
        index_value: index.index_value,
      })),
    }
  }
}
