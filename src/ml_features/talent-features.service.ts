import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Not, Repository } from 'typeorm'
import { AthletesInCategory } from 'src/athletes_in_categories/entities/athletes_in_category.entity'
import { Category } from 'src/categories/entities/category.entity'
import { todayKey } from 'src/common/utils/date.util'
import { Injury, InjurySeverity } from 'src/injuries/entities/injury.entity'
import { Season } from 'src/seasons/entities/season.entity'
import {
  TalentFlag,
  TalentFlagSource,
} from 'src/talent_flags/entities/talent-flag.entity'
import { WeightedProgressIndex } from 'src/weighted_progress_index/entities/weighted-progress-index.entity'
import {
  AthleteSeasonFeatures,
  TalentLabelQuality,
} from './entities/athlete-season-features.entity'
import { TalentFeatureCalculatorService } from './talent-feature-calculator.service'

export interface TalentDatasetSummary {
  rows: number
  labeled: number
  promoted: number
  pending: number
  excluded: number
  removed: number
}

@Injectable()
export class TalentFeaturesService {
  private readonly logger = new Logger(TalentFeaturesService.name)

  constructor(
    @InjectRepository(AthleteSeasonFeatures)
    private readonly seasonFeaturesRepository: Repository<AthleteSeasonFeatures>,
    @InjectRepository(Season)
    private readonly seasonsRepository: Repository<Season>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    @InjectRepository(AthletesInCategory)
    private readonly athletesInCategoryRepository: Repository<AthletesInCategory>,
    @InjectRepository(WeightedProgressIndex)
    private readonly weightedProgressIndexRepository: Repository<WeightedProgressIndex>,
    @InjectRepository(Injury)
    private readonly injuriesRepository: Repository<Injury>,
    @InjectRepository(TalentFlag)
    private readonly talentFlagsRepository: Repository<TalentFlag>,
    private readonly talentFeatureCalculatorService: TalentFeatureCalculatorService,
  ) {}

  async rebuild(): Promise<TalentDatasetSummary> {
    const [seasons, categories, assignments, indices, injuries, flags] =
      await Promise.all([
        this.seasonsRepository.find(),
        this.categoriesRepository.find(),
        this.athletesInCategoryRepository
          .createQueryBuilder('assignment')
          .leftJoin('assignment.user', 'user')
          .addSelect(['user.id_user', 'user.birth_date'])
          .where('assignment.id_season IS NOT NULL')
          .getMany(),
        this.weightedProgressIndexRepository.find({
          relations: { profile: true },
        }),
        this.injuriesRepository.find({
          select: { id_user: true, injury_date: true, severity: true },
        }),
        this.talentFlagsRepository.find({
          select: { id_user: true, id_season: true },
          where: { source: TalentFlagSource.RULES },
        }),
      ])

    const rows = this.talentFeatureCalculatorService.buildRows({
      seasons: seasons.map((season) => ({
        id_season: season.id_season,
        start_date: season.start_date,
        end_date: season.end_date ?? null,
      })),
      categories: categories.map((category) => ({
        id_category: category.id_category,
        min_age: Number(category.min_age),
        max_age: Number(category.max_age),
      })),
      assignments: assignments.map((assignment) => ({
        id_ath_cat: assignment.id_ath_cat,
        id_user: assignment.id_user,
        id_season: Number(assignment.id_season),
        id_category: assignment.id_category,
        position: assignment.position ?? null,
        birth_date: assignment.user?.birth_date ?? null,
      })),
      indices: indices.map((index) => ({
        id_user: index.id_user,
        id_season: index.id_season,
        index_value: Number(index.index_value),
        physical_score: Number(index.physical_score),
        technical_score: Number(index.technical_score),
        tactical_score:
          Number(index.profile?.w_tactical ?? 0) > 0
            ? Number(index.tactical_score)
            : null,
        participation_score: Number(index.participation_score),
        contribution_score:
          index.contribution_score === null ||
          index.contribution_score === undefined
            ? null
            : Number(index.contribution_score),
      })),
      injuries: injuries.map((injury) => ({
        id_user: injury.id_user,
        injury_date: injury.injury_date,
        severe: injury.severity === InjurySeverity.SEVERA,
      })),
      rulesFlagged: flags,
      today: todayKey(),
    })

    if (rows.length > 0)
      await this.seasonFeaturesRepository.upsert(rows, ['id_user', 'id_season'])

    const keep = new Set(rows.map((row) => `${row.id_user}:${row.id_season}`))
    const existing = await this.seasonFeaturesRepository.find({
      select: { id_feature: true, id_user: true, id_season: true },
    })
    const stale = existing
      .filter((row) => !keep.has(`${row.id_user}:${row.id_season}`))
      .map((row) => row.id_feature)
    if (stale.length > 0)
      await this.seasonFeaturesRepository.delete({ id_feature: In(stale) })

    const summary: TalentDatasetSummary = {
      rows: rows.length,
      labeled: rows.filter(
        (row) => row.label_quality === TalentLabelQuality.LABELED,
      ).length,
      promoted: rows.filter((row) => row.label_promoted === true).length,
      pending: rows.filter(
        (row) => row.label_quality === TalentLabelQuality.PENDING,
      ).length,
      excluded: rows.filter(
        (row) => row.label_quality === TalentLabelQuality.EXCLUDED,
      ).length,
      removed: stale.length,
    }
    this.logger.log(
      `Dataset de talento: ${summary.rows} filas, ${summary.labeled} etiquetadas (${summary.promoted} ascensos), ${summary.pending} pendientes`,
    )
    return summary
  }

  async rebuildResponse() {
    const summary = await this.rebuild()
    return {
      status: 'Success',
      mensaje: `Dataset de talento reconstruido: ${summary.rows} filas, ${summary.labeled} etiquetadas y ${summary.promoted} ascensos`,
      ...summary,
    }
  }

  async findBySeason(id_season?: number) {
    const rows = await this.seasonFeaturesRepository.find({
      where: id_season ? { id_season } : { id_season: Not(IsNull()) },
      order: { season_start: 'DESC', id_user: 'ASC' },
    })
    return {
      status: 'Success',
      mensaje: `Consulta del dataset de talento: ${rows.length} filas`,
      rows,
    }
  }
}
