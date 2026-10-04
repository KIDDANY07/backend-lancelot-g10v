import {
  InjuryRiskAssessmentMethod,
  InjuryRiskLevel,
  InjuryRiskRuleCode,
} from '../entities/injury-risk-assessment.entity'

export interface MlTopFactor {
  feature: string
  contribution: number
}

export interface PredictionResult {
  riskLevel: InjuryRiskLevel | null
  probability?: number
  factors: string[]
  id_model?: number
  triggered_rules?: InjuryRiskRuleCode[]
  acwr_value?: number | null
  top_factors?: MlTopFactor[]
}

export interface InjuryRiskPredictor<TInput> {
  readonly method: InjuryRiskAssessmentMethod
  predict(input: TInput): Promise<PredictionResult | null>
}
