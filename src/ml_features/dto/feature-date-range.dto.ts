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

export class FeatureBackfillRangeDto extends FeatureDateRangeDto {
  @IsOptional()
  @IsDateString()
  @Matches(DATE_KEY, { message: DATE_KEY_MESSAGE })
  @ApiPropertyOptional({
    example: '2026-10-30',
    format: 'date',
    description:
      'Fecha de corte que se toma como el día actual del histórico (por defecto, hoy). Solo se etiquetan los días con sus 7 días siguientes completos antes de esta fecha; los posteriores quedan pendientes y no se marcan como sin lesión',
  })
  as_of?: string
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
