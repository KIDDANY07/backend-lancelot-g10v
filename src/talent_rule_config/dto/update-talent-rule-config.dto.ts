import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator'

export class UpdateTalentRuleConfigDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @ApiPropertyOptional({
    example: 80,
    description:
      'Percentil mínimo del índice de progreso dentro de la cohorte categoría + temporada (criterio obligatorio)',
  })
  min_percentile?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @ApiPropertyOptional({
    example: 40,
    description:
      'Piso que deben superar las tres dimensiones (física, técnica y participación); evita señalar perfiles con una dimensión débil (criterio obligatorio)',
  })
  min_dimension_score?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @ApiPropertyOptional({
    example: 5,
    description:
      'Puntos de mejora del índice frente a la temporada anterior (criterio de soporte)',
  })
  min_improvement_delta?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @ApiPropertyOptional({
    example: 50,
    description:
      'Puntaje de participación mínimo para el criterio de disponibilidad (criterio de soporte)',
  })
  min_participation_score?: number

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    example: true,
    description:
      'Si está activo, una lesión severa durante la temporada impide cumplir el criterio de disponibilidad',
  })
  exclude_severe_injury?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2)
  @ApiPropertyOptional({
    example: 1,
    description:
      'Cantidad mínima de criterios de soporte (mejora sostenida y disponibilidad) que se deben cumplir',
  })
  min_supporting_criteria?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  @ApiPropertyOptional({
    example: 12,
    description:
      'Meses de anticipación para considerar que el deportista cumple la edad máxima de su categoría y sugerir evaluar su ascenso',
  })
  near_max_age_months?: number
}
