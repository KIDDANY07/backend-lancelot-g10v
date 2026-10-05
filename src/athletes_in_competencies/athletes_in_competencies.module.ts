import { Module } from '@nestjs/common'
import { AthletesInCompetenciesService } from './athletes_in_competencies.service'
import { AthletesInCompetenciesController } from './athletes_in_competencies.controller'
import { UsersModule } from 'src/users/users.module'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AthletesInCompetency } from './entities/athletes_in_competency.entity'
import { Competency } from 'src/competencies/entities/competency.entity'

@Module({
  imports: [
    TypeOrmModule.forFeature([AthletesInCompetency, Competency]),
    UsersModule,
  ],
  controllers: [AthletesInCompetenciesController],
  providers: [AthletesInCompetenciesService],
})
export class AthletesInCompetenciesModule {}
