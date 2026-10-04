import { Injectable } from '@nestjs/common'
import { InjuryRiskAssessmentMethod } from '../entities/injury-risk-assessment.entity'
import {
  InjuryRiskRulesInput,
  InjuryRiskRulesService,
} from '../injury-risk-rules.service'
import {
  InjuryRiskPredictor,
  PredictionResult,
} from './injury-risk-predictor.interface'

@Injectable()
export class RulesInjuryRiskPredictor implements InjuryRiskPredictor<InjuryRiskRulesInput> {
  readonly method = InjuryRiskAssessmentMethod.RULES

  constructor(
    private readonly injuryRiskRulesService: InjuryRiskRulesService,
  ) {}

  predict(input: InjuryRiskRulesInput): Promise<PredictionResult> {
    const result = this.injuryRiskRulesService.evaluate(input)
    return Promise.resolve({
      riskLevel: result.riskLevel,
      factors: result.details,
      triggered_rules: result.triggeredRules,
      acwr_value: result.acwrValue,
    })
  }
}
