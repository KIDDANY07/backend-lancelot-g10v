import { ApiProperty } from '@nestjs/swagger'
import { IsEnum } from 'class-validator'
import { MlModelTask } from '../entities/ml-model.entity'

export class TrainMlModelDto {
  @IsEnum(MlModelTask, {
    message: 'La tarea debe ser injury_risk o talent',
  })
  @ApiProperty({ enum: MlModelTask })
  task: MlModelTask
}
