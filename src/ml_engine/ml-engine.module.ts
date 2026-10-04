import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Injury } from 'src/injuries/entities/injury.entity'
import { InjuryRiskAssessment } from 'src/injury_risk_assessments/entities/injury-risk-assessment.entity'
import { InjuryRiskAssessmentsModule } from 'src/injury_risk_assessments/injury-risk-assessments.module'
import { AthleteDailyFeatures } from 'src/ml_features/entities/athlete-daily-features.entity'
import { InjuryRiskPrediction } from './entities/injury-risk-prediction.entity'
import { MlEngineConfig } from './entities/ml-engine-config.entity'
import { MlModel } from './entities/ml-model.entity'
import { MlEngineConfigService } from './ml-engine-config.service'
import { MlEngineController } from './ml-engine.controller'
import { MlGovernanceRulesService } from './ml-governance-rules.service'
import { MlInferenceService } from './ml-inference.service'
import { MlModelsController } from './ml-models.controller'
import { MlModelsService } from './ml-models.service'
import { MlReadinessService } from './ml-readiness.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MlEngineConfig,
      MlModel,
      InjuryRiskPrediction,
      AthleteDailyFeatures,
      Injury,
      InjuryRiskAssessment,
    ]),
    InjuryRiskAssessmentsModule,
  ],
  controllers: [MlEngineController, MlModelsController],
  providers: [
    MlGovernanceRulesService,
    MlReadinessService,
    MlModelsService,
    MlEngineConfigService,
    MlInferenceService,
  ],
  exports: [MlInferenceService, MlReadinessService],
})
export class MlEngineModule {}
