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
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import { GetUser } from 'src/auth/decorators/get-user.decorator'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { User } from 'src/users/entities/user.entity'
import { ApplySeasonPlanDto } from './dto/apply-season-plan.dto'
import { SeasonPlanQueryDto } from './dto/season-plan-query.dto'
import { SeasonPlanningService } from './season-planning.service'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
@ApiTags('Planificación del siguiente ciclo')
@ApiBearerAuth('bearerAuth')
@Controller('season-planning')
export class SeasonPlanningController {
  constructor(private readonly seasonPlanningService: SeasonPlanningService) {}

  @Get(':id_season')
  @ApiOperation({
    summary:
      'Proponer el siguiente ciclo de una temporada: categoría por edad, ascenso por talento revisado, dimensión a reforzar y objetivos en curso',
  })
  @ApiParam({ name: 'id_season', type: Number })
  @ApiQuery({ type: SeasonPlanQueryDto })
  getPlan(
    @Param('id_season', ParseIntPipe) id_season: number,
    @Query() query: SeasonPlanQueryDto,
  ) {
    return this.seasonPlanningService.getPlan(id_season, query)
  }

  @Post(':id_season/apply')
  @Roles('ADMIN', 'DIRECTOR_TECNICO')
  @ApiOperation({
    summary:
      'Aplicar el plan: asigna a los deportistas en la temporada destino y lleva sus objetivos en curso',
  })
  @ApiParam({ name: 'id_season', type: Number })
  applyPlan(
    @Param('id_season', ParseIntPipe) id_season: number,
    @Body() applySeasonPlanDto: ApplySeasonPlanDto,
    @GetUser() user: User,
  ) {
    return this.seasonPlanningService.applyPlan(
      id_season,
      applySeasonPlanDto,
      user?.id_user ?? null,
    )
  }
}
