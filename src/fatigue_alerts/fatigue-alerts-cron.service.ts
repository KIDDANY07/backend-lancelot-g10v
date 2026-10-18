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
import { UsersService } from 'src/users/users.service'
import {
  AcwrCalculatorService,
  CHRONIC_WINDOW_DAYS,
} from './acwr-calculator.service'
import {
  FatigueAlert,
  FatigueAlertLevel,
  FatigueAlertStatus,
} from './entities/fatigue-alert.entity'
import { LoadRecordsService } from './load-records.service'

export interface DailyAlertsSummary {
  athletes: number
  created: number
  updated: number
  removed: number
  failed: number
}

type AlertOutcome = 'created' | 'updated' | 'removed' | 'unchanged'

@Injectable()
export class FatigueAlertsCronService {
  private readonly logger = new Logger(FatigueAlertsCronService.name)

  constructor(
    @InjectRepository(FatigueAlert)
    private readonly fatigueAlertsRepository: Repository<FatigueAlert>,
    private readonly usersService: UsersService,
    private readonly acwrConfigService: AcwrConfigService,
    private readonly acwrCalculatorService: AcwrCalculatorService,
    private readonly loadRecordsService: LoadRecordsService,
    private readonly athletesInCategoriesService: AthletesInCategoriesService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: CLUB_TIMEZONE })
  async recalculateFatigueAlerts() {
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
    const thresholdsCache = new ScopedConfigCache((id_category) =>
      this.acwrConfigService.getActive(id_category),
    )

    for (const id_user of athleteIds) {
      try {
        const { config: thresholds } = await thresholdsCache.get(
          categoryByUser.get(id_user),
        )
        const outcome = await this.processAthlete(
          id_user,
          referenceDate,
          thresholds,
        )
        if (outcome !== 'unchanged') summary[outcome]++
      } catch (error) {
        summary.failed++
        this.logger.error(
          `Error al calcular ACWR/fatiga del deportista ${id_user}`,
          error instanceof Error ? error.stack : String(error),
        )
      }
    }

    this.logger.log(
      `Recalculo de ACWR/fatiga del ${dateKey}: ${summary.created} alertas nuevas, ${summary.updated} actualizadas y ${summary.removed} retiradas`,
    )
    return summary
  }

  private async processAthlete(
    id_user: number,
    referenceDate: Date,
    thresholds: { low_min: number; low_max: number; medium_max: number },
  ): Promise<AlertOutcome> {
    const windowStart = new Date(referenceDate)
    windowStart.setUTCDate(windowStart.getUTCDate() - (CHRONIC_WINDOW_DAYS - 1))

    const records = await this.loadRecordsService.getRecords(
      id_user,
      windowStart.toISOString().slice(0, 10),
      referenceDate.toISOString().slice(0, 10),
    )

    const result = this.acwrCalculatorService.calculate(
      records,
      referenceDate,
      {
        low_min: Number(thresholds.low_min),
        low_max: Number(thresholds.low_max),
        medium_max: Number(thresholds.medium_max),
      },
    )

    const dateKey = referenceDate.toISOString().slice(0, 10)
    const existing = await this.fatigueAlertsRepository.findOne({
      where: { id_user, date: dateKey },
    })
    if (
      !result.level ||
      result.level === FatigueAlertLevel.BAJO ||
      result.acwr_value === null ||
      Number(result.acute_load) === 0
    ) {
      if (existing?.status !== FatigueAlertStatus.OPEN) return 'unchanged'
      await this.fatigueAlertsRepository.remove(existing)
      return 'removed'
    }
    if (existing && existing.status !== FatigueAlertStatus.OPEN)
      return 'unchanged'

    const values = {
      id_user,
      date: dateKey,
      acute_load: result.acute_load,
      chronic_load: result.chronic_load,
      acwr_value: result.acwr_value,
      rpe_avg: result.rpe_avg,
      level: result.level,
    }
    if (
      existing &&
      existing.level === values.level &&
      Number(existing.acwr_value) === Number(values.acwr_value) &&
      Number(existing.acute_load) === Number(values.acute_load)
    )
      return 'unchanged'
    await this.fatigueAlertsRepository.save(
      existing ? this.fatigueAlertsRepository.merge(existing, values) : values,
    )
    return existing ? 'updated' : 'created'
  }
}
