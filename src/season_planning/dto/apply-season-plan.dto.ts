import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator'

export class PlanOverrideDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ description: 'Id del deportista.', example: 7 })
  id_user: number

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description: 'Si se incluye en el plan.',
    example: true,
  })
  include?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    description: 'Categoría base del deportista en la temporada destino.',
    example: 2,
  })
  id_category?: number

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description:
      'Si también entrenará en la categoría de ascenso sugerida por una señalización de talento revisada.',
    example: true,
  })
  promote?: boolean

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description: 'Si se copian sus objetivos en curso a la temporada destino.',
    example: true,
  })
  carry?: boolean
}

export class ApplySeasonPlanDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ description: 'Temporada del siguiente ciclo.', example: 2 })
  id_target_season: number

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanOverrideDto)
  @ApiPropertyOptional({
    description:
      'Cambios sobre la decisión sugerida. Los deportistas que no aparecen se aplican con la sugerencia del plan.',
    type: [PlanOverrideDto],
  })
  overrides?: PlanOverrideDto[]
}
