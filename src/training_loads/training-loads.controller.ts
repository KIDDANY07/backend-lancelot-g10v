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
import { CreateTrainingLoadDto } from './dto/create-training-load.dto'
import { FilterTrainingLoadDto } from './dto/filter-training-load.dto'
import { ResponseTrainingLoadDto } from './dto/response-training-load.dto'
import { UpdateTrainingLoadDto } from './dto/update-training-load.dto'
import { TrainingLoadsService } from './training-loads.service'

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Cargas de entrenamiento (RPE)')
@ApiBearerAuth('bearerAuth')
@Controller('training-loads')
export class TrainingLoadsController {
  constructor(private readonly trainingLoadsService: TrainingLoadsService) {}

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD', 'DEPORTISTA')
  @Get()
  @ApiOperation({ summary: 'Listar cargas de entrenamiento' })
  @ApiQuery({ type: FilterTrainingLoadDto })
  findAll(@Query() filters: FilterTrainingLoadDto, @GetUser() user: User) {
    if (isDeportista(user)) filters.id_user = user.id_user
    return this.trainingLoadsService.findAll(filters)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD', 'DEPORTISTA')
  @Get('id/:id')
  @ApiOperation({ summary: 'Consultar una carga de entrenamiento por ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ResponseTrainingLoadDto })
  async getById(
    @Param('id', ParseIntPipe) id_load: number,
    @GetUser() user: User,
  ) {
    const result = await this.trainingLoadsService.getById(id_load)
    assertOwnRecordOrStaff(user, result.load.id_user)
    return result
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'DEPORTISTA')
  @Post()
  @ApiOperation({
    summary:
      'Reportar el RPE de una sesión (el propio deportista o su entrenador)',
  })
  @ApiCreatedResponse({ type: ResponseTrainingLoadDto })
  create(
    @Body() createTrainingLoadDto: CreateTrainingLoadDto,
    @GetUser() user: User,
  ) {
    assertOwnRecordOrStaff(user, createTrainingLoadDto.id_user)
    return this.trainingLoadsService.create(createTrainingLoadDto)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'DEPORTISTA')
  @Put('id/:id')
  @ApiOperation({ summary: 'Actualizar una carga de entrenamiento' })
  @ApiParam({ name: 'id', type: Number })
  async update(
    @Param('id', ParseIntPipe) id_load: number,
    @Body() updateTrainingLoadDto: UpdateTrainingLoadDto,
    @GetUser() user: User,
  ) {
    if (isDeportista(user)) {
      const current = await this.trainingLoadsService.getById(id_load)
      assertOwnRecordOrStaff(user, current.load.id_user)
      if (updateTrainingLoadDto.id_user !== undefined)
        assertOwnRecordOrStaff(user, updateTrainingLoadDto.id_user)
    }
    return this.trainingLoadsService.update(id_load, updateTrainingLoadDto)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Delete('id/:id')
  @ApiOperation({ summary: 'Eliminar una carga de entrenamiento' })
  @ApiParam({ name: 'id', type: Number })
  delete(@Param('id', ParseIntPipe) id_load: number) {
    return this.trainingLoadsService.delete(id_load)
  }
}
