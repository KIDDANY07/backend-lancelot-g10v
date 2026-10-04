import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Put,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common'
import { CategoriesService } from './categories.service'
import { CreateCategoryDto } from './dto/create-category.dto'
import { UpdateCategoryDto } from './dto/update-category.dto'
import { FilterCategory } from './dto/filter-category.dto'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { Roles } from 'src/auth/decorators/roles.decorator'
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
  CategoriesPaginatedResponseDto,
  CategoryResponseDto,
} from 'src/common/dto/api-response.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Categorías')
@ApiBearerAuth('bearerAuth')
@ApiUnauthorizedResponse({ description: 'JWT ausente, inválido o expirado.' })
@ApiInternalServerErrorResponse({ description: 'Error interno no controlado.' })
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD')
  @Get()
  @ApiOperation({
    summary: 'Listar categorías',
    description:
      'Devuelve categorías paginadas; requiere rol ADMIN o ENTRENADOR.',
  })
  @ApiQuery({ type: FilterCategory })
  @ApiOkResponse({ type: CategoriesPaginatedResponseDto })
  @ApiNotFoundResponse({ description: 'No hay categorías registradas.' })
  @ApiUnauthorizedResponse({ description: 'JWT ausente, inválido o expirado.' })
  findAll(@Query() filters: FilterCategory) {
    return this.categoriesService.findAll(filters)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD')
  @Get('id/:id')
  @ApiOperation({
    summary: 'Consultar una categoría',
    description: 'Requiere rol ADMIN o ENTRENADOR.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiNotFoundResponse({ description: 'La categoría no existe.' })
  findOneById(@Param('id', ParseIntPipe) id_category: number) {
    return this.categoriesService.getById(id_category)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Post()
  @ApiOperation({
    summary: 'Crear una categoría',
    description: 'Requiere rol ADMIN o ENTRENADOR.',
  })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @ApiBadRequestResponse({ description: 'El cuerpo no supera la validación.' })
  creat(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Put('id/:id')
  @ApiOperation({
    summary: 'Actualizar una categoría',
    description: 'Requiere rol ADMIN o ENTRENADOR.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiBadRequestResponse({ description: 'El cuerpo no supera la validación.' })
  @ApiNotFoundResponse({ description: 'La categoría no existe.' })
  update(
    @Param('id', ParseIntPipe) id_category: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id_category, updateCategoryDto)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Delete('id/:id')
  @ApiOperation({
    summary: 'Eliminar una categoría',
    description: 'Requiere rol ADMIN o ENTRENADOR.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiNotFoundResponse({ description: 'La categoría no existe.' })
  delete(@Param('id', ParseIntPipe) id_category: number) {
    return this.categoriesService.delete(id_category)
  }
}
