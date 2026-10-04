import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { AcwrConfigService } from 'src/acwr_config/acwr-config.service'
import { AthletesInCategoriesService } from 'src/athletes_in_categories/athletes_in_categories.service'
import { CategoriesService } from 'src/categories/categories.service'
import { addDaysToKey, daysBetween, todayKey } from 'src/common/utils/date.util'
import { UsersService } from 'src/users/users.service'
import { CHRONIC_WINDOW_DAYS } from './acwr-calculator.service'
import { LoadRecordsService } from './load-records.service'
import { LoadSeriesService } from './load-series.service'

export const DEFAULT_SERIES_DAYS = 90
export const MAX_SERIES_DAYS = 366

@Injectable()
export class LoadMonitoringService {
  constructor(
    private readonly usersService: UsersService,
    private readonly categoriesService: CategoriesService,
    private readonly athletesInCategoriesService: AthletesInCategoriesService,
    private readonly acwrConfigService: AcwrConfigService,
    private readonly loadRecordsService: LoadRecordsService,
    private readonly loadSeriesService: LoadSeriesService,
  ) {}

  private async resolveThresholds(id_category?: number | null) {
    const { config, scope } =
      await this.acwrConfigService.getActive(id_category)
    return {
      low_min: Number(config.low_min),
      low_max: Number(config.low_max),
      medium_max: Number(config.medium_max),
      scope,
    }
  }

  async getAthleteSeries(
    id_user: number,
    fromInput?: string,
    toInput?: string,
  ) {
    const to = toInput ?? todayKey()
    const from = fromInput ?? addDaysToKey(to, -(DEFAULT_SERIES_DAYS - 1))
    if (from > to)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'La fecha inicial no puede ser posterior a la final',
      })
    if (daysBetween(from, to) + 1 > MAX_SERIES_DAYS)
      throw new BadRequestException({
        status: 'Error',
        mensaje: `El rango no puede superar ${MAX_SERIES_DAYS} días`,
      })

    const athlete = await this.usersService.findOneById(id_user)
    if (!athlete)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este deportista',
      })
    if (athlete.role?.name !== 'DEPORTISTA')
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'El usuario indicado no es un deportista',
      })

    const assignment =
      await this.athletesInCategoriesService.findActiveSeasonAssignment(id_user)
    const thresholds = await this.resolveThresholds(assignment?.id_category)
    const records = await this.loadRecordsService.getRecords(
      id_user,
      addDaysToKey(from, -(CHRONIC_WINDOW_DAYS - 1)),
      to,
    )
    return {
      status: 'Success',
      mensaje: 'Consulta de la serie de carga y ACWR exitosa',
      athlete: {
        id_user,
        id_category: assignment?.id_category ?? null,
      },
      thresholds,
      series: this.loadSeriesService.buildSeries(records, from, to, thresholds),
    }
  }

  async getCategoryAcwr(id_category: number, dateInput?: string) {
    const category = await this.categoriesService.findOneById(id_category)
    if (!category)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta categoría',
      })
    const date = dateInput ?? todayKey()
    const { season, roster } =
      await this.athletesInCategoriesService.findActiveSeasonRoster(id_category)
    const thresholds = await this.resolveThresholds(id_category)
    if (!season)
      return {
        status: 'Success',
        mensaje: 'No hay una temporada activa; no hay plantilla para mostrar',
        category: { id_category, name: category.name },
        season: null,
        date,
        thresholds,
        athletes: [],
      }

    const weekStart = addDaysToKey(date, -6)
    const athletes: Record<string, unknown>[] = []
    for (const assignment of roster) {
      const records = await this.loadRecordsService.getRecords(
        assignment.id_user,
        addDaysToKey(date, -(CHRONIC_WINDOW_DAYS - 1)),
        date,
      )
      const [point] = this.loadSeriesService.buildSeries(
        records,
        date,
        date,
        thresholds,
      )
      athletes.push({
        id_user: assignment.id_user,
        name: assignment.user?.name ?? null,
        lastname: assignment.user?.lastname ?? null,
        position: assignment.position ?? null,
        daily_load: point.daily_load,
        acute_load: point.acute_load,
        chronic_load: point.chronic_load,
        acwr: point.acwr,
        level: point.level,
        sessions_7d: records.filter((r) => r.date >= weekStart).length,
      })
    }
    athletes.sort(
      (a, b) =>
        ((b.acwr as number | null) ?? -1) - ((a.acwr as number | null) ?? -1),
    )

    return {
      status: 'Success',
      mensaje: 'Consulta del ACWR de la categoría exitosa',
      category: { id_category, name: category.name },
      season: { id_season: season.id_season, name: season.name },
      date,
      thresholds,
      athletes,
    }
  }
}
