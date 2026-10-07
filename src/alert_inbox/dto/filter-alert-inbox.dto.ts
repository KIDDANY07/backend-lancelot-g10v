import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'

export const INBOX_KINDS = ['fatigue', 'risk'] as const
export const INBOX_LEVELS = ['bajo', 'medio', 'alto'] as const
export const INBOX_STATUSES = ['open', 'reviewed', 'dismissed'] as const

export type InboxKind = (typeof INBOX_KINDS)[number]
export type InboxLevel = (typeof INBOX_LEVELS)[number]
export type InboxStatus = (typeof INBOX_STATUSES)[number]

export class FilterAlertInboxDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ example: 1, default: 1 })
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({ example: 10, default: 10, maximum: 100 })
  limit?: number = 10

  @IsOptional()
  @IsIn(INBOX_STATUSES)
  @ApiPropertyOptional({ enum: INBOX_STATUSES, default: 'open' })
  status?: InboxStatus = 'open'

  @IsOptional()
  @IsIn(INBOX_KINDS)
  @ApiPropertyOptional({
    enum: INBOX_KINDS,
    description:
      'fatigue: alertas de fatiga; risk: evaluaciones de riesgo de lesión',
  })
  kind?: InboxKind

  @IsOptional()
  @IsIn(INBOX_LEVELS)
  @ApiPropertyOptional({ enum: INBOX_LEVELS })
  level?: InboxLevel
}
