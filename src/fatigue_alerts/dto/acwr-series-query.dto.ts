import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsDateString, IsOptional, Matches } from 'class-validator'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const DATE_KEY_MESSAGE = 'La fecha debe tener el formato YYYY-MM-DD'

export class AcwrSeriesQueryDto {
  @IsOptional()
  @IsDateString()
  @Matches(DATE_KEY, { message: DATE_KEY_MESSAGE })
  @ApiPropertyOptional({
    example: '2026-01-01',
    format: 'date',
    description: 'Fecha inicial (incluida). Por defecto, 90 días antes de to',
  })
  from?: string

  @IsOptional()
  @IsDateString()
  @Matches(DATE_KEY, { message: DATE_KEY_MESSAGE })
  @ApiPropertyOptional({
    example: '2026-03-31',
    format: 'date',
    description: 'Fecha final (incluida). Por defecto, hoy',
  })
  to?: string
}

export class CategoryAcwrQueryDto {
  @IsOptional()
  @IsDateString()
  @Matches(DATE_KEY, { message: DATE_KEY_MESSAGE })
  @ApiPropertyOptional({
    example: '2026-03-31',
    format: 'date',
    description: 'Fecha de referencia. Por defecto, hoy',
  })
  date?: string
}
