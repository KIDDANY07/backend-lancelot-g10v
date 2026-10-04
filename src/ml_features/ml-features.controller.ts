import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import type { Response } from 'express'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import {
  FeatureDateRangeDto,
  OptionalFeatureDateRangeDto,
} from './dto/feature-date-range.dto'
import { FilterAthleteDailyFeaturesDto } from './dto/filter-athlete-daily-features.dto'
import { MlFeaturesService } from './ml-features.service'

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('ML - Variables diarias')
@ApiBearerAuth('bearerAuth')
@Controller('ml')
export class MlFeaturesController {
  constructor(private readonly mlFeaturesService: MlFeaturesService) {}

  @Roles('ADMIN')
  @Post('features/backfill')
  @ApiOperation({
    summary:
      'Reconstruir los snapshots diarios de variables de un rango de fechas a partir de los datos ya cargados (útil cuando el club digita datos tarde) y etiquetar los días maduros',
  })
  @ApiQuery({ type: FeatureDateRangeDto })
  backfill(@Query() query: FeatureDateRangeDto) {
    return this.mlFeaturesService.backfill(query.from, query.to)
  }

  @Roles('ADMIN')
  @Post('features/relabel')
  @ApiOperation({
    summary:
      'Recalcular las etiquetas (lesión sin contacto en los 7 días siguientes) de un rango, p. ej. tras registrar o corregir lesiones tarde',
  })
  @ApiQuery({ type: FeatureDateRangeDto })
  relabel(@Query() query: FeatureDateRangeDto) {
    return this.mlFeaturesService.relabel(query.from, query.to)
  }

  @Roles('ADMIN', 'ENCARGADO_SALUD')
  @Get('features')
  @ApiOperation({ summary: 'Listar snapshots diarios de variables' })
  @ApiQuery({ type: FilterAthleteDailyFeaturesDto })
  findAll(@Query() filters: FilterAthleteDailyFeaturesDto) {
    return this.mlFeaturesService.findAll(filters)
  }

  @Roles('ADMIN', 'ENCARGADO_SALUD')
  @Get('features/export')
  @ApiOperation({
    summary:
      'Exportar el dataset en CSV seudonimizado (sin nombres, correos ni fecha de nacimiento; el deportista se identifica con una clave HMAC)',
  })
  @ApiQuery({ type: FeatureDateRangeDto })
  @ApiProduces('text/csv')
  async exportCsv(
    @Query() query: FeatureDateRangeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.mlFeaturesService.exportCsv(query.from, query.to)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="athlete_daily_features_${query.from}_${query.to}.csv"`,
    )
    return csv
  }

  @Roles('ADMIN', 'ENCARGADO_SALUD')
  @Get('data-quality')
  @ApiOperation({
    summary:
      'Indicadores de calidad de datos: días con snapshot, deportistas con datos, lesiones sin mecanismo, partidos sin RPE y días sin carga por deportista',
  })
  @ApiQuery({ type: OptionalFeatureDateRangeDto })
  getDataQuality(@Query() query: OptionalFeatureDateRangeDto) {
    return this.mlFeaturesService.getDataQuality(query.from, query.to)
  }
}
