import { AthletesInCategory } from 'src/athletes_in_categories/entities/athletes_in_category.entity'
import { Competency } from 'src/competencies/entities/competency.entity'
import { Match } from 'src/matches/entities/match.entity'
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id_category: number

  @Column({ nullable: false, length: 100 })
  name: string

  @Column({ nullable: false })
  min_age: number

  @Column({ nullable: false })
  max_age: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @OneToMany(
    () => AthletesInCategory,
    (athletesInCategory) => athletesInCategory.category,
  )
  @JoinColumn({ name: 'id_category' })
  athletesInCategory: AthletesInCategory[]

  @OneToMany(() => Match, (match) => match.category)
  match: Match[]

  @OneToMany(() => Competency, (competency) => competency.category)
  competencies: Competency[]
}
