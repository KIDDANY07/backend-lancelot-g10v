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
import {
  SUPPORTING_CRITERIA_COUNT,
  TalentDetectionThresholds,
} from 'src/talent_flags/talent-detection-rules.service'
import { ResponseTalentRuleConfigDto } from './dto/response-talent-rule-config.dto'
import { UpdateTalentRuleConfigDto } from './dto/update-talent-rule-config.dto'
import { TalentRuleConfig } from './entities/talent-rule-config.entity'

@Injectable()
export class TalentRuleConfigService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(TalentRuleConfig)
    private readonly talentRuleConfigRepository: Repository<TalentRuleConfig>,
    private readonly categoriesService: CategoriesService,
  ) {}

  async onApplicationBootstrap() {
    const existing = await this.findActiveEntity()
    if (!existing)
      await this.talentRuleConfigRepository.save({ id_category: null })
  }

  private async findActiveEntity() {
    const [config] = await this.talentRuleConfigRepository.find({
      where: { id_category: IsNull() },
      order: { id_config: 'ASC' },
      take: 1,
    })
    return config
  }

  private async findCategoryEntity(id_category: number) {
    return this.talentRuleConfigRepository.findOne({ where: { id_category } })
  }

  private async getGlobal(): Promise<TalentRuleConfig> {
    const config = await this.findActiveEntity()
    if (config) return config
    return this.talentRuleConfigRepository.save({ id_category: null })
  }

  private async assertCategoryExists(id_category: number) {
    const category = await this.categoriesService.findOneById(id_category)
    if (!category)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta categoría',
      })
  }

  private toResponse(config: TalentRuleConfig) {
    return plainToInstance(
      ResponseTalentRuleConfigDto,
      { ...config, scope: config.id_category ? 'category' : 'global' },
      { excludeExtraneousValues: true },
    )
  }

  toThresholds(config: TalentRuleConfig): TalentDetectionThresholds {
    return {
      min_percentile: Number(config.min_percentile),
      min_dimension_score: Number(config.min_dimension_score),
      min_improvement_delta: Number(config.min_improvement_delta),
      min_participation_score: Number(config.min_participation_score),
      exclude_severe_injury: Boolean(config.exclude_severe_injury),
      min_supporting_criteria: Number(config.min_supporting_criteria),
      near_max_age_months: Number(config.near_max_age_months),
    }
  }

  async getActive(
    id_category?: number | null,
  ): Promise<ScopedConfig<TalentRuleConfig>> {
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
          ? 'Consulta de configuración de detección de talento de la categoría exitosa'
          : 'Consulta de configuración de detección de talento exitosa',
      config: this.toResponse(config),
    }
  }

  async findCategoryOverrides() {
    const overrides = await this.talentRuleConfigRepository.find({
      where: { id_category: Not(IsNull()) },
      order: { id_category: 'ASC' },
    })
    if (overrides.length === 0)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay configuraciones de detección de talento por categoría',
      })
    return {
      status: 'Success',
      mensaje:
        'Consulta de configuraciones de detección de talento por categoría exitosa',
      configs: overrides.map((config) => this.toResponse(config)),
    }
  }

  private validate(updated: TalentRuleConfig) {
    if (Number(updated.min_supporting_criteria) > SUPPORTING_CRITERIA_COUNT)
      throw new BadRequestException({
        status: 'Error',
        mensaje: `min_supporting_criteria no puede ser mayor que ${SUPPORTING_CRITERIA_COUNT} (criterios de soporte existentes)`,
      })
    if (
      Number(updated.min_participation_score) <
      Number(updated.min_dimension_score)
    )
      throw new BadRequestException({
        status: 'Error',
        mensaje:
          'min_participation_score no puede ser menor que min_dimension_score: la disponibilidad debe exigir al menos el piso de cada dimensión',
      })
  }

  async update(
    updateTalentRuleConfigDto: UpdateTalentRuleConfigDto,
    id_category?: number,
  ) {
    let config: TalentRuleConfig
    let created = false
    if (id_category) {
      await this.assertCategoryExists(id_category)
      const existing = await this.findCategoryEntity(id_category)
      if (existing) config = existing
      else {
        const global = await this.getGlobal()
        config = this.talentRuleConfigRepository.create({
          id_category,
          min_percentile: global.min_percentile,
          min_dimension_score: global.min_dimension_score,
          min_improvement_delta: global.min_improvement_delta,
          min_participation_score: global.min_participation_score,
          exclude_severe_injury: global.exclude_severe_injury,
          min_supporting_criteria: global.min_supporting_criteria,
          near_max_age_months: global.near_max_age_months,
        })
        created = true
      }
    } else config = await this.getGlobal()

    const updated = this.talentRuleConfigRepository.merge(
      config,
      updateTalentRuleConfigDto,
    )
    this.validate(updated)
    const saved = await this.talentRuleConfigRepository.save(updated)

    let mensaje = 'Configuración de detección de talento actualizada con éxito'
    if (created)
      mensaje =
        'Configuración de detección de talento de la categoría creada con éxito'
    else if (id_category)
      mensaje =
        'Configuración de detección de talento de la categoría actualizada con éxito'
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
          'Esta categoría no tiene una configuración propia de detección de talento',
      })
    await this.talentRuleConfigRepository.remove(config)
    return {
      status: 'Success',
      mensaje:
        'Configuración de la categoría eliminada; la categoría vuelve a usar la configuración global',
    }
  }
}
