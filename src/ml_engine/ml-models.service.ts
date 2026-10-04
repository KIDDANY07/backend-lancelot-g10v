import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { plainToInstance } from 'class-transformer'
import { Repository } from 'typeorm'
import { FEATURE_VERSION } from 'src/ml_features/entities/athlete-daily-features.entity'
import { CreateMlModelDto } from './dto/create-ml-model.dto'
import { FilterMlModelDto } from './dto/filter-ml-model.dto'
import { ResponseMlModelDto } from './dto/response-ml-model.dto'
import { MlModel } from './entities/ml-model.entity'
import { MlGovernanceRulesService } from './ml-governance-rules.service'
import { MlReadinessService } from './ml-readiness.service'

@Injectable()
export class MlModelsService {
  constructor(
    @InjectRepository(MlModel)
    private readonly mlModelsRepository: Repository<MlModel>,
    private readonly mlReadinessService: MlReadinessService,
    private readonly mlGovernanceRulesService: MlGovernanceRulesService,
  ) {}

  private toResponse(model: MlModel) {
    return plainToInstance(ResponseMlModelDto, model, {
      excludeExtraneousValues: true,
    })
  }

  async findActiveEntity() {
    return this.mlModelsRepository.findOne({ where: { is_active: true } })
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

  async findAll(filters: FilterMlModelDto) {
    const { page = 1, limit = 10 } = filters
    const [models, total] = await this.mlModelsRepository.findAndCount({
      order: { created_at: 'DESC' },
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

  async getActive() {
    const model = await this.findActiveEntity()
    if (!model)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay un modelo de ML activo',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta del modelo de ML activo exitosa',
      model: this.toResponse(model),
    }
  }

  async activate(id_model: number) {
    const model = await this.mlModelsRepository.findOne({
      where: { id_model },
    })
    if (!model)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este modelo de ML',
      })
    if (model.is_active)
      return {
        status: 'Success',
        mensaje: 'El modelo ya estaba activo',
        model: this.toResponse(model),
      }

    const readiness = await this.mlReadinessService.evaluate()
    const reasons = this.mlGovernanceRulesService.checkModelActivation(model, {
      ready: readiness.ready,
      currentFeatureVersion: FEATURE_VERSION,
    })
    if (reasons.length > 0)
      throw new BadRequestException({
        status: 'Error',
        mensaje: `No se puede activar el modelo: ${reasons.join('. ')}`,
      })

    await this.mlModelsRepository.manager.transaction(async (manager) => {
      await manager.update(MlModel, { is_active: true }, { is_active: false })
      await manager.update(MlModel, { id_model }, { is_active: true })
    })
    model.is_active = true
    return {
      status: 'Success',
      mensaje: 'Modelo de ML activado con éxito',
      model: this.toResponse(model),
    }
  }
}
