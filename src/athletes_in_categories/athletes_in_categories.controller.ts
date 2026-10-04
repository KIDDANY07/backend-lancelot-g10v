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
import { AthletesInCategoriesService } from './athletes_in_categories.service'
import { CreateAthletesInCategoryDto } from './dto/create-athletes_in_category.dto'
import { UpdateAthletesInCategoryDto } from './dto/update-athletes_in_category.dto'
import { FilterAthInCat } from './dto/filters-ath_in_cat.dto'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { GetUser } from 'src/auth/decorators/get-user.decorator'
import { assertOwnRecordOrStaff } from 'src/common/utils/ownership.util'
import { User } from 'src/users/entities/user.entity'
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
  AthleteInCategoryResponseDto,
  AthletesInCategoriesPaginatedResponseDto,
  MessageResponseDto,
} from 'src/common/dto/api-response.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Asignaciones a categorías')
@ApiBearerAuth('bearerAuth')
@ApiUnauthorizedResponse({ description: 'JWT ausente, inválido o expirado.' })
@ApiInternalServerErrorResponse({ description: 'Error interno no controlado.' })
@Controller('athletes-in-categories')
export class AthletesInCategoriesController {
  constructor(
    private readonly athletesInCategoriesService: AthletesInCategoriesService,
  ) {}

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD')
  @Get()
  @ApiOperation({
    summary: 'Listar asignaciones a categorías',
    description: 'Requiere rol ADMIN o ENTRENADOR.',
  })
  @ApiQuery({ type: FilterAthInCat })
  @ApiOkResponse({ type: AthletesInCategoriesPaginatedResponseDto })
  @ApiNotFoundResponse({ description: 'No hay asignaciones registradas.' })
  findAll(@Query() filters: FilterAthInCat) {
    return this.athletesInCategoriesService.findAll(filters)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD')
  @Get('id/:id')
  @ApiOperation({
    summary: 'Consultar asignación por ID',
    description: 'Requiere rol ADMIN o ENTRENADOR.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: AthleteInCategoryResponseDto })
  @ApiNotFoundResponse({ description: 'La asignación no existe.' })
  findOneById(@Param('id', ParseIntPipe) id_ath_cat: number) {
    return this.athletesInCategoriesService.getById(id_ath_cat)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'DEPORTISTA')
  @Get('history/:id_user')
  @ApiOperation({
    summary: 'Consultar el historial de categorías de un deportista',
    description:
      'Devuelve todas las asignaciones del deportista ordenadas por temporada. Un DEPORTISTA solo puede consultar su propio historial.',
  })
  @ApiParam({ name: 'id_user', type: Number, example: 7 })
  @ApiOkResponse({ type: AthleteInCategoryResponseDto, isArray: true })
  history(
    @Param('id_user', ParseIntPipe) id_user: number,
    @GetUser() user: User,
  ) {
    assertOwnRecordOrStaff(user, id_user)
    return this.athletesInCategoriesService.getHistoryByIdUser(id_user)
  }

  @Roles('DEPORTISTA')
  @Get('me')
  @ApiOperation({
    summary: 'Consultar mi categoría',
    description:
      'El usuario se obtiene del JWT. Requiere el rol DEPORTISTA configurado actualmente.',
  })
  @ApiOkResponse({ type: AthleteInCategoryResponseDto })
  @ApiNotFoundResponse({
    description: 'No existe una asignación para el usuario autenticado.',
  })
  findMyCategories(@GetUser('id_user') id_user: number) {
    return this.athletesInCategoriesService.getByIdUser(id_user)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Post()
  @ApiOperation({
    summary: 'Asignar deportista a categoría',
    description: 'Requiere rol ADMIN o ENTRENADOR.',
  })
  @ApiCreatedResponse({ type: AthleteInCategoryResponseDto })
  @ApiBadRequestResponse({
    description:
      'El usuario no existe, no es deportista, ya está asignado o el cuerpo no es válido.',
  })
  create(@Body() createAthletesInCategoryDto: CreateAthletesInCategoryDto) {
    return this.athletesInCategoriesService.create(createAthletesInCategoryDto)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Put('id/:id')
  @ApiOperation({
    summary: 'Actualizar asignación a categoría',
    description: 'Requiere rol ADMIN o ENTRENADOR.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: AthleteInCategoryResponseDto })
  @ApiBadRequestResponse({
    description:
      'La combinación de usuario y categoría ya existe o el cuerpo no es válido.',
  })
  @ApiNotFoundResponse({ description: 'La asignación no existe.' })
  update(
    @Param('id', ParseIntPipe) id_ath_cat: number,
    @Body() updateAthletesInCategoryDto: UpdateAthletesInCategoryDto,
  ) {
    return this.athletesInCategoriesService.update(
      id_ath_cat,
      updateAthletesInCategoryDto,
    )
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Delete('id/:id')
  @ApiOperation({
    summary: 'Eliminar asignación a categoría',
    description: 'Requiere rol ADMIN o ENTRENADOR.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiNotFoundResponse({ description: 'La asignación no existe.' })
  delete(@Param('id', ParseIntPipe) id_ath_cat: number) {
    return this.athletesInCategoriesService.delete(id_ath_cat)
  }
}
