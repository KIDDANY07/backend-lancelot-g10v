import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator'

export class AdminCreateUserDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  @ApiProperty({ description: 'Nombres del usuario.', example: 'Carlos' })
  name: string

  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  @ApiProperty({ description: 'Apellidos del usuario.', example: 'Rojas' })
  lastname: string

  @IsEmail()
  @IsNotEmpty()
  @Length(8, 150)
  @ApiProperty({
    description: 'Correo electrónico único.',
    example: 'carlos.rojas@verafc.co',
    format: 'email',
  })
  email: string

  @IsString()
  @IsNotEmpty()
  @Length(6, 255)
  @ApiProperty({
    description:
      'Contraseña inicial. El usuario puede cambiarla desde su perfil.',
    example: 'Temporal123',
    format: 'password',
  })
  password: string

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({
    description:
      'Fecha de nacimiento. Obligatoria para deportistas, opcional para el cuerpo técnico.',
    example: '1990-05-12',
    format: 'date',
  })
  birth_date?: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({
    description:
      'Rol del usuario: 1 ADMIN, 2 ENTRENADOR, 3 DEPORTISTA, 4 DIRECTOR_TECNICO, 5 ENCARGADO_SALUD.',
    example: 2,
  })
  id_role: number
}
