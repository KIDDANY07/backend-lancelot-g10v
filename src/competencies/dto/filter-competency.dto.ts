import { Type } from 'class-transformer'
import { IsDate, IsInt, IsOptional, IsString, Min } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class FilterCompetency {
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
  @IsString()
  @ApiPropertyOptional({
    description: 'Texto a buscar en el nombre.',
    example: 'Regional',
  })
  name?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @ApiPropertyOptional({
    description: 'Filtrar por id de temporada.',
    example: 1,
  })
  id_season?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @ApiPropertyOptional({
    description: 'Filtrar por id de categoría.',
    example: 2,
  })
  id_category?: number

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-03-01T00:00:00.000Z',
  })
  start_date?: Date

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-03-30T00:00:00.000Z',
  })
  finish_date?: Date
}
