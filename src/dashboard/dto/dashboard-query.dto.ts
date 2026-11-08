import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsDateString, IsInt, IsOptional, Matches, Min } from 'class-validator'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const DATE_KEY_MESSAGE = 'La fecha debe tener el formato YYYY-MM-DD'

export class DashboardQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    example: 4,
    description:
      'Temporada. Filtra sesiones y deportistas asignados; si no se indican fechas, el periodo es el de la temporada hasta hoy',
  })
  id_season?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    example: 1,
    description:
      'Categoría. Filtra las sesiones de la categoría y los deportistas asignados a ella',
  })
  id_category?: number

  @IsOptional()
  @IsDateString()
  @Matches(DATE_KEY, { message: DATE_KEY_MESSAGE })
  @ApiPropertyOptional({
    example: '2026-10-01',
    format: 'date',
    description:
      'Fecha inicial (incluida). Por defecto, 28 días antes de la fecha final o el inicio de la temporada',
  })
  from?: string

  @IsOptional()
  @IsDateString()
  @Matches(DATE_KEY, { message: DATE_KEY_MESSAGE })
  @ApiPropertyOptional({
    example: '2026-10-28',
    format: 'date',
    description:
      'Fecha final (incluida). Por defecto, hoy o el fin de la temporada si ya terminó',
  })
  to?: string
}
