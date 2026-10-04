import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AcwrConfigService } from 'src/acwr_config/acwr-config.service'
import { AthletesInCategoriesService } from 'src/athletes_in_categories/athletes_in_categories.service'
import { ScopedConfigCache } from 'src/common/scoped_config/scoped-config'
import { UsersService } from 'src/users/users.service'
import {
  AcwrCalculatorService,
  CHRONIC_WINDOW_DAYS,
} from './acwr-calculator.service'
import {
  FatigueAlert,
  FatigueAlertLevel,
} from './entities/fatigue-alert.entity'
import { LoadRecordsService } from './load-records.service'

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

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async recalculateFatigueAlerts() {
    const referenceDate = new Date()
    const athleteIds = await this.usersService.findAllAthleteIds()
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
        await this.processAthlete(id_user, referenceDate, thresholds)
      } catch (error) {
        this.logger.error(
          `Error al calcular ACWR/fatiga del deportista ${id_user}`,
          error instanceof Error ? error.stack : String(error),
        )
      }
    }

    this.logger.log(
      `Recalculo de ACWR/fatiga completado para ${athleteIds.length} deportistas`,
    )
  }

  private async processAthlete(
    id_user: number,
    referenceDate: Date,
    thresholds: { low_min: number; low_max: number; medium_max: number },
  ) {
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

    if (
      !result.level ||
      result.level === FatigueAlertLevel.BAJO ||
      result.acwr_value === null
    )
      return

    const dateKey = referenceDate.toISOString().slice(0, 10)
    const alreadyExists = await this.fatigueAlertsRepository.findOne({
      where: { id_user, date: dateKey },
    })
    if (alreadyExists) return

    await this.fatigueAlertsRepository.save({
      id_user,
      date: dateKey,
      acute_load: result.acute_load,
      chronic_load: result.chronic_load,
      acwr_value: result.acwr_value,
      rpe_avg: result.rpe_avg,
      level: result.level,
    })
  }
}
