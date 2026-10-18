import { Controller, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { AiPipelineService } from './ai-pipeline.service'

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
}
