import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AthletesInCategoriesModule } from 'src/athletes_in_categories/athletes_in_categories.module'
import { AthletesInCategory } from 'src/athletes_in_categories/entities/athletes_in_category.entity'
import { Category } from 'src/categories/entities/category.entity'
import { DevelopmentObjective } from 'src/development_objectives/entities/development-objective.entity'
import { SeasonsModule } from 'src/seasons/seasons.module'
import { TalentFlag } from 'src/talent_flags/entities/talent-flag.entity'
import { WeightedProgressIndex } from 'src/weighted_progress_index/entities/weighted-progress-index.entity'
import { SeasonPlanningRulesService } from './season-planning-rules.service'
import { SeasonPlanningController } from './season-planning.controller'
import { SeasonPlanningService } from './season-planning.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AthletesInCategory,
      Category,
      WeightedProgressIndex,
      TalentFlag,
      DevelopmentObjective,
    ]),
    SeasonsModule,
    AthletesInCategoriesModule,
  ],
  controllers: [SeasonPlanningController],
  providers: [SeasonPlanningService, SeasonPlanningRulesService],
})
export class SeasonPlanningModule {}
