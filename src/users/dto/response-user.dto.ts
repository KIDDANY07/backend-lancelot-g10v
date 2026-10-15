import { Exclude, Expose, Transform } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { isDataPolicyPending } from 'src/common/utils/data-policy.util'
import type { User } from '../entities/user.entity'

export class ResponseUserDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id_user: number

  @Expose()
  @ApiProperty({ example: 3 })
  id_role: number

  @Expose()
  @Transform(
    ({ obj }) => obj.athletesInCategory?.map((ath) => ath.id_ath_cat) ?? [],
  )
  @ApiProperty({
    description: 'Identificadores de asignaciones a categorías.',
    type: Number,
    isArray: true,
    example: [4, 8],
  })
  id_ath_cat: number[]

  @Expose()
  @ApiProperty({ example: 'Juan' })
  name: string

  @Expose()
  @ApiProperty({ example: 'Pérez' })
  lastname: string

  @Expose()
  @ApiProperty({ example: 'juan.perez@example.com', format: 'email' })
  email: string

  @Expose()
  @ApiProperty({ example: '2012-04-10', format: 'date', nullable: true })
  birth_date?: string | null

  @Expose()
  @ApiProperty({
    description:
      'Fecha en que el titular autorizó el tratamiento de sus datos personales.',
    example: '2026-10-15T14:30:00.000Z',
    nullable: true,
  })
  data_policy_accepted_at?: Date | null

  @Expose()
  @ApiProperty({
    description: 'Versión de la política de datos que aceptó el titular.',
    example: '2026-10',
    nullable: true,
  })
  data_policy_version?: string | null

  @Expose()
  @Transform(({ obj }: { obj: Pick<User, 'data_policy_version'> }) =>
    isDataPolicyPending(obj.data_policy_version),
  )
  @ApiProperty({
    description:
      'Indica si el usuario aún debe aceptar la versión vigente de la política de datos.',
    example: false,
  })
  data_policy_pending: boolean

  @Expose()
  @Transform(({ obj }) => obj.role?.name)
  @ApiProperty({ example: 'JUGADOR' })
  role_name: string

  @Exclude()
  password: string
}
