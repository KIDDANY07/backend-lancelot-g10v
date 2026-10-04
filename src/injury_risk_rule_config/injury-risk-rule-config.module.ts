import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CategoriesModule } from 'src/categories/categories.module'
import { InjuryRiskRuleConfig } from './entities/injury-risk-rule-config.entity'
import { InjuryRiskRuleConfigController } from './injury-risk-rule-config.controller'
import { InjuryRiskRuleConfigService } from './injury-risk-rule-config.service'

@Module({
  imports: [TypeOrmModule.forFeature([InjuryRiskRuleConfig]), CategoriesModule],
  controllers: [InjuryRiskRuleConfigController],
  providers: [InjuryRiskRuleConfigService],
  exports: [InjuryRiskRuleConfigService],
})
export class InjuryRiskRuleConfigModule {}
