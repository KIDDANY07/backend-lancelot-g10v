import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AthletesInCategory } from 'src/athletes_in_categories/entities/athletes_in_category.entity'
import { Category } from 'src/categories/entities/category.entity'
import { TalentFlag } from 'src/talent_flags/entities/talent-flag.entity'
import { WeightedProgressIndex } from 'src/weighted_progress_index/entities/weighted-progress-index.entity'
import { FatigueAlert } from 'src/fatigue_alerts/entities/fatigue-alert.entity'
import { FatigueAlertsModule } from 'src/fatigue_alerts/fatigue-alerts.module'
import { InjuryRiskAssessmentsModule } from 'src/injury_risk_assessments/injury-risk-assessments.module'
import { Injury } from 'src/injuries/entities/injury.entity'
import { InjuryRiskAssessment } from 'src/injury_risk_assessments/entities/injury-risk-assessment.entity'
import { MatchStatistic } from 'src/match_statistics/entities/match-statistic.entity'
import { Season } from 'src/seasons/entities/season.entity'
import { TrainingLoad } from 'src/training_loads/entities/training-load.entity'
import { MlEngineModule } from 'src/ml_engine/ml-engine.module'
import { User } from 'src/users/entities/user.entity'
import { UsersModule } from 'src/users/users.module'
import { AiPipelineController } from './ai-pipeline.controller'
import { AiPipelineService } from './ai-pipeline.service'
import { AthleteDailyFeatures } from './entities/athlete-daily-features.entity'
import { AthleteSeasonFeatures } from './entities/athlete-season-features.entity'
import { FeatureCalculatorService } from './feature-calculator.service'
import { FeatureExportService } from './feature-export.service'
import { MlFeaturesController } from './ml-features.controller'
import { MlFeaturesCronService } from './ml-features-cron.service'
import { MlFeaturesService } from './ml-features.service'
import { TalentFeatureCalculatorService } from './talent-feature-calculator.service'
import { TalentFeaturesController } from './talent-features.controller'
import { TalentFeaturesService } from './talent-features.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AthleteDailyFeatures,
      AthleteSeasonFeatures,
      Category,
      WeightedProgressIndex,
      TalentFlag,
      Injury,
      InjuryRiskAssessment,
      FatigueAlert,
      AthletesInCategory,
      Season,
      User,
      TrainingLoad,
      MatchStatistic,
    ]),
    UsersModule,
    FatigueAlertsModule,
    InjuryRiskAssessmentsModule,
    MlEngineModule,
  ],
  controllers: [
    MlFeaturesController,
    TalentFeaturesController,
    AiPipelineController,
  ],
  providers: [
    MlFeaturesService,
    MlFeaturesCronService,
    FeatureCalculatorService,
    FeatureExportService,
    TalentFeatureCalculatorService,
    TalentFeaturesService,
    AiPipelineService,
  ],
  exports: [MlFeaturesService, FeatureCalculatorService, TalentFeaturesService],
})
export class MlFeaturesModule {}
