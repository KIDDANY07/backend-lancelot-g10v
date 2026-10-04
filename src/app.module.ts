import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ScheduleModule } from '@nestjs/schedule'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { UsersModule } from './users/users.module'
import { AuthModule } from './auth/auth.module'
import { RolesModule } from './roles/roles.module'
import { AthletesInCategoriesModule } from './athletes_in_categories/athletes_in_categories.module'
import { CategoriesModule } from './categories/categories.module'
import { AthletesInCompetenciesModule } from './athletes_in_competencies/athletes_in_competencies.module'
import { CompetenciesModule } from './competencies/competencies.module'
import { MatchesModule } from './matches/matches.module'
import { SeasonsModule } from './seasons/seasons.module'
import { PhysicalEvaluationsModule } from './physical_evaluations/physical-evaluations.module'
import { TechnicalEvaluationsModule } from './technical_evaluations/technical-evaluations.module'
import { ParentalConsentsModule } from './parental_consents/parental-consents.module'
import { HealthRecordsModule } from './health_records/health-records.module'
import { DevelopmentObjectivesModule } from './development_objectives/development-objectives.module'
import { TrainingSessionsModule } from './training_sessions/training-sessions.module'
import { TrainingLoadsModule } from './training_loads/training-loads.module'
import { MatchStatisticsModule } from './match_statistics/match-statistics.module'
import { InjuriesModule } from './injuries/injuries.module'
import { AcwrConfigModule } from './acwr_config/acwr-config.module'
import { FatigueAlertsModule } from './fatigue_alerts/fatigue-alerts.module'
import { InjuryRiskAssessmentsModule } from './injury_risk_assessments/injury-risk-assessments.module'
import { PositionWeightProfilesModule } from './position_weight_profiles/position-weight-profiles.module'
import { WeightedProgressIndexModule } from './weighted_progress_index/weighted-progress-index.module'
import { TalentFlagsModule } from './talent_flags/talent-flags.module'
import { ReportsModule } from './reports/reports.module'
import { InjuryRiskRuleConfigModule } from './injury_risk_rule_config/injury-risk-rule-config.module'
import { TalentRuleConfigModule } from './talent_rule_config/talent-rule-config.module'
import { MlFeaturesModule } from './ml_features/ml-features.module'
import { MlEngineModule } from './ml_engine/ml-engine.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('URL_DB'),
        synchronize: true,
        autoLoadEntities: true,
      }),
    }),
    UsersModule,
    AuthModule,
    RolesModule,
    AthletesInCategoriesModule,
    CategoriesModule,
    AthletesInCompetenciesModule,
    CompetenciesModule,
    MatchesModule,
    SeasonsModule,
    PhysicalEvaluationsModule,
    TechnicalEvaluationsModule,
    ParentalConsentsModule,
    HealthRecordsModule,
    DevelopmentObjectivesModule,
    TrainingSessionsModule,
    TrainingLoadsModule,
    MatchStatisticsModule,
    InjuriesModule,
    AcwrConfigModule,
    FatigueAlertsModule,
    InjuryRiskAssessmentsModule,
    PositionWeightProfilesModule,
    WeightedProgressIndexModule,
    TalentFlagsModule,
    ReportsModule,
    InjuryRiskRuleConfigModule,
    TalentRuleConfigModule,
    MlFeaturesModule,
    MlEngineModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
