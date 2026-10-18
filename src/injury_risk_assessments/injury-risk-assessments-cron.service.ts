import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AcwrConfigService } from 'src/acwr_config/acwr-config.service'
import { AthletesInCategoriesService } from 'src/athletes_in_categories/athletes_in_categories.service'
import { ScopedConfigCache } from 'src/common/scoped_config/scoped-config'
import {
  CLUB_TIMEZONE,
  parseDateKey,
  todayKey,
} from 'src/common/utils/date.util'
import { DailyAlertsSummary } from 'src/fatigue_alerts/fatigue-alerts-cron.service'
import { CHRONIC_WINDOW_DAYS } from 'src/fatigue_alerts/acwr-calculator.service'
import { LoadRecordsService } from 'src/fatigue_alerts/load-records.service'
import { InjuryRiskRuleConfig } from 'src/injury_risk_rule_config/entities/injury-risk-rule-config.entity'
import { InjuryRiskRuleConfigService } from 'src/injury_risk_rule_config/injury-risk-rule-config.service'
import { Injury, InjuryStatus } from 'src/injuries/entities/injury.entity'
import { UsersService } from 'src/users/users.service'
import {
  InjuryRiskAssessment,
  InjuryRiskAssessmentMethod,
  InjuryRiskAssessmentStatus,
} from './entities/injury-risk-assessment.entity'
import { RulesInjuryRiskPredictor } from './predictors/rules-injury-risk.predictor'

@Injectable()
export class InjuryRiskAssessmentsCronService {
  private readonly logger = new Logger(InjuryRiskAssessmentsCronService.name)

  constructor(
    @InjectRepository(Injury)
    private readonly injuriesRepository: Repository<Injury>,
    @InjectRepository(InjuryRiskAssessment)
    private readonly injuryRiskAssessmentsRepository: Repository<InjuryRiskAssessment>,
    private readonly usersService: UsersService,
    private readonly acwrConfigService: AcwrConfigService,
    private readonly injuryRiskRuleConfigService: InjuryRiskRuleConfigService,
    private readonly rulesInjuryRiskPredictor: RulesInjuryRiskPredictor,
    private readonly loadRecordsService: LoadRecordsService,
    private readonly athletesInCategoriesService: AthletesInCategoriesService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { timeZone: CLUB_TIMEZONE })
  async recalculateInjuryRiskAssessments() {
    await this.runForDate(todayKey())
  }

  async runForDate(dateKey: string): Promise<DailyAlertsSummary> {
    const referenceDate = parseDateKey(dateKey)
    const summary: DailyAlertsSummary = {
      athletes: 0,
      created: 0,
      updated: 0,
      removed: 0,
      failed: 0,
    }
    const athleteIds = await this.usersService.findAllAthleteIds()
    summary.athletes = athleteIds.length
    const categoryByUser =
      await this.athletesInCategoriesService.findActiveSeasonCategoryMap()
    const acwrCache = new ScopedConfigCache((id_category) =>
      this.acwrConfigService.getActive(id_category),
    )
    const rulesCache = new ScopedConfigCache((id_category) =>
      this.injuryRiskRuleConfigService.getActive(id_category),
    )

    for (const id_user of athleteIds) {
      try {
        const id_category = categoryByUser.get(id_user)
        const { config: acwrThresholds } = await acwrCache.get(id_category)
        const { config: ruleThresholds } = await rulesCache.get(id_category)
        const outcome = await this.processAthlete(
          id_user,
          referenceDate,
          acwrThresholds,
          ruleThresholds,
        )
        if (outcome !== 'unchanged') summary[outcome]++
      } catch (error) {
        summary.failed++
        this.logger.error(
          `Error al evaluar el riesgo de lesión del deportista ${id_user}`,
          error instanceof Error ? error.stack : String(error),
        )
      }
    }

    this.logger.log(
      `Recalculo de riesgo de lesión del ${dateKey}: ${summary.created} evaluaciones nuevas, ${summary.updated} actualizadas y ${summary.removed} retiradas`,
    )
    return summary
  }

  private async processAthlete(
    id_user: number,
    referenceDate: Date,
    acwrThresholds: { low_min: number; low_max: number; medium_max: number },
    ruleThresholds: InjuryRiskRuleConfig,
  ): Promise<'created' | 'updated' | 'removed' | 'unchanged'> {
    const lookbackDays =
      CHRONIC_WINDOW_DAYS +
      Math.max(
        Number(ruleThresholds.sustained_acwr_lookback_days),
        Number(ruleThresholds.sustained_rpe_lookback_days),
      ) -
      1

    const windowStart = new Date(referenceDate)
    windowStart.setUTCDate(windowStart.getUTCDate() - (lookbackDays - 1))

    const records = await this.loadRecordsService.getRecords(
      id_user,
      windowStart.toISOString().slice(0, 10),
      referenceDate.toISOString().slice(0, 10),
    )

    const isRecoveringFromInjury =
      (await this.injuriesRepository.count({
        where: { id_user, status: InjuryStatus.RECOVERING },
      })) > 0

    const result = await this.rulesInjuryRiskPredictor.predict({
      records,
      referenceDate,
      isRecoveringFromInjury,
      acwrThresholds: {
        low_min: Number(acwrThresholds.low_min),
        low_max: Number(acwrThresholds.low_max),
        medium_max: Number(acwrThresholds.medium_max),
      },
      ruleThresholds: {
        sustained_acwr_threshold: Number(
          ruleThresholds.sustained_acwr_threshold,
        ),
        sustained_acwr_min_days: Number(ruleThresholds.sustained_acwr_min_days),
        sustained_acwr_lookback_days: Number(
          ruleThresholds.sustained_acwr_lookback_days,
        ),
        sustained_rpe_threshold: Number(ruleThresholds.sustained_rpe_threshold),
        sustained_rpe_min_sessions: Number(
          ruleThresholds.sustained_rpe_min_sessions,
        ),
        sustained_rpe_lookback_days: Number(
          ruleThresholds.sustained_rpe_lookback_days,
        ),
      },
    })

    const dateKey = referenceDate.toISOString().slice(0, 10)
    const existing = await this.injuryRiskAssessmentsRepository.findOne({
      where: {
        id_user,
        assessment_date: dateKey,
        method: InjuryRiskAssessmentMethod.RULES,
      },
    })

    if (!result.triggered_rules?.length || !result.riskLevel) {
      if (existing?.status !== InjuryRiskAssessmentStatus.OPEN)
        return 'unchanged'
      await this.injuryRiskAssessmentsRepository.remove(existing)
      return 'removed'
    }
    if (existing && existing.status !== InjuryRiskAssessmentStatus.OPEN)
      return 'unchanged'

    const values = {
      id_user,
      assessment_date: dateKey,
      method: InjuryRiskAssessmentMethod.RULES,
      risk_level: result.riskLevel,
      triggered_rules: result.triggered_rules,
      details: result.factors.join('; '),
      acwr_value: result.acwr_value ?? null,
    }
    if (
      existing &&
      existing.risk_level === values.risk_level &&
      existing.details === values.details
    )
      return 'unchanged'
    await this.injuryRiskAssessmentsRepository.save(
      existing
        ? this.injuryRiskAssessmentsRepository.merge(existing, values)
        : values,
    )
    return existing ? 'updated' : 'created'
  }
}
