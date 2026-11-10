import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { ResponseMlEngineConfigDto } from './dto/response-ml-engine-config.dto'
import { UpdateMlEngineConfigDto } from './dto/update-ml-engine-config.dto'
import {
  ML_SERVICE_ROLE,
  MlServiceOrJwtGuard,
} from './guards/ml-service-api-key.guard'
import { MlEngineConfigService } from './ml-engine-config.service'
import { MlReadinessService } from './ml-readiness.service'
import { TalentReadinessService } from './talent-readiness.service'

@ApiTags('ML - Motor y readiness')
@ApiBearerAuth('bearerAuth')
@Controller('ml')
export class MlEngineController {
  constructor(
    private readonly mlEngineConfigService: MlEngineConfigService,
    private readonly mlReadinessService: MlReadinessService,
    private readonly talentReadinessService: TalentReadinessService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('engine-config')
  @ApiOperation({
    summary: 'Consultar el modo del motor de riesgo (rules, shadow o ml)',
  })
  @ApiOkResponse({ type: ResponseMlEngineConfigDto })
  getEngineConfig() {
    return this.mlEngineConfigService.getActiveResponse()
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Put('engine-config')
  @ApiOperation({
    summary:
      'Cambiar el modo de los motores de riesgo y de talento (rules, shadow o ml) o sus umbrales. shadow y ml requieren un modelo activo de la tarea; la readiness es informativa y no bloquea el cambio. Los umbrales de probabilidad deben calibrarse con los datos del club',
  })
  @ApiOkResponse({ type: ResponseMlEngineConfigDto })
  updateEngineConfig(@Body() updateMlEngineConfigDto: UpdateMlEngineConfigDto) {
    return this.mlEngineConfigService.update(updateMlEngineConfigDto)
  }

  @UseGuards(MlServiceOrJwtGuard, RolesGuard)
  @Roles('ADMIN', 'ENCARGADO_SALUD', ML_SERVICE_ROLE)
  @Get('readiness')
  @ApiSecurity('mlServiceApiKey')
  @ApiOperation({
    summary:
      'Readiness de la fase 2: datos etiquetados disponibles frente a los mínimos. Los días etiquetados son fechas distintas del calendario (no deportista-día). Los mínimos por defecto (270 días, 20 lesiones sin contacto y 15 deportistas) se ajustaron al tamaño real de la plantilla del club: con unos 15 deportistas no se alcanzan 20 deportistas ni 30 lesiones sin contacto en una temporada. Es informativa: indica si los datos alcanzan para un modelo confiable. Acepta JWT o la cabecera x-api-key del servicio de ML',
  })
  getReadiness() {
    return this.mlReadinessService.getReadinessResponse()
  }

  @UseGuards(MlServiceOrJwtGuard, RolesGuard)
  @Roles('ADMIN', 'DIRECTOR_TECNICO', ML_SERVICE_ROLE)
  @Get('talent-readiness')
  @ApiSecurity('mlServiceApiKey')
  @ApiOperation({
    summary:
      'Readiness del modelo de talento: temporadas etiquetadas con ascensos o consolidaciones reales frente a los mínimos. La unidad es deportista por temporada; el mínimo de 15 deportistas corresponde al tamaño de la plantilla del club. Es informativa. Acepta JWT o la cabecera x-api-key del servicio de ML',
  })
  getTalentReadiness() {
    return this.talentReadinessService.getReadinessResponse()
  }
}
