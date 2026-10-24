import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { MlModelTask } from './entities/ml-model.entity'
import { MlModelsService, TASK_LABELS } from './ml-models.service'
import { MlServiceClient } from './ml-service.client'

export const ML_TRAINING_TIMEOUT_MS = 170_000

const TRAIN_PATHS: Record<MlModelTask, string> = {
  [MlModelTask.INJURY_RISK]: '/train',
  [MlModelTask.TALENT]: '/talent/train',
}

interface TrainedModelPayload {
  version: string
  is_synthetic?: boolean
  metrics?: { pr_auc?: number | null }
  rules_baseline_metrics?: { pr_auc?: number | null } | null
}

interface MlTrainingResponse {
  model?: TrainedModelPayload
}

function formatPrAuc(value: number | null | undefined) {
  return typeof value === 'number' ? value.toFixed(3) : 'sin dato'
}

@Injectable()
export class MlTrainingService {
  private readonly logger = new Logger(MlTrainingService.name)

  constructor(
    private readonly mlServiceClient: MlServiceClient,
    private readonly mlModelsService: MlModelsService,
  ) {}

  private errorDetail(body: unknown, status: number) {
    const detail = (body as { detail?: unknown } | null)?.detail
    return typeof detail === 'string'
      ? detail
      : `El servicio de ML respondió ${status} al entrenar`
  }

  private async callService(task: MlModelTask) {
    if (!this.mlServiceClient.baseUrl)
      throw new ServiceUnavailableException({
        status: 'Error',
        mensaje:
          'ML_SERVICE_URL no está configurada: el backend no puede contactar el servicio de ML',
      })
    try {
      return await this.mlServiceClient.request('POST', TRAIN_PATHS[task], {
        body: { source: 'db' },
        timeoutMs: ML_TRAINING_TIMEOUT_MS,
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.error(`Error al entrenar en el servicio de ML: ${reason}`)
      throw new ServiceUnavailableException({
        status: 'Error',
        mensaje: `No se pudo contactar el servicio de ML: ${reason}`,
      })
    }
  }

  async train(task: MlModelTask) {
    const { status, ok, body } = await this.callService(task)

    if (!ok) {
      const mensaje = this.errorDetail(body, status)
      this.logger.warn(
        `Entrenamiento de ${TASK_LABELS[task]} rechazado: ${mensaje}`,
      )
      if (status === 409)
        throw new ConflictException({ status: 'Error', mensaje })
      if (status === 422)
        throw new UnprocessableEntityException({ status: 'Error', mensaje })
      if (status === 401)
        throw new BadGatewayException({
          status: 'Error',
          mensaje:
            'El servicio de ML rechazó la clave: ML_SERVICE_API_KEY debe ser la misma en el backend y en el servicio de ML',
        })
      throw new BadGatewayException({ status: 'Error', mensaje })
    }

    const trained = (body as MlTrainingResponse | null)?.model
    if (!trained?.version)
      throw new BadGatewayException({
        status: 'Error',
        mensaje: 'Respuesta inválida del servicio de ML al entrenar',
      })

    const model = await this.mlModelsService.findResponseByVersion(
      trained.version,
    )
    const comparison = `PR-AUC ${formatPrAuc(trained.metrics?.pr_auc)} frente a ${formatPrAuc(trained.rules_baseline_metrics?.pr_auc)} de las reglas`
    return {
      status: 'Success',
      mensaje: trained.is_synthetic
        ? `Modelo de ${TASK_LABELS[task]} ${trained.version} entrenado como sintético (no activable): ${comparison}`
        : `Modelo de ${TASK_LABELS[task]} ${trained.version} entrenado y registrado: ${comparison}`,
      model,
    }
  }
}
