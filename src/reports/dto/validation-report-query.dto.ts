import { ApiProperty } from '@nestjs/swagger'
import { IsDateString, Matches } from 'class-validator'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const DATE_KEY_MESSAGE = 'La fecha debe tener el formato YYYY-MM-DD'

export class ValidationReportQueryDto {
  @IsDateString()
  @Matches(DATE_KEY, { message: DATE_KEY_MESSAGE })
  @ApiProperty({
    example: '2026-02-01',
    format: 'date',
    description: 'Inicio del periodo de validación (incluido)',
  })
  from: string

  @IsDateString()
  @Matches(DATE_KEY, { message: DATE_KEY_MESSAGE })
  @ApiProperty({
    example: '2026-09-30',
    format: 'date',
    description: 'Fin del periodo de validación (incluido)',
  })
  to: string
}
