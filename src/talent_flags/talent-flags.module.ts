import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AthletesInCategory } from 'src/athletes_in_categories/entities/athletes_in_category.entity'
import { Category } from 'src/categories/entities/category.entity'
import { Injury } from 'src/injuries/entities/injury.entity'
import { SeasonsModule } from 'src/seasons/seasons.module'
import { TalentRuleConfigModule } from 'src/talent_rule_config/talent-rule-config.module'
import { UsersModule } from 'src/users/users.module'
import { WeightedProgressIndex } from 'src/weighted_progress_index/entities/weighted-progress-index.entity'
import { WeightedProgressIndexModule } from 'src/weighted_progress_index/weighted-progress-index.module'
import { TalentFlag } from './entities/talent-flag.entity'
import { TalentDetectionRulesService } from './talent-detection-rules.service'
import { TalentDetectionListener } from './talent-detection.listener'
import { TalentDetectionService } from './talent-detection.service'
import { TalentFlagsController } from './talent-flags.controller'
import { TalentFlagsService } from './talent-flags.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TalentFlag,
      WeightedProgressIndex,
      AthletesInCategory,
      Category,
      Injury,
    ]),
    UsersModule,
    SeasonsModule,
    WeightedProgressIndexModule,
    TalentRuleConfigModule,
  ],
  controllers: [TalentFlagsController],
  providers: [
    TalentFlagsService,
    TalentDetectionService,
    TalentDetectionRulesService,
    TalentDetectionListener,
  ],
  exports: [TalentFlagsService, TalentDetectionService],
})
export class TalentFlagsModule {}
