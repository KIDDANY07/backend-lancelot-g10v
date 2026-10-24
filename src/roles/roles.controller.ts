import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common'
import { RolesService } from './roles.service'
import { CreateRoleDto } from './dto/create-role.dto'
import { UpdateRoleDto } from './dto/update-role.dto'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import {
  ApiBody,
  ApiInternalServerErrorResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { PageQueryDto } from 'src/common/dto/page-query.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('roles')
@ApiTags('Roles')
@ApiInternalServerErrorResponse({ description: 'Error interno no controlado.' })
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Roles('ADMIN')
  @Post()
  @ApiOperation({
    summary: 'Crear rol',
    description:
      'Endpoint scaffold público; el DTO actual no define campos y el servicio devuelve texto.',
  })
  @ApiBody({ type: CreateRoleDto })
  @ApiResponse({ status: 201, type: String })
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto)
  }

  @Roles('ADMIN')
  @Get()
  @ApiOperation({ summary: 'Listar roles paginados' })
  @ApiQuery({ type: PageQueryDto })
  findAll(@Query() query: PageQueryDto) {
    return this.rolesService.findAll(query)
  }

  @Roles('ADMIN')
  @Get(':id')
  @ApiOperation({
    summary: 'Consultar rol',
    description: 'Endpoint scaffold público que devuelve texto.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 200, type: String })
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(+id)
  }

  @Roles('ADMIN')
  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar rol',
    description:
      'Endpoint scaffold público; el DTO actual no define campos y el servicio devuelve texto.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateRoleDto })
  @ApiResponse({ status: 200, type: String })
  update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(+id, updateRoleDto)
  }

  @Roles('ADMIN')
  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar rol',
    description: 'Endpoint scaffold público que devuelve texto.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 200, type: String })
  remove(@Param('id') id: string) {
    return this.rolesService.remove(+id)
  }
}
