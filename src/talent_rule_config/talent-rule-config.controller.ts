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
import { ResponseTalentRuleConfigDto } from './dto/response-talent-rule-config.dto'
import { UpdateTalentRuleConfigDto } from './dto/update-talent-rule-config.dto'
import { TalentRuleConfigService } from './talent-rule-config.service'

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Configuración de detección de talento')
@ApiBearerAuth('bearerAuth')
@Controller('talent-rule-config')
export class TalentRuleConfigController {
  constructor(
    private readonly talentRuleConfigService: TalentRuleConfigService,
  ) {}

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Get()
  @ApiOperation({
    summary:
      'Consultar la configuración vigente de detección de talento (global o, con ?id_category=, la de esa categoría con respaldo en la global)',
  })
  @ApiQuery({ type: CategoryScopeQueryDto })
  @ApiOkResponse({ type: ResponseTalentRuleConfigDto })
  getActive(@Query() query: CategoryScopeQueryDto) {
    return this.talentRuleConfigService.getActiveResponse(query.id_category)
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR')
  @Get('categories')
  @ApiOperation({
    summary:
      'Listar las categorías que tienen configuración propia de detección de talento',
  })
  @ApiOkResponse({ type: [ResponseTalentRuleConfigDto] })
  findCategoryOverrides() {
    return this.talentRuleConfigService.findCategoryOverrides()
  }

  @Roles('ADMIN', 'DIRECTOR_TECNICO')
  @Put()
  @ApiOperation({
    summary:
      'Ajustar los umbrales de detección de talento (editable por el club, sin tocar código). Con ?id_category= crea o actualiza la configuración propia de esa categoría',
  })
  @ApiQuery({ type: CategoryScopeQueryDto })
  @ApiOkResponse({ type: ResponseTalentRuleConfigDto })
  update(
    @Body() updateTalentRuleConfigDto: UpdateTalentRuleConfigDto,
    @Query() query: CategoryScopeQueryDto,
  ) {
    return this.talentRuleConfigService.update(
      updateTalentRuleConfigDto,
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
    return this.talentRuleConfigService.deleteCategoryOverride(
      query.id_category,
    )
  }
}
