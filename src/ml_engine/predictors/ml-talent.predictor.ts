import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DEFAULT_ML_SERVICE_TIMEOUT_MS } from 'src/injury_risk_assessments/predictors/ml-injury-risk.predictor'
import { TalentFeatureValue } from '../talent-features-payload'

const MAX_FACTORS = 3

export interface TalentTopFactor {
  feature: string
  contribution: number
}

export interface TalentPredictionInput {
  features: Record<string, TalentFeatureValue>
  model: { id_model: number; version: string }
}

export interface TalentPredictionResult {
  probability: number
  top_factors: TalentTopFactor[]
}

interface MlServiceResponse {
  probability: number
  top_factors: TalentTopFactor[]
  model_version: string
}

@Injectable()
export class MlTalentPredictor {
  private readonly logger = new Logger(MlTalentPredictor.name)

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

  async predict(
    input: TalentPredictionInput,
  ): Promise<TalentPredictionResult | null> {
    const baseUrl = this.configService.get<string>('ML_SERVICE_URL')
    if (!baseUrl) {
      this.logger.warn('ML_SERVICE_URL no está configurada; se omite el ML')
      return null
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, '')}/talent/predict`,
        {
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
        },
      )
      if (!response.ok) {
        this.logger.error(
          `El servicio de ML respondió ${response.status} al predecir el talento`,
        )
        return null
      }
      const body: unknown = await response.json()
      if (!this.isValidResponse(body)) {
        this.logger.error('Respuesta inválida del servicio de ML de talento')
        return null
      }
      if (body.model_version !== input.model.version) {
        this.logger.warn(
          `El servicio de ML usó el modelo de talento ${body.model_version} y el activo es ${input.model.version}; se descarta la predicción`,
        )
        return null
      }
      return {
        probability: body.probability,
        top_factors: [...body.top_factors]
          .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
          .slice(0, MAX_FACTORS),
      }
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'AbortError'
          ? `timeout de ${this.timeoutMs} ms`
          : error instanceof Error
            ? error.message
            : String(error)
      this.logger.error(
        `Error al consultar el servicio de ML de talento: ${reason}`,
      )
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}
