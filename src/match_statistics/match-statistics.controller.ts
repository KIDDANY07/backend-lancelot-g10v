import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import { GetUser } from 'src/auth/decorators/get-user.decorator'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import {
  assertOwnRecordOrStaff,
  isDeportista,
} from 'src/common/utils/ownership.util'
import { User } from 'src/users/entities/user.entity'
import { CreateMatchStatisticDto } from './dto/create-match-statistic.dto'
import { FilterMatchStatisticDto } from './dto/filter-match-statistic.dto'
import { ResponseMatchStatisticDto } from './dto/response-match-statistic.dto'
import { UpdateMatchStatisticDto } from './dto/update-match-statistic.dto'
import { MatchStatisticsService } from './match-statistics.service'

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Estadísticas de partido')
@ApiBearerAuth('bearerAuth')
@Controller('match-statistics')
export class MatchStatisticsController {
  constructor(
    private readonly matchStatisticsService: MatchStatisticsService,
  ) {}

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'DEPORTISTA')
  @Get()
  @ApiOperation({ summary: 'Listar estadísticas de partido' })
  @ApiQuery({ type: FilterMatchStatisticDto })
  findAll(@Query() filters: FilterMatchStatisticDto, @GetUser() user: User) {
    if (isDeportista(user)) filters.id_user = user.id_user
    return this.matchStatisticsService.findAll(filters)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'DEPORTISTA')
  @Get('id/:id')
  @ApiOperation({ summary: 'Consultar una estadística de partido por ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ResponseMatchStatisticDto })
  async getById(
    @Param('id', ParseIntPipe) id_match_stat: number,
    @GetUser() user: User,
  ) {
    const result = await this.matchStatisticsService.getById(id_match_stat)
    assertOwnRecordOrStaff(user, result.stat.id_user)
    return result
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Post()
  @ApiOperation({ summary: 'Registrar una estadística de partido' })
  @ApiCreatedResponse({ type: ResponseMatchStatisticDto })
  create(@Body() createMatchStatisticDto: CreateMatchStatisticDto) {
    return this.matchStatisticsService.create(createMatchStatisticDto)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Put('id/:id')
  @ApiOperation({ summary: 'Actualizar una estadística de partido' })
  @ApiParam({ name: 'id', type: Number })
  update(
    @Param('id', ParseIntPipe) id_match_stat: number,
    @Body() updateMatchStatisticDto: UpdateMatchStatisticDto,
  ) {
    return this.matchStatisticsService.update(
      id_match_stat,
      updateMatchStatisticDto,
    )
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Delete('id/:id')
  @ApiOperation({ summary: 'Eliminar una estadística de partido' })
  @ApiParam({ name: 'id', type: Number })
  delete(@Param('id', ParseIntPipe) id_match_stat: number) {
    return this.matchStatisticsService.delete(id_match_stat)
  }
}
