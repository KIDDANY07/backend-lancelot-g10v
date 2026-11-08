import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AcwrConfigModule } from 'src/acwr_config/acwr-config.module'
import { Category } from 'src/categories/entities/category.entity'
import { MlEngineModule } from 'src/ml_engine/ml-engine.module'
import { Season } from 'src/seasons/entities/season.entity'
import { UsersModule } from 'src/users/users.module'
import { DashboardController } from './dashboard.controller'
import { DashboardInsightsService } from './dashboard-insights.service'
import { DashboardMetricsService } from './dashboard-metrics.service'
import { DashboardScopeService } from './dashboard-scope.service'
import { DashboardService } from './dashboard.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Season, Category]),
    UsersModule,
    AcwrConfigModule,
    MlEngineModule,
  ],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardScopeService,
    DashboardInsightsService,
    DashboardMetricsService,
  ],
})
export class DashboardModule {}
