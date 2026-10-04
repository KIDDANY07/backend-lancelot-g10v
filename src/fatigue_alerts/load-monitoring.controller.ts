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
import { GetUser } from 'src/auth/decorators/get-user.decorator'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { assertOwnRecordOrStaff } from 'src/common/utils/ownership.util'
import { User } from 'src/users/entities/user.entity'
import {
  AcwrSeriesQueryDto,
  CategoryAcwrQueryDto,
} from './dto/acwr-series-query.dto'
import { LoadMonitoringService } from './load-monitoring.service'

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Monitoreo de carga')
@ApiBearerAuth('bearerAuth')
@Controller('load-monitoring')
export class LoadMonitoringController {
  constructor(private readonly loadMonitoringService: LoadMonitoringService) {}

  @Roles(
    'ADMIN',
    'DIRECTOR_TECNICO',
    'ENTRENADOR',
    'ENCARGADO_SALUD',
    'DEPORTISTA',
  )
  @Get('acwr/athlete/:id_user')
  @ApiOperation({
    summary:
      'Serie diaria de carga (RPE x minutos) y ACWR de un deportista con los umbrales de su categoría. El deportista solo puede consultar la suya',
  })
  @ApiParam({ name: 'id_user', type: Number })
  @ApiQuery({ type: AcwrSeriesQueryDto })
  athleteSeries(
    @Param('id_user', ParseIntPipe) id_user: number,
    @Query() query: AcwrSeriesQueryDto,
    @GetUser() user: User,
  ) {
    assertOwnRecordOrStaff(user, id_user)
    return this.loadMonitoringService.getAthleteSeries(
      id_user,
      query.from,
      query.to,
    )
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD')
  @Get('acwr/category/:id_category')
  @ApiOperation({
    summary:
      'ACWR del día de cada deportista de una categoría en la temporada activa, ordenado de mayor a menor',
  })
  @ApiParam({ name: 'id_category', type: Number })
  @ApiQuery({ type: CategoryAcwrQueryDto })
  categoryAcwr(
    @Param('id_category', ParseIntPipe) id_category: number,
    @Query() query: CategoryAcwrQueryDto,
  ) {
    return this.loadMonitoringService.getCategoryAcwr(id_category, query.date)
  }
}
