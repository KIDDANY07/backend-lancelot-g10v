import { ApiProperty } from '@nestjs/swagger'
import { Expose } from 'class-transformer'

export class ResponsePositionWeightProfileDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id_profile: number

  @Expose()
  @ApiProperty({ example: 'delantero' })
  position: string

  @Expose()
  @ApiProperty({ example: 'Sub-15' })
  age_category: string

  @Expose()
  @ApiProperty({ example: 0.4 })
  w_physical: number

  @Expose()
  @ApiProperty({ example: 0.25 })
  w_technical: number

  @Expose()
  @ApiProperty({ example: 0.15 })
  w_tactical: number

  @Expose()
  @ApiProperty({ example: 0.2 })
  w_participation: number

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  created_at: Date

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: Date
}
