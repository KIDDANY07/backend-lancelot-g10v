import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AcwrConfigModule } from 'src/acwr_config/acwr-config.module'
import { AthletesInCategoriesModule } from 'src/athletes_in_categories/athletes_in_categories.module'
import { CategoriesModule } from 'src/categories/categories.module'
import { MatchStatistic } from 'src/match_statistics/entities/match-statistic.entity'
import { TrainingLoad } from 'src/training_loads/entities/training-load.entity'
import { UsersModule } from 'src/users/users.module'
import { AcwrCalculatorService } from './acwr-calculator.service'
import { FatigueAlert } from './entities/fatigue-alert.entity'
import { FatigueAlertsController } from './fatigue-alerts.controller'
import { FatigueAlertsCronService } from './fatigue-alerts-cron.service'
import { FatigueAlertsService } from './fatigue-alerts.service'
import { LoadMonitoringController } from './load-monitoring.controller'
import { LoadMonitoringService } from './load-monitoring.service'
import { LoadRecordsService } from './load-records.service'
import { LoadSeriesService } from './load-series.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([FatigueAlert, TrainingLoad, MatchStatistic]),
    UsersModule,
    AcwrConfigModule,
    AthletesInCategoriesModule,
    CategoriesModule,
  ],
  controllers: [FatigueAlertsController, LoadMonitoringController],
  providers: [
    FatigueAlertsService,
    FatigueAlertsCronService,
    AcwrCalculatorService,
    LoadRecordsService,
    LoadSeriesService,
    LoadMonitoringService,
  ],
  exports: [AcwrCalculatorService, LoadRecordsService],
})
export class FatigueAlertsModule {}
