import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { plainToInstance } from 'class-transformer'
import { Between, In, IsNull, Not, Repository } from 'typeorm'
import { AthletesInCategory } from 'src/athletes_in_categories/entities/athletes_in_category.entity'
import { pickBaseAssignments } from 'src/common/utils/sport-age.util'
import {
  addDaysToKey,
  daysBetween,
  rawDateToKey,
  todayKey,
} from 'src/common/utils/date.util'
import { extractErrorMessage } from 'src/common/utils/error-message.util'
import { percentage } from 'src/common/utils/ratio.util'
import { LoadRecordsService } from 'src/fatigue_alerts/load-records.service'
import { Injury } from 'src/injuries/entities/injury.entity'
import {
  InjuryRiskAssessment,
  InjuryRiskAssessmentMethod,
} from 'src/injury_risk_assessments/entities/injury-risk-assessment.entity'
import { MatchStatistic } from 'src/match_statistics/entities/match-statistic.entity'
import { Season } from 'src/seasons/entities/season.entity'
import { TrainingLoad } from 'src/training_loads/entities/training-load.entity'
import { User } from 'src/users/entities/user.entity'
import { UsersService } from 'src/users/users.service'
import { FilterAthleteDailyFeaturesDto } from './dto/filter-athlete-daily-features.dto'
import { ResponseAthleteDailyFeaturesDto } from './dto/response-athlete-daily-features.dto'
import {
  AthleteDailyFeatures,
  FEATURE_VERSION,
  FeatureLabelQuality,
} from './entities/athlete-daily-features.entity'
import {
  EWMA_WINDOW_DAYS,
  FeatureCalculatorService,
  LABEL_WINDOW_DAYS,
} from './feature-calculator.service'
import { FeatureExportService } from './feature-export.service'

export const MAX_RANGE_DAYS = 730
const UPSERT_CHUNK_SIZE = 500

interface AssignmentInfo {
  id_category: number
  position: string | null
}

export interface FailedAthlete {
  id_user: number
  mensaje: string
}

@Injectable()
export class MlFeaturesService {
  private readonly logger = new Logger(MlFeaturesService.name)

  constructor(
    @InjectRepository(AthleteDailyFeatures)
    private readonly featuresRepository: Repository<AthleteDailyFeatures>,
    @InjectRepository(Injury)
    private readonly injuriesRepository: Repository<Injury>,
    @InjectRepository(InjuryRiskAssessment)
    private readonly assessmentsRepository: Repository<InjuryRiskAssessment>,
    @InjectRepository(AthletesInCategory)
    private readonly athletesInCategoryRepository: Repository<AthletesInCategory>,
    @InjectRepository(Season)
    private readonly seasonsRepository: Repository<Season>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(TrainingLoad)
    private readonly trainingLoadsRepository: Repository<TrainingLoad>,
    @InjectRepository(MatchStatistic)
    private readonly matchStatisticsRepository: Repository<MatchStatistic>,
    private readonly usersService: UsersService,
    private readonly loadRecordsService: LoadRecordsService,
    private readonly featureCalculatorService: FeatureCalculatorService,
    private readonly featureExportService: FeatureExportService,
    private readonly configService: ConfigService,
  ) {}

  private validateRange(from: string, to: string) {
    if (from > to)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'La fecha inicial no puede ser posterior a la final',
      })
    if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS)
      throw new BadRequestException({
        status: 'Error',
        mensaje: `El rango no puede superar ${MAX_RANGE_DAYS} días`,
      })
  }

  async buildSnapshots(from: string, to: string) {
    const athleteIds = await this.usersService.findAllAthleteIds()
    if (athleteIds.length === 0)
      return { athletes: 0, snapshots: 0, failed: [] as FailedAthlete[] }

    const [seasons, athletes, assignments] = await Promise.all([
      this.seasonsRepository.find(),
      this.usersRepository.find({
        where: { id_user: In(athleteIds) },
        select: { id_user: true, birth_date: true },
      }),
      this.athletesInCategoryRepository.find({
        where: { id_user: In(athleteIds), id_season: Not(IsNull()) },
        relations: { category: true },
        select: {
          id_ath_cat: true,
          id_user: true,
          id_season: true,
          id_category: true,
          position: true,
          category: { id_category: true, max_age: true },
        },
      }),
    ])
    const birthDateByUser = new Map(
      athletes.map((a) => [a.id_user, a.birth_date ?? null]),
    )
    const baseAssignments = pickBaseAssignments(
      assignments,
      (assignment) => Number(assignment.category?.max_age ?? Infinity),
      (assignment) => `${assignment.id_user}-${assignment.id_season}`,
    )
    const assignmentByKey = new Map<string, AssignmentInfo>(
      [...baseAssignments.values()].map((a) => [
        `${a.id_user}-${a.id_season}`,
        { id_category: a.id_category, position: a.position ?? null },
      ]),
    )

    let snapshots = 0
    const failed: FailedAthlete[] = []
    for (const id_user of athleteIds) {
      try {
        snapshots += await this.buildAthleteSnapshots(
          id_user,
          birthDateByUser.get(id_user) ?? null,
          from,
          to,
          seasons,
          assignmentByKey,
        )
      } catch (error) {
        const mensaje = extractErrorMessage(error)
        failed.push({ id_user, mensaje })
        this.logger.error(
          `Error al generar el snapshot de variables del deportista ${id_user}: ${mensaje}`,
        )
      }
    }
    return { athletes: athleteIds.length, snapshots, failed }
  }

  private async buildAthleteSnapshots(
    id_user: number,
    birth_date: string | null,
    from: string,
    to: string,
    seasons: Season[],
    assignmentByKey: Map<string, AssignmentInfo>,
  ): Promise<number> {
    const [records, matchAppearances, injuries, assessments] =
      await Promise.all([
        this.loadRecordsService.getRecords(
          id_user,
          addDaysToKey(from, -(EWMA_WINDOW_DAYS - 1)),
          to,
        ),
        this.loadRecordsService.getMatchAppearances(
          id_user,
          addDaysToKey(from, -6),
          to,
        ),
        this.injuriesRepository.find({
          where: { id_user },
          select: { injury_date: true, recovery_date: true, mechanism: true },
        }),
        this.assessmentsRepository.find({
          where: {
            id_user,
            method: InjuryRiskAssessmentMethod.RULES,
            assessment_date: Between(from, to),
          },
          select: { assessment_date: true, risk_level: true },
        }),
      ])
    const riskLevelByDate = new Map(
      assessments.map((a) => [a.assessment_date, a.risk_level]),
    )

    const rows: Partial<AthleteDailyFeatures>[] = []
    for (let date = from; date <= to; date = addDaysToKey(date, 1)) {
      const season = this.featureCalculatorService.findSeasonForDate(
        seasons,
        date,
      )
      const assignment = season
        ? assignmentByKey.get(`${id_user}-${season.id_season}`)
        : undefined
      const features = this.featureCalculatorService.computeFeatures({
        date,
        records,
        matchAppearances,
        injuries,
        context: {
          id_season: season?.id_season ?? null,
          id_category: assignment?.id_category ?? null,
          position: assignment?.position ?? null,
          birth_date,
          rules_risk_level: riskLevelByDate.get(date) ?? null,
        },
      })
      rows.push({ id_user, ...features, feature_version: FEATURE_VERSION })
    }

    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE)
      await this.featuresRepository.upsert(
        rows.slice(i, i + UPSERT_CHUNK_SIZE),
        ['id_user', 'date'],
      )
    return rows.length
  }

  async labelRows(options: {
    from?: string
    to?: string
    onlyUnlabeled: boolean
  }) {
    const maxMatureDate = addDaysToKey(todayKey(), -LABEL_WINDOW_DAYS)
    const to =
      options.to && options.to < maxMatureDate ? options.to : maxMatureDate

    const usersQuery = this.featuresRepository
      .createQueryBuilder('features')
      .select('DISTINCT features.id_user', 'id_user')
      .where('features.date <= :to', { to })
    if (options.from)
      usersQuery.andWhere('features.date >= :from', { from: options.from })
    if (options.onlyUnlabeled)
      usersQuery.andWhere('features.label_quality IN (:...qualities)', {
        qualities: [
          FeatureLabelQuality.PENDING,
          FeatureLabelQuality.UNKNOWN_MECHANISM,
        ],
      })
    const userRows: { id_user: number }[] = await usersQuery.getRawMany()

    const counts = { processed: 0, positives: 0, negatives: 0, unknown: 0 }
    const failed: FailedAthlete[] = []
    for (const { id_user } of userRows) {
      try {
        const result = await this.labelAthleteRows(
          Number(id_user),
          options.from,
          to,
          options.onlyUnlabeled,
        )
        counts.processed += result.processed
        counts.positives += result.positives
        counts.negatives += result.negatives
        counts.unknown += result.unknown
      } catch (error) {
        const mensaje = extractErrorMessage(error)
        failed.push({ id_user: Number(id_user), mensaje })
        this.logger.error(
          `Error al etiquetar los snapshots del deportista ${id_user}: ${mensaje}`,
        )
      }
    }
    return {
      processed: counts.processed,
      labeled_positive: counts.positives,
      labeled_negative: counts.negatives,
      unknown_mechanism: counts.unknown,
      failed,
    }
  }

  private async labelAthleteRows(
    id_user: number,
    from: string | undefined,
    to: string,
    onlyUnlabeled: boolean,
  ) {
    const query = this.featuresRepository
      .createQueryBuilder('features')
      .where('features.id_user = :id_user', { id_user })
      .andWhere('features.date <= :to', { to })
    if (from) query.andWhere('features.date >= :from', { from })
    if (onlyUnlabeled)
      query.andWhere('features.label_quality IN (:...qualities)', {
        qualities: [
          FeatureLabelQuality.PENDING,
          FeatureLabelQuality.UNKNOWN_MECHANISM,
        ],
      })
    const [rows, injuries] = await Promise.all([
      query.getMany(),
      this.injuriesRepository.find({
        where: { id_user },
        select: { injury_date: true, mechanism: true },
      }),
    ])

    const result = { processed: 0, positives: 0, negatives: 0, unknown: 0 }
    const now = new Date()
    for (const row of rows) {
      const label = this.featureCalculatorService.computeLabel(
        row.date,
        injuries,
      )
      row.label_injury_7d = label.label_injury_7d
      row.label_quality = label.label_quality
      row.labeled_at =
        label.label_quality === FeatureLabelQuality.LABELED ? now : null
      result.processed++
      if (label.label_injury_7d === true) result.positives++
      else if (label.label_injury_7d === false) result.negatives++
      else result.unknown++
    }
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE)
      await this.featuresRepository.save(rows.slice(i, i + UPSERT_CHUNK_SIZE))
    return result
  }

  async backfill(from: string, to: string) {
    this.validateRange(from, to)
    if (to > todayKey())
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No se pueden generar snapshots de fechas futuras',
      })
    const snapshot = await this.buildSnapshots(from, to)
    const labels = await this.labelRows({ from, to, onlyUnlabeled: false })
    return {
      status: 'Success',
      mensaje: `Reconstrucción de snapshots completada: ${snapshot.snapshots} snapshots de ${snapshot.athletes} deportistas`,
      snapshot,
      labels,
    }
  }

  async relabel(from: string, to: string) {
    this.validateRange(from, to)
    const labels = await this.labelRows({ from, to, onlyUnlabeled: false })
    return {
      status: 'Success',
      mensaje: `Re-etiquetado completado: ${labels.processed} snapshots procesados (solo se etiquetan los días con 7 días cumplidos)`,
      labels,
    }
  }

  async findAll(filters: FilterAthleteDailyFeaturesDto) {
    const { page = 1, limit = 10, id_user, from, to, label_quality } = filters
    const query = this.featuresRepository
      .createQueryBuilder('features')
      .orderBy('features.date', 'DESC')
      .addOrderBy('features.id_user', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)

    if (id_user) query.andWhere('features.id_user = :id_user', { id_user })
    if (from) query.andWhere('features.date >= :from', { from })
    if (to) query.andWhere('features.date <= :to', { to })
    if (label_quality)
      query.andWhere('features.label_quality = :label_quality', {
        label_quality,
      })

    const [features, total] = await query.getManyAndCount()
    if (!total)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay snapshots de variables registrados',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de snapshots de variables exitosa',
      features: plainToInstance(ResponseAthleteDailyFeaturesDto, features, {
        excludeExtraneousValues: true,
      }),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async exportCsv(from: string, to: string): Promise<string> {
    this.validateRange(from, to)
    const salt = this.configService.get<string>('ML_EXPORT_SALT')
    if (!salt)
      throw new InternalServerErrorException({
        status: 'Error',
        mensaje:
          'Falta configurar ML_EXPORT_SALT en las variables de entorno; no se exporta el dataset sin seudonimizar',
      })
    const rows = await this.featuresRepository.find({
      where: { date: Between(from, to) },
      order: { date: 'ASC', id_user: 'ASC' },
    })
    return this.featureExportService.toCsv(
      rows as unknown as (Record<string, unknown> & { id_user: number })[],
      salt,
    )
  }

  async computeDataQuality(fromInput?: string, toInput?: string) {
    const warnings: string[] = []
    const span = (await this.featuresRepository
      .createQueryBuilder('features')
      .select("TO_CHAR(MIN(features.date), 'YYYY-MM-DD')", 'min_date')
      .addSelect("TO_CHAR(MAX(features.date), 'YYYY-MM-DD')", 'max_date')
      .getRawOne<{ min_date: unknown; max_date: unknown }>()) ?? {
      min_date: null,
      max_date: null,
    }
    const to = toInput ?? rawDateToKey(span.max_date) ?? todayKey()
    const from =
      fromInput ?? rawDateToKey(span.min_date) ?? addDaysToKey(to, -27)
    if (from > to)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'La fecha inicial no puede ser posterior a la final',
      })

    const snapshotStats = (await this.featuresRepository
      .createQueryBuilder('features')
      .select('COUNT(*)', 'snapshot_rows')
      .addSelect('COUNT(DISTINCT features.date)', 'snapshot_days')
      .addSelect('COUNT(DISTINCT features.id_user)', 'athletes_with_data')
      .where('features.date BETWEEN :from AND :to', { from, to })
      .getRawOne<{
        snapshot_rows: string
        snapshot_days: string
        athletes_with_data: string
      }>()) ?? {
      snapshot_rows: '0',
      snapshot_days: '0',
      athletes_with_data: '0',
    }
    const labelRows: { label_quality: string; total: string }[] =
      await this.featuresRepository
        .createQueryBuilder('features')
        .select('features.label_quality', 'label_quality')
        .addSelect('COUNT(*)', 'total')
        .where('features.date BETWEEN :from AND :to', { from, to })
        .groupBy('features.label_quality')
        .getRawMany()
    const labels: Record<string, number> = {}
    for (const quality of Object.values(FeatureLabelQuality))
      labels[quality] = 0
    for (const row of labelRows) labels[row.label_quality] = Number(row.total)
    if (Number(snapshotStats.snapshot_rows) === 0)
      warnings.push('No hay snapshots de variables en el periodo')

    const injuryStats = (await this.injuriesRepository
      .createQueryBuilder('injury')
      .select('COUNT(*)', 'total')
      .addSelect(
        'COUNT(*) FILTER (WHERE injury.mechanism IS NULL)',
        'without_mechanism',
      )
      .where('injury.injury_date BETWEEN :from AND :to', { from, to })
      .getRawOne<{ total: string; without_mechanism: string }>()) ?? {
      total: '0',
      without_mechanism: '0',
    }
    const injuriesTotal = Number(injuryStats.total)
    const injuriesWithoutMechanism = Number(injuryStats.without_mechanism)
    if (injuriesTotal === 0)
      warnings.push(
        'No hay lesiones en el periodo: no se calcula el porcentaje sin mecanismo',
      )

    const matchStats = (await this.matchStatisticsRepository
      .createQueryBuilder('stat')
      .innerJoin('stat.match', 'match')
      .select('COUNT(*)', 'total')
      .addSelect('COUNT(*) FILTER (WHERE stat.rpe IS NULL)', 'without_rpe')
      .where('match.date BETWEEN :from AND :to', { from, to })
      .getRawOne<{ total: string; without_rpe: string }>()) ?? {
      total: '0',
      without_rpe: '0',
    }
    const matchesTotal = Number(matchStats.total)
    const matchesWithoutRpe = Number(matchStats.without_rpe)
    if (matchesTotal === 0)
      warnings.push(
        'No hay estadísticas de partido en el periodo: no se calcula el porcentaje sin RPE',
      )

    const athleteIds = await this.usersService.findAllAthleteIds()
    const periodDays = daysBetween(from, to) + 1
    const loadDaysByUser = await this.countLoadDaysByUser(athleteIds, from, to)
    const perAthlete = athleteIds.map((id_user) => {
      const days_with_load = loadDaysByUser.get(id_user) ?? 0
      return {
        id_user,
        days_with_load,
        days_without_load_pct: percentage(
          periodDays - days_with_load,
          periodDays,
        ),
      }
    })
    const pcts = perAthlete
      .map((a) => a.days_without_load_pct)
      .filter((p): p is number => p !== null)
    if (athleteIds.length === 0) warnings.push('No hay deportistas registrados')

    return {
      period: { from, to, days: periodDays },
      snapshots: {
        rows: Number(snapshotStats.snapshot_rows),
        days_with_snapshot: Number(snapshotStats.snapshot_days),
        athletes_with_data: Number(snapshotStats.athletes_with_data),
        labels,
      },
      injuries: {
        total: injuriesTotal,
        without_mechanism: injuriesWithoutMechanism,
        without_mechanism_pct: percentage(
          injuriesWithoutMechanism,
          injuriesTotal,
        ),
      },
      matches: {
        total: matchesTotal,
        without_rpe: matchesWithoutRpe,
        without_rpe_pct: percentage(matchesWithoutRpe, matchesTotal),
      },
      load_days: {
        avg_days_without_load_pct:
          pcts.length > 0
            ? Math.round(
                (pcts.reduce((sum, p) => sum + p, 0) / pcts.length) * 100,
              ) / 100
            : null,
        per_athlete: perAthlete,
      },
      warnings,
    }
  }

  async getDataQuality(from?: string, to?: string) {
    return {
      status: 'Success',
      mensaje: 'Consulta de calidad de datos exitosa',
      data_quality: await this.computeDataQuality(from, to),
    }
  }

  private async countLoadDaysByUser(
    athleteIds: number[],
    from: string,
    to: string,
  ): Promise<Map<number, number>> {
    if (athleteIds.length === 0) return new Map()
    const [trainingDays, matchDays] = await Promise.all([
      this.trainingLoadsRepository
        .createQueryBuilder('load')
        .innerJoin('load.session', 'session')
        .select('load.id_user', 'id_user')
        .addSelect("TO_CHAR(session.date, 'YYYY-MM-DD')", 'date')
        .distinct(true)
        .where('load.id_user IN (:...athleteIds)', { athleteIds })
        .andWhere('session.date BETWEEN :from AND :to', { from, to })
        .getRawMany<{ id_user: number; date: unknown }>(),
      this.matchStatisticsRepository
        .createQueryBuilder('stat')
        .innerJoin('stat.match', 'match')
        .select('stat.id_user', 'id_user')
        .addSelect("TO_CHAR(match.date, 'YYYY-MM-DD')", 'date')
        .distinct(true)
        .where('stat.id_user IN (:...athleteIds)', { athleteIds })
        .andWhere('stat.rpe IS NOT NULL')
        .andWhere('match.date BETWEEN :from AND :to', { from, to })
        .getRawMany<{ id_user: number; date: unknown }>(),
    ])
    const datesByUser = new Map<number, Set<string>>()
    for (const row of [...trainingDays, ...matchDays]) {
      const id_user = Number(row.id_user)
      const date = rawDateToKey(row.date)
      if (!date) continue
      const dates = datesByUser.get(id_user) ?? new Set<string>()
      dates.add(date)
      datesByUser.set(id_user, dates)
    }
    return new Map(
      [...datesByUser.entries()].map(([id_user, dates]) => [
        id_user,
        dates.size,
      ]),
    )
  }
}
