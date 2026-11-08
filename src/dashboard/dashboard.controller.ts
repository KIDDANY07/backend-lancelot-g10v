import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { GetUser } from 'src/auth/decorators/get-user.decorator'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { User } from 'src/users/entities/user.entity'
import { DashboardInsightsService } from './dashboard-insights.service'
import { DashboardService } from './dashboard.service'
import { DashboardQueryDto } from './dto/dashboard-query.dto'

const STAFF = [
  'ADMIN',
  'DIRECTOR_TECNICO',
  'ENTRENADOR',
  'ENCARGADO_SALUD',
] as const

export const DASHBOARD_ROLES = {
  overview: [...STAFF, 'DEPORTISTA'],
  load: [...STAFF, 'DEPORTISTA'],
  byCategory: [...STAFF],
  bySeason: [...STAFF],
  injuryRisk: [...STAFF],
  training: [...STAFF, 'DEPORTISTA'],
  matches: [...STAFF, 'DEPORTISTA'],
  health: ['ADMIN', 'ENTRENADOR', 'ENCARGADO_SALUD'],
  development: ['ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'DEPORTISTA'],
  ml: ['ADMIN', 'DIRECTOR_TECNICO', 'ENCARGADO_SALUD'],
} as const

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Tablero')
@ApiBearerAuth('bearerAuth')
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly insights: DashboardInsightsService,
  ) {}

  @Get('overview')
  @Roles(...DASHBOARD_ROLES.overview)
  @ApiOperation({
    summary:
      'Resumen de la temporada y categoría: deportistas, sesiones, carga media, alertas de fatiga abiertas y lesiones activas. El deportista solo ve sus datos',
  })
  overview(@Query() query: DashboardQueryDto, @GetUser() user: User) {
    return this.dashboardService.getOverview(query, user)
  }

  @Get('load')
  @Roles(...DASHBOARD_ROLES.load)
  @ApiOperation({
    summary:
      'Evolución de la carga (session-RPE) y del ACWR promedio, diaria hasta 92 días y semanal en periodos más largos. El deportista solo ve su serie',
  })
  load(@Query() query: DashboardQueryDto, @GetUser() user: User) {
    return this.dashboardService.getLoad(query, user)
  }

  @Get('by-category')
  @Roles(...DASHBOARD_ROLES.byCategory)
  @ApiOperation({
    summary:
      'Indicadores de cada categoría en la temporada: deportistas, sesiones, carga y RPE medio, cobertura de RPE, alertas, deportistas en riesgo, lesiones activas, índice de progreso y señalizaciones de talento abiertas',
  })
  byCategory(@Query() query: DashboardQueryDto, @GetUser() user: User) {
    return this.dashboardService.getByCategory(query, user)
  }

  @Get('by-season')
  @Roles(...DASHBOARD_ROLES.bySeason)
  @ApiOperation({
    summary:
      'Comparación entre temporadas (opcionalmente de una categoría): deportistas, sesiones, partidos, carga y RPE medio, lesiones, índice de progreso y señalizaciones de talento',
  })
  bySeason(@Query() query: DashboardQueryDto, @GetUser() user: User) {
    return this.dashboardService.getBySeason(query, user)
  }

  @Get('injury-risk')
  @Roles(...DASHBOARD_ROLES.injuryRisk)
  @ApiOperation({
    summary:
      'Deportistas con evaluaciones de riesgo de lesión abiertas de nivel medio o alto en el periodo, con sus factores en español',
  })
  injuryRisk(@Query() query: DashboardQueryDto, @GetUser() user: User) {
    return this.dashboardService.getInjuryRisk(query, user)
  }

  @Get('training')
  @Roles(...DASHBOARD_ROLES.training)
  @ApiOperation({
    summary:
      'Entrenamiento: sesiones, carga y RPE por tipo de sesión, sesiones por día de la semana y distribución del RPE. El deportista solo ve sus datos',
  })
  training(@Query() query: DashboardQueryDto, @GetUser() user: User) {
    return this.insights.getTraining(query, user)
  }

  @Get('matches')
  @Roles(...DASHBOARD_ROLES.matches)
  @ApiOperation({
    summary:
      'Partidos: totales de estadísticas, partidos, goles y asistencias por mes, partidos por competencia y deportistas con más goles, asistencias y minutos. El deportista solo ve sus datos',
  })
  matches(@Query() query: DashboardQueryDto, @GetUser() user: User) {
    return this.insights.getMatches(query, user)
  }

  @Get('health')
  @Roles(...DASHBOARD_ROLES.health)
  @ApiOperation({
    summary:
      'Salud: lesiones por mes y mecanismo, zona del cuerpo y severidad, alertas de fatiga y de riesgo por semana. Los registros de salud y los consentimientos solo para ADMIN y ENCARGADO_SALUD. Sin diagnósticos',
  })
  health(@Query() query: DashboardQueryDto, @GetUser() user: User) {
    return this.insights.getHealth(query, user)
  }

  @Get('development')
  @Roles(...DASHBOARD_ROLES.development)
  @ApiOperation({
    summary:
      'Desarrollo: evaluaciones técnicas por indicador y por mes, evaluaciones físicas por etapa, índice de progreso (distribución y componentes), señalizaciones de talento y objetivos de desarrollo. El deportista solo ve sus datos y no ve las señalizaciones de talento',
  })
  development(@Query() query: DashboardQueryDto, @GetUser() user: User) {
    return this.insights.getDevelopment(query, user)
  }

  @Get('ml')
  @Roles(...DASHBOARD_ROLES.ml)
  @ApiOperation({
    summary:
      'Modelo de ML: modo del motor, modelos registrados frente a la línea base de reglas, predicciones por día y su distribución, calidad de etiquetas, readiness y predicciones de talento',
  })
  ml(@Query() query: DashboardQueryDto, @GetUser() user: User) {
    return this.insights.getMl(query, user)
  }
}
