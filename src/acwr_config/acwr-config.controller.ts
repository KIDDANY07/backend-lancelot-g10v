import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { CategoryScopeQueryDto } from 'src/common/dto/category-scope-query.dto'
import { AcwrConfigService } from './acwr-config.service'
import { ResponseAcwrThresholdDto } from './dto/response-acwr-threshold.dto'
import { UpdateAcwrThresholdDto } from './dto/update-acwr-threshold.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Configuración de umbrales ACWR')
@ApiBearerAuth('bearerAuth')
@Controller('acwr-config')
export class AcwrConfigController {
  constructor(private readonly acwrConfigService: AcwrConfigService) {}

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD')
  @Get()
  @ApiOperation({
    summary:
      'Consultar los umbrales vigentes de ACWR (globales o, con ?id_category=, los de esa categoría con respaldo en los globales)',
  })
  @ApiQuery({ type: CategoryScopeQueryDto })
  @ApiOkResponse({ type: ResponseAcwrThresholdDto })
  getActive(@Query() query: CategoryScopeQueryDto) {
    return this.acwrConfigService.getActiveResponse(query.id_category)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD')
  @Get('categories')
  @ApiOperation({
    summary: 'Listar las categorías que tienen umbrales de ACWR propios',
  })
  @ApiOkResponse({ type: [ResponseAcwrThresholdDto] })
  findCategoryOverrides() {
    return this.acwrConfigService.findCategoryOverrides()
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO')
  @Put()
  @ApiOperation({
    summary:
      'Ajustar los umbrales de ACWR (editable por el club, sin tocar código). Con ?id_category= crea o actualiza los umbrales propios de esa categoría',
  })
  @ApiQuery({ type: CategoryScopeQueryDto })
  @ApiOkResponse({ type: ResponseAcwrThresholdDto })
  update(
    @Body() updateAcwrThresholdDto: UpdateAcwrThresholdDto,
    @Query() query: CategoryScopeQueryDto,
  ) {
    return this.acwrConfigService.update(
      updateAcwrThresholdDto,
      query.id_category,
    )
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO')
  @Delete()
  @ApiOperation({
    summary:
      'Eliminar los umbrales propios de una categoría (?id_category= obligatorio); la categoría vuelve a usar los globales',
  })
  @ApiQuery({ type: CategoryScopeQueryDto })
  deleteCategoryOverride(@Query() query: CategoryScopeQueryDto) {
    return this.acwrConfigService.deleteCategoryOverride(query.id_category)
  }
}
