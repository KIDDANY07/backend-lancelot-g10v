import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { plainToInstance } from 'class-transformer'
import { IsNull, Not, Repository } from 'typeorm'
import { CategoriesService } from 'src/categories/categories.service'
import {
  ScopedConfig,
  resolveScopedConfig,
} from 'src/common/scoped_config/scoped-config'
import { ResponseInjuryRiskRuleConfigDto } from './dto/response-injury-risk-rule-config.dto'
import { UpdateInjuryRiskRuleConfigDto } from './dto/update-injury-risk-rule-config.dto'
import { InjuryRiskRuleConfig } from './entities/injury-risk-rule-config.entity'

@Injectable()
export class InjuryRiskRuleConfigService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(InjuryRiskRuleConfig)
    private readonly injuryRiskRuleConfigRepository: Repository<InjuryRiskRuleConfig>,
    private readonly categoriesService: CategoriesService,
  ) {}

  async onApplicationBootstrap() {
    const existing = await this.findActiveEntity()
    if (!existing)
      await this.injuryRiskRuleConfigRepository.save({ id_category: null })
  }

  private async findActiveEntity() {
    const [config] = await this.injuryRiskRuleConfigRepository.find({
      where: { id_category: IsNull() },
      order: { id_config: 'ASC' },
      take: 1,
    })
    return config
  }

  private async findCategoryEntity(id_category: number) {
    return this.injuryRiskRuleConfigRepository.findOne({
      where: { id_category },
    })
  }

  private async getGlobal(): Promise<InjuryRiskRuleConfig> {
    const config = await this.findActiveEntity()
    if (config) return config
    return this.injuryRiskRuleConfigRepository.save({ id_category: null })
  }

  private async assertCategoryExists(id_category: number) {
    const category = await this.categoriesService.findOneById(id_category)
    if (!category)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta categoría',
      })
  }

  private toResponse(config: InjuryRiskRuleConfig) {
    return plainToInstance(
      ResponseInjuryRiskRuleConfigDto,
      { ...config, scope: config.id_category ? 'category' : 'global' },
      { excludeExtraneousValues: true },
    )
  }

  async getActive(
    id_category?: number | null,
  ): Promise<ScopedConfig<InjuryRiskRuleConfig>> {
    const categoryConfig = id_category
      ? await this.findCategoryEntity(id_category)
      : null
    return resolveScopedConfig(categoryConfig, () => this.getGlobal())
  }

  async getActiveResponse(id_category?: number) {
    if (id_category) await this.assertCategoryExists(id_category)
    const { config, scope } = await this.getActive(id_category)
    return {
      status: 'Success',
      mensaje:
        scope === 'category'
          ? 'Consulta de configuración de reglas de riesgo de lesión de la categoría exitosa'
          : 'Consulta de configuración de reglas de riesgo de lesión exitosa',
      config: this.toResponse(config),
    }
  }

  async findCategoryOverrides() {
    const overrides = await this.injuryRiskRuleConfigRepository.find({
      where: { id_category: Not(IsNull()) },
      order: { id_category: 'ASC' },
    })
    if (overrides.length === 0)
      throw new NotFoundException({
        status: 'Error',
        mensaje:
          'No hay configuraciones de reglas de riesgo de lesión por categoría',
      })
    return {
      status: 'Success',
      mensaje:
        'Consulta de configuraciones de reglas de riesgo de lesión por categoría exitosa',
      configs: overrides.map((config) => this.toResponse(config)),
    }
  }

  private validate(updated: InjuryRiskRuleConfig) {
    if (
      Number(updated.sustained_acwr_min_days) >
      Number(updated.sustained_acwr_lookback_days)
    )
      throw new BadRequestException({
        status: 'Error',
        mensaje:
          'sustained_acwr_min_days no puede ser mayor que sustained_acwr_lookback_days',
      })
    if (
      Number(updated.sustained_rpe_min_sessions) >
      Number(updated.sustained_rpe_lookback_days)
    )
      throw new BadRequestException({
        status: 'Error',
        mensaje:
          'sustained_rpe_min_sessions no puede ser mayor que sustained_rpe_lookback_days',
      })
  }

  async update(
    updateInjuryRiskRuleConfigDto: UpdateInjuryRiskRuleConfigDto,
    id_category?: number,
  ) {
    let config: InjuryRiskRuleConfig
    let created = false
    if (id_category) {
      await this.assertCategoryExists(id_category)
      const existing = await this.findCategoryEntity(id_category)
      if (existing) config = existing
      else {
        const global = await this.getGlobal()
        config = this.injuryRiskRuleConfigRepository.create({
          id_category,
          sustained_acwr_threshold: global.sustained_acwr_threshold,
          sustained_acwr_min_days: global.sustained_acwr_min_days,
          sustained_acwr_lookback_days: global.sustained_acwr_lookback_days,
          sustained_rpe_threshold: global.sustained_rpe_threshold,
          sustained_rpe_min_sessions: global.sustained_rpe_min_sessions,
          sustained_rpe_lookback_days: global.sustained_rpe_lookback_days,
        })
        created = true
      }
    } else config = await this.getGlobal()

    const updated = this.injuryRiskRuleConfigRepository.merge(
      config,
      updateInjuryRiskRuleConfigDto,
    )
    this.validate(updated)
    const saved = await this.injuryRiskRuleConfigRepository.save(updated)

    let mensaje =
      'Configuración de reglas de riesgo de lesión actualizada con éxito'
    if (created)
      mensaje =
        'Configuración de reglas de riesgo de lesión de la categoría creada con éxito'
    else if (id_category)
      mensaje =
        'Configuración de reglas de riesgo de lesión de la categoría actualizada con éxito'
    return {
      status: 'Success',
      mensaje,
      config: this.toResponse(saved),
    }
  }

  async deleteCategoryOverride(id_category?: number) {
    if (!id_category)
      throw new BadRequestException({
        status: 'Error',
        mensaje:
          'Debe indicar id_category; la configuración global no se puede eliminar',
      })
    const config = await this.findCategoryEntity(id_category)
    if (!config)
      throw new NotFoundException({
        status: 'Error',
        mensaje:
          'Esta categoría no tiene una configuración propia de reglas de riesgo de lesión',
      })
    await this.injuryRiskRuleConfigRepository.remove(config)
    return {
      status: 'Success',
      mensaje:
        'Configuración de la categoría eliminada; la categoría vuelve a usar la configuración global',
    }
  }
}
