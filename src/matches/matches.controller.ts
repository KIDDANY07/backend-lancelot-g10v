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
import { MatchesService } from './matches.service'
import { CreateMatchDto } from './dto/create-match.dto'
import { UpdateMatchDto } from './dto/update-match.dto'
import { FilterMatchDto } from './dto/filter-match.dto'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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
  MatchResponseDto,
  MatchesPaginatedResponseDto,
  MessageResponseDto,
} from 'src/common/dto/api-response.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('matches')
@ApiTags('Partidos')
@ApiBearerAuth('bearerAuth')
@ApiUnauthorizedResponse({ description: 'JWT ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'El rol no tiene permiso.' })
@ApiInternalServerErrorResponse({ description: 'Error interno no controlado.' })
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Roles(
    'ADMIN',
    'DIRECTOR_TECNICO',
    'ENTRENADOR',
    'ENCARGADO_SALUD',
    'DEPORTISTA',
  )
  @Get()
  @ApiOperation({
    summary: 'Listar partidos',
    description:
      'Devuelve partidos paginados e incluye los datos de su categoría y competencia.',
  })
  @ApiQuery({ type: FilterMatchDto })
  @ApiOkResponse({ type: MatchesPaginatedResponseDto })
  @ApiNotFoundResponse({
    description: 'No hay partidos que coincidan con los filtros.',
  })
  findAll(@Query() filters: FilterMatchDto) {
    return this.matchesService.findAll(filters)
  }

  @Roles(
    'ADMIN',
    'DIRECTOR_TECNICO',
    'ENTRENADOR',
    'ENCARGADO_SALUD',
    'DEPORTISTA',
  )
  @Get('id/:id')
  @ApiOperation({
    summary: 'Consultar partido por ID',
    description:
      'Devuelve el partido junto con el nombre de su categoría y competencia.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    example: 12,
    description: 'Identificador del partido.',
  })
  @ApiOkResponse({ type: MatchResponseDto })
  @ApiNotFoundResponse({ description: 'El partido no existe.' })
  findOneById(@Param('id', ParseIntPipe) id_match: number) {
    return this.matchesService.getById(id_match)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Post()
  @ApiOperation({
    summary: 'Crear partido',
    description: 'Crea un partido para una categoría y competencia existentes.',
  })
  @ApiBody({ type: CreateMatchDto })
  @ApiCreatedResponse({ type: MatchResponseDto })
  @ApiBadRequestResponse({ description: 'El cuerpo no supera la validación.' })
  @ApiNotFoundResponse({
    description: 'La categoría o competencia indicada no existe.',
  })
  create(@Body() createMatchDto: CreateMatchDto) {
    return this.matchesService.create(createMatchDto)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Put('id/:id')
  @ApiOperation({
    summary: 'Actualizar partido',
    description:
      'Actualiza de forma parcial los datos de un partido existente.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    example: 12,
    description: 'Identificador del partido.',
  })
  @ApiBody({ type: UpdateMatchDto })
  @ApiOkResponse({ type: MatchResponseDto })
  @ApiBadRequestResponse({ description: 'El cuerpo no supera la validación.' })
  @ApiNotFoundResponse({
    description:
      'El partido, la categoría o la competencia indicada no existe.',
  })
  update(
    @Param('id', ParseIntPipe) id_match: number,
    @Body() updateMatchDto: UpdateMatchDto,
  ) {
    return this.matchesService.update(id_match, updateMatchDto)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Delete('id/:id')
  @ApiOperation({
    summary: 'Eliminar partido',
    description: 'Elimina permanentemente un partido existente.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    example: 12,
    description: 'Identificador del partido.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiNotFoundResponse({ description: 'El partido no existe.' })
  delete(@Param('id', ParseIntPipe) id_match: number) {
    return this.matchesService.delete(id_match)
  }
}
