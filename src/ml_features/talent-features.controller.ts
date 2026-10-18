import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { FilterAthleteSeasonFeaturesDto } from './dto/filter-athlete-season-features.dto'
import { TalentFeaturesService } from './talent-features.service'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DIRECTOR_TECNICO')
@ApiTags('ML - Dataset de talento')
@ApiBearerAuth('bearerAuth')
@Controller('ml/talent-features')
export class TalentFeaturesController {
  constructor(private readonly talentFeaturesService: TalentFeaturesService) {}

  @Post('rebuild')
  @ApiOperation({
    summary:
      'Reconstruir el dataset de talento: una fila por deportista y temporada con su índice, y la etiqueta de ascenso real según su categoría en la temporada siguiente',
  })
  rebuild() {
    return this.talentFeaturesService.rebuildResponse()
  }

  @Get()
  @ApiOperation({ summary: 'Consultar el dataset de talento' })
  @ApiQuery({ type: FilterAthleteSeasonFeaturesDto })
  findAll(@Query() filters: FilterAthleteSeasonFeaturesDto) {
    return this.talentFeaturesService.findBySeason(filters.id_season)
  }
}
