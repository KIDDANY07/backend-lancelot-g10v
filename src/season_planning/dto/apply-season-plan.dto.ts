import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export class PlannedAthleteDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ description: 'Id del deportista.', example: 7 })
  id_user: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({
    description: 'Categoría base del deportista en la temporada destino.',
    example: 2,
  })
  id_category: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    description:
      'Categoría superior en la que también entrenará, por ejemplo tras una señalización de talento revisada.',
    example: 3,
  })
  id_promotion_category?: number | null

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @ApiPropertyOptional({
    description:
      'Posición en la temporada destino. Si se omite se conserva la de la temporada de origen.',
    example: 'Delantero',
  })
  position?: string | null

  @IsBoolean()
  @ApiProperty({
    description:
      'Si es verdadero, los objetivos en curso se copian a la temporada destino.',
    example: true,
  })
  carry_objectives: boolean
}

export class ApplySeasonPlanDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ description: 'Temporada del siguiente ciclo.', example: 2 })
  id_target_season: number

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PlannedAthleteDto)
  @ApiProperty({ type: [PlannedAthleteDto] })
  athletes: PlannedAthleteDto[]
}
