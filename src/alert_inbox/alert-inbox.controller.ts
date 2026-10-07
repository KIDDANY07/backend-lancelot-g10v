import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { AlertInboxService } from './alert-inbox.service'
import { FilterAlertInboxDto } from './dto/filter-alert-inbox.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD')
@ApiTags('Bandeja de alertas')
@ApiBearerAuth('bearerAuth')
@Controller('alerts')
export class AlertInboxController {
  constructor(private readonly alertInboxService: AlertInboxService) {}

  @Get('inbox')
  @ApiOperation({
    summary:
      'Bandeja unificada y paginada de alertas de fatiga y evaluaciones de riesgo, ordenada por nivel (alto primero) y fecha. Incluye los conteos por tipo y por nivel del estado consultado',
  })
  @ApiQuery({ type: FilterAlertInboxDto })
  findAll(@Query() filters: FilterAlertInboxDto) {
    return this.alertInboxService.findAll(filters)
  }
}
