import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AthletesInCategory } from 'src/athletes_in_categories/entities/athletes_in_category.entity'
import { DevelopmentObjective } from 'src/development_objectives/entities/development-objective.entity'
import { FatigueAlert } from 'src/fatigue_alerts/entities/fatigue-alert.entity'
import { InjuryRiskAssessment } from 'src/injury_risk_assessments/entities/injury-risk-assessment.entity'
import { Injury } from 'src/injuries/entities/injury.entity'
import { Match } from 'src/matches/entities/match.entity'
import { MatchStatistic } from 'src/match_statistics/entities/match-statistic.entity'
import { InjuryRiskPrediction } from 'src/ml_engine/entities/injury-risk-prediction.entity'
import { MlFeaturesModule } from 'src/ml_features/ml-features.module'
import { PhysicalEvaluation } from 'src/physical_evaluations/entities/physical-evaluation.entity'
import { SeasonsModule } from 'src/seasons/seasons.module'
import { TalentFlag } from 'src/talent_flags/entities/talent-flag.entity'
import { TechnicalEvaluation } from 'src/technical_evaluations/entities/technical-evaluation.entity'
import { TrainingLoad } from 'src/training_loads/entities/training-load.entity'
import { TrainingSession } from 'src/training_sessions/entities/training-session.entity'
import { UsersModule } from 'src/users/users.module'
import { WeightedProgressIndex } from 'src/weighted_progress_index/entities/weighted-progress-index.entity'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'
import { ValidationMetricsService } from './validation-metrics.service'
import { ValidationReportService } from './validation-report.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AthletesInCategory,
      PhysicalEvaluation,
      TechnicalEvaluation,
      DevelopmentObjective,
      Injury,
      FatigueAlert,
      InjuryRiskAssessment,
      TalentFlag,
      TrainingSession,
      TrainingLoad,
      Match,
      MatchStatistic,
      WeightedProgressIndex,
      InjuryRiskPrediction,
    ]),
    UsersModule,
    SeasonsModule,
    MlFeaturesModule,
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ValidationReportService,
    ValidationMetricsService,
  ],
})
export class ReportsModule {}
