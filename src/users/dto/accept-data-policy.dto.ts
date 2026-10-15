import { ApiProperty } from '@nestjs/swagger'
import { Equals, IsBoolean } from 'class-validator'

export class AcceptDataPolicyDto {
  @IsBoolean()
  @Equals(true, {
    message:
      'Debes aceptar la política de tratamiento de datos para usar la plataforma',
  })
  @ApiProperty({
    description:
      'Autorización expresa del titular para el tratamiento de sus datos personales (Ley 1581 de 2012).',
    example: true,
  })
  accept: boolean
}
