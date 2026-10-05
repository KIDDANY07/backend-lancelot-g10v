import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AthletesInCategory } from 'src/athletes_in_categories/entities/athletes_in_category.entity'
import { pickBaseAssignments } from 'src/common/utils/sport-age.util'
import { Category } from 'src/categories/entities/category.entity'
import { ScopedConfigCache } from 'src/common/scoped_config/scoped-config'
import { extractErrorMessage } from 'src/common/utils/error-message.util'
import { Injury, InjurySeverity } from 'src/injuries/entities/injury.entity'
import { SeasonsService } from 'src/seasons/seasons.service'
import { TalentRuleConfigService } from 'src/talent_rule_config/talent-rule-config.service'
import { WeightedProgressIndex } from 'src/weighted_progress_index/entities/weighted-progress-index.entity'
import { ProgressIndexCalculatorService } from 'src/weighted_progress_index/progress-index-calculator.service'
import { WeightedProgressIndexService } from 'src/weighted_progress_index/weighted-progress-index.service'
import {
  TalentFlag,
  TalentFlagSource,
  TalentFlagStatus,
} from './entities/talent-flag.entity'
import { TalentDetectionRulesService } from './talent-detection-rules.service'

@Injectable()
export class TalentDetectionService {
  private readonly logger = new Logger(TalentDetectionService.name)

  constructor(
    @InjectRepository(TalentFlag)
    private readonly talentFlagsRepository: Repository<TalentFlag>,
    @InjectRepository(WeightedProgressIndex)
    private readonly weightedProgressIndexRepository: Repository<WeightedProgressIndex>,
    @InjectRepository(AthletesInCategory)
    private readonly athletesInCategoryRepository: Repository<AthletesInCategory>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    @InjectRepository(Injury)
    private readonly injuriesRepository: Repository<Injury>,
    private readonly seasonsService: SeasonsService,
    private readonly weightedProgressIndexService: WeightedProgressIndexService,
    private readonly progressIndexCalculatorService: ProgressIndexCalculatorService,
    private readonly talentRuleConfigService: TalentRuleConfigService,
    private readonly talentDetectionRulesService: TalentDetectionRulesService,
  ) {}

  async detectForSeason(id_season: number) {
    const season = await this.seasonsService.findOneById(id_season)
    if (!season)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta temporada',
      })

    const recalculation =
      await this.weightedProgressIndexService.recalculateForSeason(id_season)

    const today = new Date().toISOString().slice(0, 10)
    const seasonEnd = season.end_date ?? today
    const referenceDate = new Date(`${seasonEnd}T00:00:00Z`)

    const [indices, assignments, categories, previousSeason, existingFlags] =
      await Promise.all([
        this.weightedProgressIndexRepository.find({ where: { id_season } }),
        this.athletesInCategoryRepository
          .createQueryBuilder('assignment')
          .leftJoin('assignment.user', 'user')
          .addSelect(['user.id_user', 'user.birth_date'])
          .where('assignment.id_season = :id_season', { id_season })
          .getMany(),
        this.categoriesRepository.find(),
        this.seasonsService.findPrevious(season),
        this.talentFlagsRepository.find({
          where: { id_season, source: TalentFlagSource.RULES },
        }),
      ])

    const previousIndexByUser = new Map<number, number>()
    if (previousSeason) {
      const previousIndices = await this.weightedProgressIndexRepository.find({
        where: { id_season: previousSeason.id_season },
      })
      for (const index of previousIndices)
        previousIndexByUser.set(index.id_user, Number(index.index_value))
    }

    const severeInjuries: { id_user: number }[] = await this.injuriesRepository
      .createQueryBuilder('injury')
      .select('DISTINCT injury.id_user', 'id_user')
      .where('injury.severity = :severity', {
        severity: InjurySeverity.SEVERA,
      })
      .andWhere('injury.injury_date >= :start', { start: season.start_date })
      .andWhere('injury.injury_date <= :end', { end: seasonEnd })
      .getRawMany()
    const severeInjuryUsers = new Set(
      severeInjuries.map((row) => Number(row.id_user)),
    )

    const existingFlagByUser = new Map(existingFlags.map((f) => [f.id_user, f]))
    const categoryInfos = categories.map((c) => ({
      id_category: c.id_category,
      name: c.name,
      min_age: Number(c.min_age),
      max_age: Number(c.max_age),
    }))
    const categoryById = new Map(categoryInfos.map((c) => [c.id_category, c]))
    const assignmentByUser = pickBaseAssignments(
      assignments,
      (assignment) =>
        categoryById.get(assignment.id_category)?.max_age ?? Infinity,
    )

    const cohortValues = new Map<number, number[]>()
    for (const index of indices) {
      const assignment = assignmentByUser.get(index.id_user)
      if (!assignment) continue
      const values = cohortValues.get(assignment.id_category) ?? []
      values.push(Number(index.index_value))
      cohortValues.set(assignment.id_category, values)
    }

    const configCache = new ScopedConfigCache((id_category) =>
      this.talentRuleConfigService.getActive(id_category),
    )

    let evaluated = 0
    let flagged = 0
    let created = 0
    let updated = 0
    let skipped = 0
    let removed = 0
    const failed: { id_user: number; mensaje: string }[] = []

    for (const index of indices) {
      const assignment = assignmentByUser.get(index.id_user)
      const category = assignment
        ? categoryById.get(assignment.id_category)
        : undefined
      if (!assignment || !category) continue

      try {
        const { config } = await configCache.get(category.id_category)
        const cohort = cohortValues.get(category.id_category) ?? []
        const index_value = Number(index.index_value)

        const result = this.talentDetectionRulesService.evaluate({
          index_value,
          percentile: this.progressIndexCalculatorService.computePercentile(
            index_value,
            cohort,
            true,
          ),
          cohort_size: cohort.length,
          physical_score: Number(index.physical_score),
          technical_score: Number(index.technical_score),
          participation_score: Number(index.participation_score),
          previous_index_value: previousIndexByUser.get(index.id_user) ?? null,
          had_severe_injury: severeInjuryUsers.has(index.id_user),
          birth_date: assignment.user?.birth_date ?? null,
          reference_date: referenceDate,
          category,
          categories: categoryInfos,
          thresholds: this.talentRuleConfigService.toThresholds(config),
        })
        evaluated++

        const existing = existingFlagByUser.get(index.id_user)
        if (result.flagged) {
          flagged++
          if (existing && existing.status !== TalentFlagStatus.OPEN) {
            skipped++
            continue
          }
          await this.talentFlagsRepository.save({
            ...(existing ?? {}),
            id_user: index.id_user,
            id_season,
            source: TalentFlagSource.RULES,
            status: TalentFlagStatus.OPEN,
            criteria: result.criteria_text,
            recommended_action: result.recommended_action,
            score: result.score,
            triggered_rules: result.triggered_criteria,
            warnings: result.warnings.length > 0 ? result.warnings : null,
            created_by: null,
          })
          if (existing) updated++
          else created++
        } else if (existing && existing.status === TalentFlagStatus.OPEN) {
          await this.talentFlagsRepository.remove(existing)
          removed++
        }
      } catch (error) {
        const mensaje = extractErrorMessage(error)
        failed.push({ id_user: index.id_user, mensaje })
        this.logger.error(
          `Error en la detección de talento del deportista ${index.id_user}: ${mensaje}`,
        )
      }
    }

    this.logger.log(
      `Detección de talento de la temporada ${id_season}: ${evaluated} evaluados, ${flagged} señalados`,
    )

    return {
      status: 'Success',
      mensaje: `Detección de talento completada: ${evaluated} deportistas evaluados, ${flagged} señalados`,
      evaluated,
      flagged,
      created,
      updated,
      skipped,
      removed,
      failed,
      recalculation: {
        recalculated: recalculation.recalculated,
        failed: recalculation.failed,
      },
    }
  }
}
