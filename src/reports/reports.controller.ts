import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { ValidationReportQueryDto } from './dto/validation-report-query.dto'
import { ReportsService } from './reports.service'
import { ValidationReportService } from './validation-report.service'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
@ApiTags('Reportes')
@ApiBearerAuth('bearerAuth')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly validationReportService: ValidationReportService,
  ) {}

  @Get('validation')
  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENCARGADO_SALUD')
  @ApiOperation({
    summary:
      'Métricas para la validación del sistema con el club: alertas y evaluaciones por nivel y estado, tasa de descarte, sensibilidad y valor predictivo de la fase 1, aceptación de señalizaciones de talento, modo sombra y calidad de datos. Los cocientes sin denominador se devuelven en null con una advertencia',
  })
  @ApiQuery({ type: ValidationReportQueryDto })
  validation(@Query() query: ValidationReportQueryDto) {
    return this.validationReportService.getValidationReport(
      query.from,
      query.to,
    )
  }

  @Get('season-comparison/:id_user')
  @ApiOperation({
    summary:
      'Comparar la evolución del índice de progreso de un deportista entre todas sus temporadas',
  })
  @ApiParam({ name: 'id_user', type: Number })
  seasonComparison(@Param('id_user', ParseIntPipe) id_user: number) {
    return this.reportsService.getSeasonComparison(id_user)
  }

  @Get('season-summary/:id_user/:id_season')
  @ApiOperation({
    summary: 'Resumen completo de un deportista en una temporada específica',
  })
  @ApiParam({ name: 'id_user', type: Number })
  @ApiParam({ name: 'id_season', type: Number })
  seasonSummary(
    @Param('id_user', ParseIntPipe) id_user: number,
    @Param('id_season', ParseIntPipe) id_season: number,
  ) {
    return this.reportsService.getSeasonSummary(id_user, id_season)
  }
}
