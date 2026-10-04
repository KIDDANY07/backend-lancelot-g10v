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
import { ResponseInjuryRiskRuleConfigDto } from './dto/response-injury-risk-rule-config.dto'
import { UpdateInjuryRiskRuleConfigDto } from './dto/update-injury-risk-rule-config.dto'
import { InjuryRiskRuleConfigService } from './injury-risk-rule-config.service'

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Configuración de reglas de riesgo de lesión')
@ApiBearerAuth('bearerAuth')
@Controller('injury-risk-rule-config')
export class InjuryRiskRuleConfigController {
  constructor(
    private readonly injuryRiskRuleConfigService: InjuryRiskRuleConfigService,
  ) {}

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD')
  @Get()
  @ApiOperation({
    summary:
      'Consultar la configuración vigente de las reglas de riesgo de lesión (global o, con ?id_category=, la de esa categoría con respaldo en la global)',
  })
  @ApiQuery({ type: CategoryScopeQueryDto })
  @ApiOkResponse({ type: ResponseInjuryRiskRuleConfigDto })
  getActive(@Query() query: CategoryScopeQueryDto) {
    return this.injuryRiskRuleConfigService.getActiveResponse(query.id_category)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD')
  @Get('categories')
  @ApiOperation({
    summary:
      'Listar las categorías que tienen configuración propia de reglas de riesgo de lesión',
  })
  @ApiOkResponse({ type: [ResponseInjuryRiskRuleConfigDto] })
  findCategoryOverrides() {
    return this.injuryRiskRuleConfigService.findCategoryOverrides()
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO')
  @Put()
  @ApiOperation({
    summary:
      'Ajustar los umbrales de las reglas de riesgo de lesión (editable por el club, sin tocar código). Con ?id_category= crea o actualiza la configuración propia de esa categoría',
  })
  @ApiQuery({ type: CategoryScopeQueryDto })
  @ApiOkResponse({ type: ResponseInjuryRiskRuleConfigDto })
  update(
    @Body() updateInjuryRiskRuleConfigDto: UpdateInjuryRiskRuleConfigDto,
    @Query() query: CategoryScopeQueryDto,
  ) {
    return this.injuryRiskRuleConfigService.update(
      updateInjuryRiskRuleConfigDto,
      query.id_category,
    )
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO')
  @Delete()
  @ApiOperation({
    summary:
      'Eliminar la configuración propia de una categoría (?id_category= obligatorio); la categoría vuelve a usar la global',
  })
  @ApiQuery({ type: CategoryScopeQueryDto })
  deleteCategoryOverride(@Query() query: CategoryScopeQueryDto) {
    return this.injuryRiskRuleConfigService.deleteCategoryOverride(
      query.id_category,
    )
  }
}
