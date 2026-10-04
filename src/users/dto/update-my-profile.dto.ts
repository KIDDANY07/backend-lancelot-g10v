import { ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  Length,
} from 'class-validator'

export class UpdateMyProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  @ApiPropertyOptional({ description: 'Nombres.', example: 'Juan' })
  name?: string

  @IsOptional()
  @IsString()
  @Length(2, 100)
  @ApiPropertyOptional({ description: 'Apellidos.', example: 'Pérez' })
  lastname?: string

  @IsOptional()
  @IsEmail()
  @Length(8, 150)
  @ApiPropertyOptional({
    description: 'Correo electrónico único.',
    example: 'juan.perez@example.com',
    format: 'email',
  })
  email?: string

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({
    description: 'Fecha de nacimiento.',
    example: '2012-04-10',
    format: 'date',
  })
  birth_date?: string
}
