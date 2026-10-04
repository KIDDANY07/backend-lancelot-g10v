import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common'
import { UsersService } from './users.service'
import { UpdateUserDto } from './dto/update-user.dto'
import { FilterUserDto } from './dto/filter-user.dto'
import { AdminCreateUserDto } from './dto/admin-create-user.dto'
import { ChangePasswordDto } from './dto/change-password.dto'
import { UpdateMyProfileDto } from './dto/update-my-profile.dto'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { GetUser } from 'src/auth/decorators/get-user.decorator'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
  UserResponseDto,
  UsersPaginatedResponseDto,
} from 'src/common/dto/api-response.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Usuarios')
@ApiBearerAuth('bearerAuth')
@ApiUnauthorizedResponse({ description: 'JWT ausente, inválido o expirado.' })
@ApiInternalServerErrorResponse({ description: 'Error interno no controlado.' })
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles('ADMIN')
  @Post()
  @ApiOperation({
    summary: 'Crear un usuario con su rol',
    description:
      'Requiere rol ADMIN. Permite crear cuentas del cuerpo técnico (entrenador, director técnico, encargado de salud) o deportistas. La fecha de nacimiento es obligatoria para deportistas.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({
    description:
      'El correo ya existe, el rol no existe o el cuerpo no es válido.',
  })
  createByAdmin(@Body() adminCreateUserDto: AdminCreateUserDto) {
    return this.usersService.createByAdmin(adminCreateUserDto)
  }

  @Roles('ADMIN')
  @Get()
  @ApiOperation({
    summary: 'Listar usuarios',
    description: 'Requiere rol ADMIN.',
  })
  @ApiQuery({ type: FilterUserDto })
  @ApiOkResponse({ type: UsersPaginatedResponseDto })
  @ApiNotFoundResponse({ description: 'No hay usuarios registrados.' })
  @ApiUnauthorizedResponse({ description: 'JWT ausente, inválido o expirado.' })
  findAll(@Query() filters: FilterUserDto) {
    return this.usersService.findAll(filters)
  }

  @Roles('ADMIN')
  @Get('id/:id')
  @ApiOperation({
    summary: 'Consultar usuario por ID',
    description: 'Requiere rol ADMIN.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'El usuario no existe.' })
  findById(@Param('id', ParseIntPipe) id_user: number) {
    return this.usersService.getById(id_user)
  }

  @Roles(
    'ADMIN',
    'ENTRENADOR',
    'DIRECTOR_TECNICO',
    'DEPORTISTA',
    'ENCARGADO_SALUD',
  )
  @Get('me')
  @ApiOperation({
    summary: 'Consultar mi perfil',
    description:
      'El usuario se obtiene del JWT; requiere rol ADMIN o ENTRENADOR.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'El usuario autenticado no existe.' })
  me(@GetUser('id_user') id_user: number) {
    return this.usersService.getById(id_user)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD')
  @Get('athletes')
  @ApiOperation({
    summary: 'Listar deportistas',
    description:
      'Disponible para ADMIN, DIRECTOR_TECNICO, ENTRENADOR y ENCARGADO_SALUD.',
  })
  @ApiQuery({ type: FilterUserDto })
  @ApiOkResponse({ type: UsersPaginatedResponseDto })
  @ApiNotFoundResponse({ description: 'No hay jugadores registrados.' })
  athletes(@Query() filters: FilterUserDto) {
    return this.usersService.findAllAthletes(filters)
  }

  @Roles('ADMIN')
  @Put('id/:id')
  @ApiOperation({
    summary: 'Actualizar un usuario',
    description: 'Requiere rol ADMIN.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({
    description: 'El correo ya está en uso o el cuerpo no es válido.',
  })
  @ApiNotFoundResponse({ description: 'El usuario no existe.' })
  update(
    @Param('id', ParseIntPipe) id_user: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id_user, updateUserDto)
  }

  @Roles(
    'ADMIN',
    'ENTRENADOR',
    'DIRECTOR_TECNICO',
    'DEPORTISTA',
    'ENCARGADO_SALUD',
  )
  @Put('me/password')
  @ApiOperation({
    summary: 'Cambiar mi contraseña',
    description: 'Exige la contraseña actual. Disponible para todos los roles.',
  })
  @ApiBadRequestResponse({
    description: 'La contraseña actual no es correcta o la nueva no es válida.',
  })
  changeMyPassword(
    @GetUser('id_user') id_user: number,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(id_user, changePasswordDto)
  }

  @Roles(
    'ADMIN',
    'ENTRENADOR',
    'DIRECTOR_TECNICO',
    'DEPORTISTA',
    'ENCARGADO_SALUD',
  )
  @Put('me')
  @ApiOperation({
    summary: 'Actualizar mi perfil',
    description:
      'El usuario se obtiene del JWT. Solo permite nombres, apellidos, correo y fecha de nacimiento; el rol y la contraseña no se cambian por esta ruta.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({
    description: 'El correo ya está en uso o el cuerpo no es válido.',
  })
  @ApiNotFoundResponse({ description: 'El usuario autenticado no existe.' })
  updateMe(
    @GetUser('id_user') id_user: number,
    @Body() updateMyProfileDto: UpdateMyProfileDto,
  ) {
    return this.usersService.updateProfile(id_user, updateMyProfileDto)
  }

  @Roles('ADMIN')
  @Delete('id/:id')
  @ApiOperation({
    summary: 'Eliminar un usuario',
    description: 'Requiere rol ADMIN.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'El usuario no existe.' })
  delete(@Param('id', ParseIntPipe) id_user: number) {
    return this.usersService.delete(id_user)
  }
}
