import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
  Put,
} from '@nestjs/common'
import { CompetenciesService } from './competencies.service'
import { CreateCompetencyDto } from './dto/create-competency.dto'
import { UpdateCompetencyDto } from './dto/update-competency.dto'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { FilterCompetency } from './dto/filter-competency.dto'
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
  CompetenciesPaginatedResponseDto,
  CompetencyMutationResponseDto,
  CompetencyResponseDto,
} from 'src/common/dto/api-response.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Competencias')
@ApiBearerAuth('bearerAuth')
@ApiUnauthorizedResponse({ description: 'JWT ausente, inválido o expirado.' })
@ApiInternalServerErrorResponse({ description: 'Error interno no controlado.' })
@Controller('competencies')
export class CompetenciesController {
  constructor(private readonly competenciesService: CompetenciesService) {}

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD')
  @Get()
  @ApiOperation({
    summary: 'Listar competencias',
    description:
      'Devuelve competencias paginadas; requiere rol ADMIN o ENTRENADOR.',
  })
  @ApiQuery({ type: FilterCompetency })
  @ApiOkResponse({ type: CompetenciesPaginatedResponseDto })
  @ApiNotFoundResponse({ description: 'No hay competencias registradas.' })
  @ApiUnauthorizedResponse({ description: 'JWT ausente, inválido o expirado.' })
  findAll(@Query() filters: FilterCompetency) {
    return this.competenciesService.findAll(filters)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD')
  @Get('id/:id')
  @ApiOperation({
    summary: 'Consultar una competencia',
    description: 'Requiere rol ADMIN o ENTRENADOR.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: CompetencyResponseDto })
  @ApiNotFoundResponse({ description: 'La competencia no existe.' })
  findOneById(@Param('id', ParseIntPipe) id_competency: number) {
    return this.competenciesService.getById(id_competency)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Post()
  @ApiOperation({
    summary: 'Crear una competencia',
    description: 'Requiere rol ADMIN o ENTRENADOR.',
  })
  @ApiCreatedResponse({ type: CompetencyMutationResponseDto })
  @ApiBadRequestResponse({ description: 'El cuerpo no supera la validación.' })
  creat(@Body() createCompetencyDto: CreateCompetencyDto) {
    return this.competenciesService.create(createCompetencyDto)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Put('id/:id')
  @ApiOperation({
    summary: 'Actualizar una competencia',
    description:
      'La respuesta actual usa la propiedad `category`; requiere rol ADMIN o ENTRENADOR.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: CompetencyMutationResponseDto })
  @ApiBadRequestResponse({ description: 'El cuerpo no supera la validación.' })
  @ApiNotFoundResponse({ description: 'La competencia no existe.' })
  update(
    @Param('id', ParseIntPipe) id_competency: number,
    @Body() updateCompetencyDto: UpdateCompetencyDto,
  ) {
    return this.competenciesService.update(id_competency, updateCompetencyDto)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Delete('id/:id')
  @ApiOperation({
    summary: 'Eliminar una competencia',
    description:
      'La respuesta actual usa la propiedad `category`; requiere rol ADMIN o ENTRENADOR.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: CompetencyMutationResponseDto })
  @ApiNotFoundResponse({ description: 'La competencia no existe.' })
  delete(@Param('id', ParseIntPipe) id_competency: number) {
    return this.competenciesService.delete(id_competency)
  }
}
