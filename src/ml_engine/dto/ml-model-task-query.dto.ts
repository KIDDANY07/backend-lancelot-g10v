import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional } from 'class-validator'
import { MlModelTask } from '../entities/ml-model.entity'

export class MlModelTaskQueryDto {
  @IsOptional()
  @IsEnum(MlModelTask)
  @ApiPropertyOptional({ enum: MlModelTask, default: MlModelTask.INJURY_RISK })
  task?: MlModelTask
}
