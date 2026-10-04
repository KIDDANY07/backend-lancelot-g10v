import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsDateString, IsOptional, Matches } from 'class-validator'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const DATE_KEY_MESSAGE = 'La fecha debe tener el formato YYYY-MM-DD'

export class FeatureDateRangeDto {
  @IsDateString()
  @Matches(DATE_KEY, { message: DATE_KEY_MESSAGE })
  @ApiProperty({
    example: '2026-02-01',
    format: 'date',
    description: 'Fecha inicial (incluida)',
  })
  from: string

  @IsDateString()
  @Matches(DATE_KEY, { message: DATE_KEY_MESSAGE })
  @ApiProperty({
    example: '2026-06-30',
    format: 'date',
    description: 'Fecha final (incluida)',
  })
  to: string
}

export class OptionalFeatureDateRangeDto {
  @IsOptional()
  @IsDateString()
  @Matches(DATE_KEY, { message: DATE_KEY_MESSAGE })
  @ApiPropertyOptional({
    example: '2026-02-01',
    format: 'date',
    description:
      'Fecha inicial (incluida). Si se omite, desde el primer snapshot',
  })
  from?: string

  @IsOptional()
  @IsDateString()
  @Matches(DATE_KEY, { message: DATE_KEY_MESSAGE })
  @ApiPropertyOptional({
    example: '2026-06-30',
    format: 'date',
    description:
      'Fecha final (incluida). Si se omite, hasta el último snapshot',
  })
  to?: string
}
