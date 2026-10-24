import {
  Body,
  Controller,
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
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { CreateMlModelDto } from './dto/create-ml-model.dto'
import { FilterMlModelDto } from './dto/filter-ml-model.dto'
import { MlModelTaskQueryDto } from './dto/ml-model-task-query.dto'
import {
  ML_SERVICE_ROLE,
  MlServiceApiKeyGuard,
  MlServiceOrJwtGuard,
} from './guards/ml-service-api-key.guard'
import { TrainMlModelDto } from './dto/train-ml-model.dto'
import { MlModelsService } from './ml-models.service'
import { MlTrainingService } from './ml-training.service'

@ApiTags('ML - Registro de modelos')
@ApiBearerAuth('bearerAuth')
@Controller('ml/models')
export class MlModelsController {
  constructor(
    private readonly mlModelsService: MlModelsService,
    private readonly mlTrainingService: MlTrainingService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('train')
  @ApiOperation({
    summary:
      'Entrenar ahora un modelo en el servicio de ML con los datos de la base. El servicio verifica la readiness de la tarea, entrena y registra el modelo sin activarlo',
  })
  train(@Body() trainMlModelDto: TrainMlModelDto) {
    return this.mlTrainingService.train(trainMlModelDto.task)
  }

  @UseGuards(MlServiceApiKeyGuard)
  @Post()
  @ApiSecurity('mlServiceApiKey')
  @ApiOperation({
    summary:
      'Registrar un modelo entrenado (lo llama el microservicio de ML con la cabecera x-api-key, sin JWT)',
  })
  create(@Body() createMlModelDto: CreateMlModelDto) {
    return this.mlModelsService.create(createMlModelDto)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'ENCARGADO_SALUD')
  @Get()
  @ApiOperation({ summary: 'Listar los modelos de ML registrados' })
  @ApiQuery({ type: FilterMlModelDto })
  findAll(@Query() filters: FilterMlModelDto) {
    return this.mlModelsService.findAll(filters)
  }

  @UseGuards(MlServiceOrJwtGuard, RolesGuard)
  @Roles('ADMIN', 'ENCARGADO_SALUD', ML_SERVICE_ROLE)
  @Get('active')
  @ApiSecurity('mlServiceApiKey')
  @ApiOperation({
    summary:
      'Consultar el modelo de ML activo de una tarea (lo usa el microservicio para saber qué modelo cargar). Sin task se consulta el de riesgo de lesión',
  })
  @ApiQuery({ type: MlModelTaskQueryDto })
  getActive(@Query() query: MlModelTaskQueryDto) {
    return this.mlModelsService.getActive(query.task)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Put('id/:id/activate')
  @ApiOperation({
    summary:
      'Activar un modelo: exige que no sea sintético, que se cumpla la readiness de su tarea y que su PR-AUC supere a la de las reglas en el mismo conjunto de prueba. Solo reemplaza al modelo activo de su misma tarea',
  })
  @ApiParam({ name: 'id', type: Number })
  activate(@Param('id', ParseIntPipe) id_model: number) {
    return this.mlModelsService.activate(id_model)
  }
}
