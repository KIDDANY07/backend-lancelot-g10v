import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { plainToInstance } from 'class-transformer'
import { Repository } from 'typeorm'
import { FEATURE_VERSION } from 'src/ml_features/entities/athlete-daily-features.entity'
import { TALENT_FEATURE_VERSION } from 'src/ml_features/entities/athlete-season-features.entity'
import { CreateMlModelDto } from './dto/create-ml-model.dto'
import { FilterMlModelDto } from './dto/filter-ml-model.dto'
import { ResponseMlModelDto } from './dto/response-ml-model.dto'
import {
  MlEngineConfig,
  MlEngineMode,
} from './entities/ml-engine-config.entity'
import { MlModel, MlModelTask } from './entities/ml-model.entity'
import { MlGovernanceRulesService } from './ml-governance-rules.service'
import { MlReadinessService } from './ml-readiness.service'
import { MlServiceClient } from './ml-service.client'
import { TalentReadinessService } from './talent-readiness.service'

export const TASK_LABELS: Record<MlModelTask, string> = {
  [MlModelTask.INJURY_RISK]: 'riesgo de lesión',
  [MlModelTask.TALENT]: 'talento',
}

const ENGINE_FIELDS: Record<MlModelTask, 'engine' | 'talent_engine'> = {
  [MlModelTask.INJURY_RISK]: 'engine',
  [MlModelTask.TALENT]: 'talent_engine',
}

@Injectable()
export class MlModelsService {
  private readonly logger = new Logger(MlModelsService.name)

  constructor(
    @InjectRepository(MlModel)
    private readonly mlModelsRepository: Repository<MlModel>,
    private readonly mlReadinessService: MlReadinessService,
    private readonly mlGovernanceRulesService: MlGovernanceRulesService,
    private readonly talentReadinessService: TalentReadinessService,
    private readonly mlServiceClient: MlServiceClient,
  ) {}

  private async findOrFail(id_model: number) {
    const model = await this.mlModelsRepository.findOne({
      where: { id_model },
    })
    if (!model)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este modelo de ML',
      })
    return model
  }

  private toResponse(model: MlModel) {
    return plainToInstance(ResponseMlModelDto, model, {
      excludeExtraneousValues: true,
    })
  }

  async findActiveEntity(task: MlModelTask = MlModelTask.INJURY_RISK) {
    return this.mlModelsRepository.findOne({ where: { is_active: true, task } })
  }

  async create(createMlModelDto: CreateMlModelDto) {
    const existing = await this.mlModelsRepository.findOne({
      where: { version: createMlModelDto.version },
    })
    if (existing)
      throw new BadRequestException({
        status: 'Error',
        mensaje: `Ya existe un modelo registrado con la versión ${createMlModelDto.version}`,
      })
    const model = await this.mlModelsRepository.save({
      ...createMlModelDto,
      task: createMlModelDto.task ?? MlModelTask.INJURY_RISK,
      rules_baseline_metrics: createMlModelDto.rules_baseline_metrics ?? null,
      notes: createMlModelDto.notes ?? null,
      is_active: false,
    })
    return {
      status: 'Success',
      mensaje: model.is_synthetic
        ? 'Modelo registrado como sintético: sirve para probar el pipeline y nunca podrá activarse'
        : 'Modelo registrado; un administrador debe activarlo si cumple las condiciones',
      model: this.toResponse(model),
    }
  }

  async findResponseByVersion(version: string) {
    const model = await this.mlModelsRepository.findOne({ where: { version } })
    return model ? this.toResponse(model) : null
  }

  async findAll(filters: FilterMlModelDto) {
    const { page = 1, limit = 10, task } = filters
    const [models, total] = await this.mlModelsRepository.findAndCount({
      where: task ? { task } : {},
      order: { is_active: 'DESC', created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    })
    if (!total)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay modelos de ML registrados',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de modelos de ML exitosa',
      models: models.map((model) => this.toResponse(model)),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async getActive(task: MlModelTask = MlModelTask.INJURY_RISK) {
    const model = await this.findActiveEntity(task)
    if (!model)
      throw new NotFoundException({
        status: 'Error',
        mensaje: `No hay un modelo de ML activo de ${TASK_LABELS[task]}`,
      })
    return {
      status: 'Success',
      mensaje: 'Consulta del modelo de ML activo exitosa',
      model: this.toResponse(model),
    }
  }

  async activate(id_model: number) {
    const model = await this.findOrFail(id_model)
    if (model.is_active)
      return {
        status: 'Success',
        mensaje: 'El modelo ya estaba activo',
        model: this.toResponse(model),
      }

    const isTalent = model.task === MlModelTask.TALENT
    const readiness = isTalent
      ? await this.talentReadinessService.evaluate()
      : await this.mlReadinessService.evaluate()
    const reasons = this.mlGovernanceRulesService.checkModelActivation(model, {
      ready: readiness.ready,
      currentFeatureVersion: isTalent
        ? TALENT_FEATURE_VERSION
        : FEATURE_VERSION,
    })
    if (reasons.length > 0)
      throw new BadRequestException({
        status: 'Error',
        mensaje: `No se puede activar el modelo: ${reasons.join('. ')}`,
      })

    await this.mlModelsRepository.manager.transaction(async (manager) => {
      await manager.update(
        MlModel,
        { is_active: true, task: model.task },
        { is_active: false },
      )
      await manager.update(MlModel, { id_model }, { is_active: true })
    })
    model.is_active = true
    return {
      status: 'Success',
      mensaje: `Modelo de ML de ${TASK_LABELS[model.task]} activado con éxito`,
      model: this.toResponse(model),
    }
  }

  async deactivate(id_model: number) {
    const model = await this.findOrFail(id_model)
    if (!model.is_active)
      return {
        status: 'Success',
        mensaje: 'El modelo ya estaba inactivo',
        model: this.toResponse(model),
      }

    const field = ENGINE_FIELDS[model.task]
    let engineReset = false
    await this.mlModelsRepository.manager.transaction(async (manager) => {
      await manager.update(MlModel, { id_model }, { is_active: false })
      const [config] = await manager.find(MlEngineConfig, {
        order: { id_config: 'ASC' },
        take: 1,
      })
      if (config && config[field] !== MlEngineMode.RULES) {
        await manager.update(
          MlEngineConfig,
          { id_config: config.id_config },
          { [field]: MlEngineMode.RULES },
        )
        engineReset = true
      }
    })
    model.is_active = false
    const label = TASK_LABELS[model.task]
    return {
      status: 'Success',
      mensaje: engineReset
        ? `Modelo de ML de ${label} desactivado; el motor de ${label} volvió a «Solo reglas»`
        : `Modelo de ML de ${label} desactivado`,
      model: this.toResponse(model),
    }
  }

  private async removeArtifact(version: string) {
    if (!this.mlServiceClient.baseUrl) return false
    try {
      const response = await this.mlServiceClient.request(
        'DELETE',
        `/models/${encodeURIComponent(version)}`,
      )
      if (!response.ok)
        this.logger.warn(
          `El servicio de ML respondió ${response.status} al borrar el archivo de ${version}`,
        )
      return response.ok
    } catch (error) {
      this.logger.warn(
        `No se pudo borrar el archivo de ${version} en el servicio de ML: ${error instanceof Error ? error.message : String(error)}`,
      )
      return false
    }
  }

  async remove(id_model: number) {
    const model = await this.findOrFail(id_model)
    if (model.is_active)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No se puede eliminar el modelo activo: desactívalo primero',
      })

    await this.mlModelsRepository.delete({ id_model })
    const artifactRemoved = await this.removeArtifact(model.version)
    return {
      status: 'Success',
      mensaje: artifactRemoved
        ? `Modelo ${model.version} eliminado junto con sus predicciones y su archivo en el servicio de ML`
        : `Modelo ${model.version} eliminado junto con sus predicciones; el servicio de ML no confirmó el borrado de su archivo`,
    }
  }
}
