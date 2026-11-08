import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { Category } from 'src/categories/entities/category.entity'
import { todayKey } from 'src/common/utils/date.util'
import { isDeportista } from 'src/common/utils/ownership.util'
import { Season } from 'src/seasons/entities/season.entity'
import { User } from 'src/users/entities/user.entity'
import { UsersService } from 'src/users/users.service'
import { DashboardMetricsService, Period } from './dashboard-metrics.service'
import { Row } from './dashboard-sql.util'
import { DashboardQueryDto } from './dto/dashboard-query.dto'

export interface DashboardScope {
  period: Period
  today: string
  id_season: number | null
  id_category: number | null
  athleteIds: number[]
  isAthlete: boolean
}

@Injectable()
export class DashboardScopeService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Season)
    private readonly seasonsRepository: Repository<Season>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    private readonly usersService: UsersService,
    private readonly metrics: DashboardMetricsService,
  ) {}

  query<T = Row>(sql: string, params: unknown[]): Promise<T[]> {
    return this.dataSource.query(sql, params)
  }

  async resolveScope(
    query: DashboardQueryDto,
    user: User,
  ): Promise<DashboardScope> {
    const today = todayKey()
    let season: Season | null = null
    if (query.id_season) {
      season = await this.seasonsRepository.findOne({
        where: { id_season: query.id_season },
      })
      if (!season)
        throw new NotFoundException({
          status: 'Error',
          mensaje: 'La temporada indicada no existe',
        })
    }
    if (query.id_category) {
      const exists = await this.categoriesRepository.exists({
        where: { id_category: query.id_category },
      })
      if (!exists)
        throw new NotFoundException({
          status: 'Error',
          mensaje: 'La categoría indicada no existe',
        })
    }
    const period = this.metrics.resolvePeriod(query, season, today)
    const isAthlete = isDeportista(user)
    let athleteIds: number[]
    if (isAthlete) athleteIds = [user.id_user]
    else if (query.id_season || query.id_category) {
      const rows = await this.query<{ id_user: number }>(
        `SELECT DISTINCT a.id_user
         FROM athletes_in_categories a
         JOIN users u ON u.id_user = a.id_user
         JOIN roles r ON r.id_role = u.id_role AND r.code = 'DEPORTISTA'
         WHERE ($1::int IS NULL OR a.id_season = $1)
           AND ($2::int IS NULL OR a.id_category = $2)`,
        [query.id_season ?? null, query.id_category ?? null],
      )
      athleteIds = rows.map((row) => Number(row.id_user))
    } else athleteIds = await this.usersService.findAllAthleteIds()
    return {
      period,
      today,
      id_season: query.id_season ?? null,
      id_category: query.id_category ?? null,
      athleteIds,
      isAthlete,
    }
  }

  filters(scope: DashboardScope) {
    return {
      from: scope.period.from,
      to: scope.period.to,
      days: scope.period.days,
      id_season: scope.id_season,
      id_category: scope.id_category,
      athletes_in_scope: scope.athleteIds.length,
      own_data_only: scope.isAthlete,
    }
  }

  baseParams(scope: DashboardScope): unknown[] {
    return [
      scope.period.from,
      scope.period.to,
      scope.athleteIds,
      scope.id_season,
      scope.id_category,
    ]
  }

  async seasonForScope(scope: DashboardScope): Promise<Row | null> {
    const [season] = await this.query(
      `SELECT id_season, name, status,
              to_char(start_date, 'YYYY-MM-DD') AS start_date,
              to_char(end_date, 'YYYY-MM-DD') AS end_date
       FROM seasons
       WHERE ($1::int IS NOT NULL AND id_season = $1)
          OR ($1::int IS NULL AND start_date <= $2 AND (end_date IS NULL OR end_date >= $2))
       ORDER BY start_date DESC
       LIMIT 1`,
      [scope.id_season, scope.period.to],
    )
    return season ?? null
  }
}
