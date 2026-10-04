import { ApiProperty } from '@nestjs/swagger'
import { Expose, Transform } from 'class-transformer'
import { MlEngineMode } from '../entities/ml-engine-config.entity'

export class ResponseMlEngineConfigDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id_config: number

  @Expose()
  @ApiProperty({ enum: MlEngineMode, example: MlEngineMode.RULES })
  engine: MlEngineMode

  @Expose()
  @ApiProperty({ example: 270 })
  min_labeled_days: number

  @Expose()
  @ApiProperty({ example: 30 })
  min_non_contact_injuries: number

  @Expose()
  @ApiProperty({ example: 20 })
  min_athletes: number

  @Expose()
  @Transform(({ value }) => Number(value))
  @ApiProperty({
    example: 0.25,
    description:
      'Umbral de riesgo medio; debe calibrarse con los datos del club',
  })
  prob_medium_threshold: number

  @Expose()
  @Transform(({ value }) => Number(value))
  @ApiProperty({
    example: 0.5,
    description:
      'Umbral de riesgo alto; debe calibrarse con los datos del club',
  })
  prob_high_threshold: number

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  created_at: Date

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: Date
}
