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
import { CreateHealthRecordDto } from './dto/create-health-record.dto'
import { FilterHealthRecordAccessLogDto } from './dto/filter-health-record-access-log.dto'
import { FilterHealthRecordDto } from './dto/filter-health-record.dto'
import { ResponseHealthRecordAccessLogDto } from './dto/response-health-record-access-log.dto'
import { ResponseHealthRecordDto } from './dto/response-health-record.dto'
import { UpdateHealthRecordDto } from './dto/update-health-record.dto'
import { HealthRecordAccessAction } from './entities/health-record-access-log.entity'
import { HealthRecordAuditService } from './health-record-audit.service'
import { HealthRecordsService } from './health-records.service'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ENCARGADO_SALUD')
@ApiTags('Registros de salud')
@ApiBearerAuth('bearerAuth')
@Controller('health-records')
export class HealthRecordsController {
  constructor(
    private readonly healthRecordsService: HealthRecordsService,
    private readonly healthRecordAuditService: HealthRecordAuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar registros de salud' })
  @ApiQuery({ type: FilterHealthRecordDto })
  async findAll(
    @Query() filters: FilterHealthRecordDto,
    @GetUser('id_user') id_accessing_user: number,
  ) {
    const result = await this.healthRecordsService.findAll(filters)
    await this.healthRecordAuditService.log(
      HealthRecordAccessAction.LIST,
      id_accessing_user,
    )
    return result
  }

  @Get('id/:id')
  @ApiOperation({ summary: 'Consultar un registro de salud por ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ResponseHealthRecordDto })
  async getById(
    @Param('id', ParseIntPipe) id_health: number,
    @GetUser('id_user') id_accessing_user: number,
  ) {
    const result = await this.healthRecordsService.getById(id_health)
    await this.healthRecordAuditService.log(
      HealthRecordAccessAction.READ,
      id_accessing_user,
      id_health,
    )
    return result
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un dato de salud' })
  @ApiCreatedResponse({ type: ResponseHealthRecordDto })
  async create(
    @Body() createHealthRecordDto: CreateHealthRecordDto,
    @GetUser('id_user') id_accessing_user: number,
  ) {
    const result = await this.healthRecordsService.create(
      createHealthRecordDto,
    )
    await this.healthRecordAuditService.log(
      HealthRecordAccessAction.CREATE,
      id_accessing_user,
      result.record.id_health,
    )
    return result
  }

  @Put('id/:id')
  @ApiOperation({ summary: 'Actualizar un registro de salud' })
  @ApiParam({ name: 'id', type: Number })
  async update(
    @Param('id', ParseIntPipe) id_health: number,
    @Body() updateHealthRecordDto: UpdateHealthRecordDto,
    @GetUser('id_user') id_accessing_user: number,
  ) {
    const result = await this.healthRecordsService.update(
      id_health,
      updateHealthRecordDto,
    )
    await this.healthRecordAuditService.log(
      HealthRecordAccessAction.UPDATE,
      id_accessing_user,
      id_health,
    )
    return result
  }

  @Delete('id/:id')
  @ApiOperation({ summary: 'Eliminar un registro de salud' })
  @ApiParam({ name: 'id', type: Number })
  async delete(
    @Param('id', ParseIntPipe) id_health: number,
    @GetUser('id_user') id_accessing_user: number,
  ) {
    await this.healthRecordsService.getById(id_health)
    await this.healthRecordAuditService.log(
      HealthRecordAccessAction.DELETE,
      id_accessing_user,
      id_health,
    )
    return this.healthRecordsService.delete(id_health)
  }

  @Roles('ADMIN')
  @Get('audit/logs')
  @ApiOperation({
    summary: 'Consultar la auditoría de accesos a registros de salud',
  })
  @ApiQuery({ type: FilterHealthRecordAccessLogDto })
  @ApiOkResponse({ type: ResponseHealthRecordAccessLogDto, isArray: true })
  getAuditLogs(@Query() filters: FilterHealthRecordAccessLogDto) {
    return this.healthRecordAuditService.findAll(filters)
  }
}
