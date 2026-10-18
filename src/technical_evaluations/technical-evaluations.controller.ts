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
import { assertOwnRecordOrStaff, isDeportista } from 'src/common/utils/ownership.util'
import { User } from 'src/users/entities/user.entity'
import { CreateTechnicalEvaluationDto } from './dto/create-technical-evaluation.dto'
import { FilterTechnicalEvaluationDto } from './dto/filter-technical-evaluation.dto'
import { ResponseTechnicalEvaluationDto } from './dto/response-technical-evaluation.dto'
import { UpdateTechnicalEvaluationDto } from './dto/update-technical-evaluation.dto'
import { TechnicalEvaluationsService } from './technical-evaluations.service'

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Evaluaciones técnicas')
@ApiBearerAuth('bearerAuth')
@Controller('technical-evaluations')
export class TechnicalEvaluationsController {
  constructor(
    private readonly technicalEvaluationsService: TechnicalEvaluationsService,
  ) {}

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'DEPORTISTA')
  @Get()
  @ApiOperation({ summary: 'Listar evaluaciones técnicas' })
  @ApiQuery({ type: FilterTechnicalEvaluationDto })
  findAll(
    @Query() filters: FilterTechnicalEvaluationDto,
    @GetUser() user: User,
  ) {
    if (isDeportista(user)) filters.id_user = user.id_user
    return this.technicalEvaluationsService.findAll(filters)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'DEPORTISTA')
  @Get('catalog')
  @ApiOperation({
    summary:
      'Catálogo fijo de indicadores de cada dimensión (técnica y táctica) con los que se registra una evaluación',
  })
  getCatalog() {
    return this.technicalEvaluationsService.getCatalog()
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'DEPORTISTA')
  @Get(':id_user/timeline')
  @ApiOperation({ summary: 'Consultar el historial técnico de un deportista' })
  @ApiParam({ name: 'id_user', type: Number })
  @ApiOkResponse({ type: ResponseTechnicalEvaluationDto, isArray: true })
  timeline(
    @Param('id_user', ParseIntPipe) id_user: number,
    @GetUser() user: User,
  ) {
    assertOwnRecordOrStaff(user, id_user)
    return this.technicalEvaluationsService.getTimeline(id_user)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'DEPORTISTA')
  @Get('id/:id')
  @ApiOperation({ summary: 'Consultar una evaluación técnica por ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ResponseTechnicalEvaluationDto })
  async getById(
    @Param('id', ParseIntPipe) id_eval_tech: number,
    @GetUser() user: User,
  ) {
    const result = await this.technicalEvaluationsService.getById(id_eval_tech)
    assertOwnRecordOrStaff(user, result.evaluation.id_user)
    return result
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Post()
  @ApiOperation({
    summary:
      'Registrar una evaluación técnica o táctica: el indicador debe pertenecer al catálogo de su dimensión',
  })
  @ApiCreatedResponse({ type: ResponseTechnicalEvaluationDto })
  create(@Body() createTechnicalEvaluationDto: CreateTechnicalEvaluationDto) {
    return this.technicalEvaluationsService.create(createTechnicalEvaluationDto)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Put('id/:id')
  @ApiOperation({ summary: 'Actualizar una evaluación técnica' })
  @ApiParam({ name: 'id', type: Number })
  update(
    @Param('id', ParseIntPipe) id_eval_tech: number,
    @Body() updateTechnicalEvaluationDto: UpdateTechnicalEvaluationDto,
  ) {
    return this.technicalEvaluationsService.update(
      id_eval_tech,
      updateTechnicalEvaluationDto,
    )
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Delete('id/:id')
  @ApiOperation({ summary: 'Eliminar una evaluación técnica' })
  @ApiParam({ name: 'id', type: Number })
  delete(@Param('id', ParseIntPipe) id_eval_tech: number) {
    return this.technicalEvaluationsService.delete(id_eval_tech)
  }
}
