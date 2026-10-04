import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AcwrConfigModule } from 'src/acwr_config/acwr-config.module'
import { AthletesInCategoriesModule } from 'src/athletes_in_categories/athletes_in_categories.module'
import { FatigueAlertsModule } from 'src/fatigue_alerts/fatigue-alerts.module'
import { InjuryRiskRuleConfigModule } from 'src/injury_risk_rule_config/injury-risk-rule-config.module'
import { Injury } from 'src/injuries/entities/injury.entity'
import { UsersModule } from 'src/users/users.module'
import { InjuryRiskAssessment } from './entities/injury-risk-assessment.entity'
import { InjuryRiskAssessmentsController } from './injury-risk-assessments.controller'
import { InjuryRiskAssessmentsCronService } from './injury-risk-assessments-cron.service'
import { InjuryRiskAssessmentsService } from './injury-risk-assessments.service'
import { InjuryRiskRulesService } from './injury-risk-rules.service'
import { MlInjuryRiskPredictor } from './predictors/ml-injury-risk.predictor'
import { RulesInjuryRiskPredictor } from './predictors/rules-injury-risk.predictor'

@Module({
  imports: [
    TypeOrmModule.forFeature([InjuryRiskAssessment, Injury]),
    UsersModule,
    AcwrConfigModule,
    FatigueAlertsModule,
    InjuryRiskRuleConfigModule,
    AthletesInCategoriesModule,
  ],
  controllers: [InjuryRiskAssessmentsController],
  providers: [
    InjuryRiskAssessmentsService,
    InjuryRiskAssessmentsCronService,
    InjuryRiskRulesService,
    RulesInjuryRiskPredictor,
    MlInjuryRiskPredictor,
  ],
  exports: [RulesInjuryRiskPredictor, MlInjuryRiskPredictor],
})
export class InjuryRiskAssessmentsModule {}
