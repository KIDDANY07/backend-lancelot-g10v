import { Controller, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { AiPipelineService } from './ai-pipeline.service'
import { FeatureDateRangeDto } from './dto/feature-date-range.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('ML - Análisis inmediato')
@ApiBearerAuth('bearerAuth')
@Controller('ml')
export class AiPipelineController {
  constructor(private readonly aiPipelineService: AiPipelineService) {}

  @Post('run-now')
  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD')
  @ApiOperation({
    summary:
      'Ejecutar ahora el análisis que corre cada noche, con la fecha de hoy: alertas de fatiga, reglas de riesgo, snapshot de variables, predicción del modelo de riesgo (según el modo del motor), etiquetado y dataset de talento. Actualiza las alertas abiertas del día y nunca toca las ya revisadas',
  })
  runNow() {
    return this.aiPipelineService.runNow()
  }

  @Post('rules/backfill')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Reconstruir día por día las alertas de fatiga y las evaluaciones de riesgo por reglas de un rango de fechas pasado, con la categoría de la temporada de cada fecha y el estado de reintegro de ese día. No duplica: hay una alerta y una evaluación por deportista y día, y no toca las ya revisadas',
  })
  @ApiQuery({ type: FeatureDateRangeDto })
  backfillRules(@Query() query: FeatureDateRangeDto) {
    return this.aiPipelineService.backfillRules(query.from, query.to)
  }

  @Post('predictions/backfill')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Reconstruir día por día las predicciones del modelo de riesgo activo para un rango de fechas pasado, según el modo del motor (shadow o ml). Usa los snapshots diarios ya generados',
  })
  @ApiQuery({ type: FeatureDateRangeDto })
  backfillPredictions(@Query() query: FeatureDateRangeDto) {
    return this.aiPipelineService.backfillPredictions(query.from, query.to)
  }
}
