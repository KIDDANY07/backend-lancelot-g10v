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

@ApiTags('ML - Motor y readiness')
@ApiBearerAuth('bearerAuth')
@Controller('ml')
export class MlEngineController {
  constructor(
    private readonly mlEngineConfigService: MlEngineConfigService,
    private readonly mlReadinessService: MlReadinessService,
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
      'Cambiar el modo del motor o sus umbrales. shadow requiere un modelo activo; ml requiere además la readiness. Los umbrales de probabilidad deben calibrarse con los datos del club',
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
      'Readiness de la fase 2: datos etiquetados disponibles frente a los mínimos (aprox. una temporada completa). Acepta JWT o la cabecera x-api-key del servicio de ML',
  })
  getReadiness() {
    return this.mlReadinessService.getReadinessResponse()
  }
}
