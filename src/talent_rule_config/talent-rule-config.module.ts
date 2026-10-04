import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CategoriesModule } from 'src/categories/categories.module'
import { TalentRuleConfig } from './entities/talent-rule-config.entity'
import { TalentRuleConfigController } from './talent-rule-config.controller'
import { TalentRuleConfigService } from './talent-rule-config.service'

@Module({
  imports: [TypeOrmModule.forFeature([TalentRuleConfig]), CategoriesModule],
  controllers: [TalentRuleConfigController],
  providers: [TalentRuleConfigService],
  exports: [TalentRuleConfigService],
})
export class TalentRuleConfigModule {}
