import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { FilterWeightedProgressIndexDto } from './dto/filter-weighted-progress-index.dto'
import { RecalculateWeightedProgressIndexDto } from './dto/recalculate-weighted-progress-index.dto'
import { ResponseWeightedProgressIndexDto } from './dto/response-weighted-progress-index.dto'
import { WeightedProgressIndexService } from './weighted-progress-index.service'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
@ApiTags('Índice de progreso ponderado')
@ApiBearerAuth('bearerAuth')
@Controller('progress-index')
export class WeightedProgressIndexController {
  constructor(
    private readonly weightedProgressIndexService: WeightedProgressIndexService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar índices de progreso ponderado' })
  @ApiQuery({ type: FilterWeightedProgressIndexDto })
  findAll(@Query() filters: FilterWeightedProgressIndexDto) {
    return this.weightedProgressIndexService.findAll(filters)
  }

  @Get('id/:id')
  @ApiOperation({ summary: 'Consultar un índice de progreso ponderado por ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ResponseWeightedProgressIndexDto })
  getById(@Param('id', ParseIntPipe) id_index: number) {
    return this.weightedProgressIndexService.getById(id_index)
  }

  @Post('recalculate-season/:id_season')
  @Roles('ADMIN', 'DIRECTOR_TECNICO')
  @ApiOperation({
    summary:
      'Recalcular el índice de progreso de todos los deportistas asignados a categorías en una temporada',
  })
  @ApiParam({ name: 'id_season', type: Number })
  recalculateSeason(@Param('id_season', ParseIntPipe) id_season: number) {
    return this.weightedProgressIndexService.recalculateForSeason(id_season)
  }

  @Post('recalculate/:id_user')
  @ApiOperation({
    summary:
      'Recalcular el índice de progreso ponderado de un deportista en una temporada',
  })
  @ApiParam({ name: 'id_user', type: Number })
  recalculate(
    @Param('id_user', ParseIntPipe) id_user: number,
    @Body() recalculateDto: RecalculateWeightedProgressIndexDto,
  ) {
    return this.weightedProgressIndexService.calculateForAthleteSeason(
      id_user,
      recalculateDto.id_season,
    )
  }
}
