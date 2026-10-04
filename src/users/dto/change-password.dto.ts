import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, Length } from 'class-validator'

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Contraseña actual.',
    example: 'Secreta123',
    format: 'password',
  })
  current_password: string

  @IsString()
  @IsNotEmpty()
  @Length(6, 255)
  @ApiProperty({
    description: 'Nueva contraseña (mínimo 6 caracteres).',
    example: 'NuevaSecreta456',
    format: 'password',
  })
  new_password: string
}
