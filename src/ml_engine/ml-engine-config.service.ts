import {
  BadRequestException,
  Injectable,
  OnApplicationBootstrap,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { plainToInstance } from 'class-transformer'
import { Repository } from 'typeorm'
import { ResponseMlEngineConfigDto } from './dto/response-ml-engine-config.dto'
import { UpdateMlEngineConfigDto } from './dto/update-ml-engine-config.dto'
import { MlEngineConfig } from './entities/ml-engine-config.entity'
import { MlGovernanceRulesService } from './ml-governance-rules.service'
import { MlModelsService } from './ml-models.service'
import { MlReadinessService } from './ml-readiness.service'

@Injectable()
export class MlEngineConfigService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(MlEngineConfig)
    private readonly mlEngineConfigRepository: Repository<MlEngineConfig>,
    private readonly mlModelsService: MlModelsService,
    private readonly mlReadinessService: MlReadinessService,
    private readonly mlGovernanceRulesService: MlGovernanceRulesService,
  ) {}

  async onApplicationBootstrap() {
    const existing = await this.findActiveEntity()
    if (!existing) await this.mlEngineConfigRepository.save({})
  }

  private async findActiveEntity() {
    const [config] = await this.mlEngineConfigRepository.find({
      order: { id_config: 'ASC' },
      take: 1,
    })
    return config
  }

  async getActive(): Promise<MlEngineConfig> {
    const config = await this.findActiveEntity()
    if (config) return config
    return this.mlEngineConfigRepository.save({})
  }

  async getActiveResponse() {
    const config = await this.getActive()
    return {
      status: 'Success',
      mensaje: 'Consulta de configuración del motor de ML exitosa',
      config: plainToInstance(ResponseMlEngineConfigDto, config, {
        excludeExtraneousValues: true,
      }),
    }
  }

  private async validate(updated: MlEngineConfig, engineChanged: boolean) {
    if (
      Number(updated.prob_medium_threshold) >=
      Number(updated.prob_high_threshold)
    )
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'prob_medium_threshold debe ser menor que prob_high_threshold',
      })
    if (!engineChanged) return
    const [activeModel, readiness] = await Promise.all([
      this.mlModelsService.findActiveEntity(),
      this.mlReadinessService.evaluate(),
    ])
    const reason = this.mlGovernanceRulesService.checkEngineChange(
      updated.engine,
      { hasActiveModel: !!activeModel, ready: readiness.ready },
    )
    if (reason)
      throw new BadRequestException({ status: 'Error', mensaje: reason })
  }

  async update(updateMlEngineConfigDto: UpdateMlEngineConfigDto) {
    const config = await this.getActive()
    const previousEngine = config.engine
    const updated = this.mlEngineConfigRepository.merge(
      config,
      updateMlEngineConfigDto,
    )
    await this.validate(updated, updated.engine !== previousEngine)
    await this.mlEngineConfigRepository.save(updated)
    return {
      status: 'Success',
      mensaje: 'Configuración del motor de ML actualizada con éxito',
      config: plainToInstance(ResponseMlEngineConfigDto, updated, {
        excludeExtraneousValues: true,
      }),
    }
  }
}
