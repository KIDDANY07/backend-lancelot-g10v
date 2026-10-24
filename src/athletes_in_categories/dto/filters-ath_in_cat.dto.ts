import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class FilterAthInCat {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ example: 10, minimum: 1, default: 10 })
  limit?: number = 10

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @ApiPropertyOptional({ example: 2 })
  id_category?: number

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description:
      'Busca cada palabra en el nombre o el apellido del deportista, sin distinguir tildes ni mayúsculas.',
    example: 'juan perez',
  })
  search?: string

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @ApiPropertyOptional({
    description: 'Solo asignaciones sin posición registrada.',
    example: true,
  })
  missing_position?: boolean

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'Juan' })
  name?: string

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'Pérez' })
  lastname?: string

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'Sub-15' })
  category_name?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @ApiPropertyOptional({
    description: 'Filtrar por id de temporada.',
    example: 1,
  })
  id_season?: number
}
