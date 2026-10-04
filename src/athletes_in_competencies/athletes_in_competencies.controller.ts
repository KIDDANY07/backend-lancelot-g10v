import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  UseGuards,
  Put,
} from '@nestjs/common'
import { AthletesInCompetenciesService } from './athletes_in_competencies.service'
import { CreateAthletesInCompetencyDto } from './dto/create-athletes_in_competency.dto'
import { UpdateAthletesInCompetencyDto } from './dto/update-athletes_in_competency.dto'
import { FilterAthInComp } from './dto/filter-athletes_in_competencies.dto'
import { GetUser } from 'src/auth/decorators/get-user.decorator'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import {
  AthleteInCompetencyResponseDto,
  AthleteInCompetencyUpdateResponseDto,
  AthletesInCompetenciesPaginatedResponseDto,
  MessageResponseDto,
} from 'src/common/dto/api-response.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Asignaciones a competencias')
@ApiBearerAuth('bearerAuth')
@ApiUnauthorizedResponse({ description: 'JWT ausente, inválido o expirado.' })
@ApiInternalServerErrorResponse({ description: 'Error interno no controlado.' })
@Controller('athletes-in-competencies')
export class AthletesInCompetenciesController {
  constructor(
    private readonly athletesInCompetenciesService: AthletesInCompetenciesService,
  ) {}

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD')
  @Get()
  @ApiOperation({
    summary: 'Listar asignaciones a competencias',
    description:
      'Disponible para ADMIN, DIRECTOR_TECNICO, ENTRENADOR y ENCARGADO_SALUD.',
  })
  @ApiQuery({ type: FilterAthInComp })
  @ApiOkResponse({ type: AthletesInCompetenciesPaginatedResponseDto })
  @ApiNotFoundResponse({ description: 'No hay asignaciones registradas.' })
  findAll(@Query() filters: FilterAthInComp) {
    return this.athletesInCompetenciesService.findAll(filters)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD')
  @Get('id/:id')
  @ApiOperation({
    summary: 'Consultar asignación por ID',
    description:
      'Disponible para ADMIN, DIRECTOR_TECNICO, ENTRENADOR y ENCARGADO_SALUD.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: AthleteInCompetencyResponseDto })
  @ApiNotFoundResponse({ description: 'La asignación no existe.' })
  findOneById(@Param('id', ParseIntPipe) id_ath_comp: number) {
    return this.athletesInCompetenciesService.getById(id_ath_comp)
  }

  @Roles('DEPORTISTA')
  @Get('me')
  @ApiOperation({
    summary: 'Consultar mi competencia',
    description: 'El usuario se obtiene del JWT.',
  })
  @ApiOkResponse({ type: AthleteInCompetencyResponseDto })
  @ApiNotFoundResponse({
    description: 'No existe una asignación para el usuario autenticado.',
  })
  findOneByUserId(@GetUser('id_user') id_user: number) {
    return this.athletesInCompetenciesService.getByUserId(id_user)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Post()
  @ApiOperation({ summary: 'Asignar deportista a competencia' })
  @ApiCreatedResponse({ type: AthleteInCompetencyResponseDto })
  @ApiBadRequestResponse({
    description:
      'El usuario no existe, no es deportista, ya está asignado o el cuerpo no es válido.',
  })
  create(@Body() createAthletesInCompetencyDto: CreateAthletesInCompetencyDto) {
    return this.athletesInCompetenciesService.create(
      createAthletesInCompetencyDto,
    )
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Put('id/:id')
  @ApiOperation({
    summary: 'Actualizar asignación a competencia',
    description: 'La implementación actual devuelve `athInCat`.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: AthleteInCompetencyUpdateResponseDto })
  @ApiBadRequestResponse({
    description: 'La combinación ya existe o el cuerpo no es válido.',
  })
  @ApiNotFoundResponse({ description: 'La asignación no existe.' })
  update(
    @Param('id', ParseIntPipe) id_ath_comp: number,
    @Body() updateAthletesInCompetencyDto: UpdateAthletesInCompetencyDto,
  ) {
    return this.athletesInCompetenciesService.update(
      id_ath_comp,
      updateAthletesInCompetencyDto,
    )
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Delete('id/:id')
  @ApiOperation({ summary: 'Eliminar asignación a competencia' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiNotFoundResponse({ description: 'La asignación no existe.' })
  delete(@Param('id', ParseIntPipe) id_ath_comp: number) {
    return this.athletesInCompetenciesService.delete(id_ath_comp)
  }
}
