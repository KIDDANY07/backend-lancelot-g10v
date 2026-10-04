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
import { UpdateAcwrThresholdDto } from './dto/update-acwr-threshold.dto'
import { ResponseAcwrThresholdDto } from './dto/response-acwr-threshold.dto'
import { AcwrThreshold } from './entities/acwr-threshold.entity'

@Injectable()
export class AcwrConfigService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(AcwrThreshold)
    private readonly acwrThresholdsRepository: Repository<AcwrThreshold>,
    private readonly categoriesService: CategoriesService,
  ) {}

  async onApplicationBootstrap() {
    const existing = await this.findActiveEntity()
    if (!existing)
      await this.acwrThresholdsRepository.save({ id_category: null })
  }

  private async findActiveEntity() {
    const [threshold] = await this.acwrThresholdsRepository.find({
      where: { id_category: IsNull() },
      order: { id_threshold: 'ASC' },
      take: 1,
    })
    return threshold
  }

  private async findCategoryEntity(id_category: number) {
    return this.acwrThresholdsRepository.findOne({ where: { id_category } })
  }

  private async getGlobal(): Promise<AcwrThreshold> {
    const threshold = await this.findActiveEntity()
    if (threshold) return threshold
    return this.acwrThresholdsRepository.save({ id_category: null })
  }

  private async assertCategoryExists(id_category: number) {
    const category = await this.categoriesService.findOneById(id_category)
    if (!category)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta categoría',
      })
  }

  private toResponse(threshold: AcwrThreshold) {
    return plainToInstance(
      ResponseAcwrThresholdDto,
      { ...threshold, scope: threshold.id_category ? 'category' : 'global' },
      { excludeExtraneousValues: true },
    )
  }

  async getActive(
    id_category?: number | null,
  ): Promise<ScopedConfig<AcwrThreshold>> {
    const categoryThreshold = id_category
      ? await this.findCategoryEntity(id_category)
      : null
    return resolveScopedConfig(categoryThreshold, () => this.getGlobal())
  }

  async getActiveResponse(id_category?: number) {
    if (id_category) await this.assertCategoryExists(id_category)
    const { config, scope } = await this.getActive(id_category)
    return {
      status: 'Success',
      mensaje:
        scope === 'category'
          ? 'Consulta de umbrales de ACWR de la categoría exitosa'
          : 'Consulta de umbrales de ACWR exitosa',
      threshold: this.toResponse(config),
    }
  }

  async findCategoryOverrides() {
    const overrides = await this.acwrThresholdsRepository.find({
      where: { id_category: Not(IsNull()) },
      order: { id_category: 'ASC' },
    })
    if (overrides.length === 0)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay umbrales de ACWR configurados por categoría',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de umbrales de ACWR por categoría exitosa',
      thresholds: overrides.map((threshold) => this.toResponse(threshold)),
    }
  }

  private validate(updated: AcwrThreshold) {
    if (
      Number(updated.low_min) >= Number(updated.low_max) ||
      Number(updated.low_max) >= Number(updated.medium_max)
    )
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'Los umbrales deben cumplir low_min < low_max < medium_max',
      })
  }

  async update(
    updateAcwrThresholdDto: UpdateAcwrThresholdDto,
    id_category?: number,
  ) {
    let threshold: AcwrThreshold
    let created = false
    if (id_category) {
      await this.assertCategoryExists(id_category)
      const existing = await this.findCategoryEntity(id_category)
      if (existing) threshold = existing
      else {
        const global = await this.getGlobal()
        threshold = this.acwrThresholdsRepository.create({
          id_category,
          low_min: global.low_min,
          low_max: global.low_max,
          medium_max: global.medium_max,
        })
        created = true
      }
    } else threshold = await this.getGlobal()

    const updated = this.acwrThresholdsRepository.merge(
      threshold,
      updateAcwrThresholdDto,
    )
    this.validate(updated)
    const saved = await this.acwrThresholdsRepository.save(updated)

    let mensaje = 'Umbrales de ACWR actualizados con éxito'
    if (created) mensaje = 'Umbrales de ACWR de la categoría creados con éxito'
    else if (id_category)
      mensaje = 'Umbrales de ACWR de la categoría actualizados con éxito'
    return {
      status: 'Success',
      mensaje,
      threshold: this.toResponse(saved),
    }
  }

  async deleteCategoryOverride(id_category?: number) {
    if (!id_category)
      throw new BadRequestException({
        status: 'Error',
        mensaje:
          'Debe indicar id_category; la configuración global no se puede eliminar',
      })
    const threshold = await this.findCategoryEntity(id_category)
    if (!threshold)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'Esta categoría no tiene umbrales de ACWR propios',
      })
    await this.acwrThresholdsRepository.remove(threshold)
    return {
      status: 'Success',
      mensaje:
        'Umbrales de la categoría eliminados; la categoría vuelve a usar la configuración global',
    }
  }
}
