import { Module } from '@nestjs/common'
import { AthletesInCategoriesService } from './athletes_in_categories.service'
import { AthletesInCategoriesController } from './athletes_in_categories.controller'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AthletesInCategory } from './entities/athletes_in_category.entity'
import { UsersModule } from 'src/users/users.module'
import { RolesModule } from 'src/roles/roles.module'
import { SeasonsModule } from 'src/seasons/seasons.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([AthletesInCategory]),
    UsersModule,
    RolesModule,
    SeasonsModule,
  ],
  controllers: [AthletesInCategoriesController],
  providers: [AthletesInCategoriesService],
  exports: [AthletesInCategoriesService],
})
export class AthletesInCategoriesModule {}
