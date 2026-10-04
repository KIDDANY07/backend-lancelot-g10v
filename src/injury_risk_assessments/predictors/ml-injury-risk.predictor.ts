import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjuryRiskAssessmentMethod } from '../entities/injury-risk-assessment.entity'
import {
  InjuryRiskPredictor,
  MlTopFactor,
  PredictionResult,
} from './injury-risk-predictor.interface'
import {
  MlFeatureValue,
  classifyProbability,
  describeFactor,
} from './ml-features-payload'

export const DEFAULT_ML_SERVICE_TIMEOUT_MS = 5000
const MAX_FACTORS = 3

export interface MlPredictionInput {
  features: Record<string, MlFeatureValue>
  model: { id_model: number; version: string }
  thresholds: { prob_medium_threshold: number; prob_high_threshold: number }
}

interface MlServiceResponse {
  probability: number
  top_factors: MlTopFactor[]
  model_version: string
}

@Injectable()
export class MlInjuryRiskPredictor implements InjuryRiskPredictor<MlPredictionInput> {
  readonly method = InjuryRiskAssessmentMethod.ML_MODEL
  private readonly logger = new Logger(MlInjuryRiskPredictor.name)

  constructor(private readonly configService: ConfigService) {}

  private get timeoutMs(): number {
    const value = Number(this.configService.get('ML_SERVICE_TIMEOUT_MS'))
    return Number.isFinite(value) && value > 0
      ? value
      : DEFAULT_ML_SERVICE_TIMEOUT_MS
  }

  private isValidResponse(body: unknown): body is MlServiceResponse {
    if (typeof body !== 'object' || body === null) return false
    const { probability, top_factors, model_version } =
      body as Partial<MlServiceResponse>
    return (
      typeof probability === 'number' &&
      probability >= 0 &&
      probability <= 1 &&
      typeof model_version === 'string' &&
      Array.isArray(top_factors) &&
      top_factors.every(
        (f) =>
          typeof f?.feature === 'string' && typeof f?.contribution === 'number',
      )
    )
  }

  async predict(input: MlPredictionInput): Promise<PredictionResult | null> {
    const baseUrl = this.configService.get<string>('ML_SERVICE_URL')
    if (!baseUrl) {
      this.logger.warn('ML_SERVICE_URL no está configurada; se omite el ML')
      return null
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key':
            this.configService.get<string>('ML_SERVICE_API_KEY') ?? '',
        },
        body: JSON.stringify({
          model_version: input.model.version,
          features: input.features,
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        this.logger.error(
          `El servicio de ML respondió ${response.status} al predecir`,
        )
        return null
      }
      const body: unknown = await response.json()
      if (!this.isValidResponse(body)) {
        this.logger.error('Respuesta inválida del servicio de ML')
        return null
      }
      if (body.model_version !== input.model.version) {
        this.logger.warn(
          `El servicio de ML usó el modelo ${body.model_version} y el activo es ${input.model.version}; se descarta la predicción`,
        )
        return null
      }
      const topFactors = [...body.top_factors]
        .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
        .slice(0, MAX_FACTORS)
      return {
        riskLevel: classifyProbability(body.probability, input.thresholds),
        probability: body.probability,
        factors: topFactors.map((factor) => describeFactor(factor)),
        top_factors: topFactors,
        id_model: input.model.id_model,
      }
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'AbortError'
          ? `timeout de ${this.timeoutMs} ms`
          : error instanceof Error
            ? error.message
            : String(error)
      this.logger.error(`Error al consultar el servicio de ML: ${reason}`)
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}
