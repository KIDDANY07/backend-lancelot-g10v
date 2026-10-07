import { Module } from '@nestjs/common'
import { AlertInboxController } from './alert-inbox.controller'
import { AlertInboxService } from './alert-inbox.service'

@Module({
  controllers: [AlertInboxController],
  providers: [AlertInboxService],
})
export class AlertInboxModule {}
