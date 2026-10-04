import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AthletesInCategory } from 'src/athletes_in_categories/entities/athletes_in_category.entity'
import { Category } from 'src/categories/entities/category.entity'
import { Match } from 'src/matches/entities/match.entity'
import { MatchStatistic } from 'src/match_statistics/entities/match-statistic.entity'
import { PhysicalEvaluation } from 'src/physical_evaluations/entities/physical-evaluation.entity'
import { PositionWeightProfilesModule } from 'src/position_weight_profiles/position-weight-profiles.module'
import { SeasonsModule } from 'src/seasons/seasons.module'
import { TechnicalEvaluation } from 'src/technical_evaluations/entities/technical-evaluation.entity'
import { TrainingLoad } from 'src/training_loads/entities/training-load.entity'
import { TrainingSession } from 'src/training_sessions/entities/training-session.entity'
import { UsersModule } from 'src/users/users.module'
import { WeightedProgressIndex } from './entities/weighted-progress-index.entity'
import { ProgressIndexCalculatorService } from './progress-index-calculator.service'
import { WeightedProgressIndexController } from './weighted-progress-index.controller'
import { WeightedProgressIndexService } from './weighted-progress-index.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WeightedProgressIndex,
      AthletesInCategory,
      Category,
      PhysicalEvaluation,
      TechnicalEvaluation,
      TrainingSession,
      TrainingLoad,
      Match,
      MatchStatistic,
    ]),
    UsersModule,
    SeasonsModule,
    PositionWeightProfilesModule,
  ],
  controllers: [WeightedProgressIndexController],
  providers: [WeightedProgressIndexService, ProgressIndexCalculatorService],
  exports: [WeightedProgressIndexService, ProgressIndexCalculatorService],
})
export class WeightedProgressIndexModule {}
