import { AthletesInCompetency } from 'src/athletes_in_competencies/entities/athletes_in_competency.entity'
import { Category } from 'src/categories/entities/category.entity'
import { Match } from 'src/matches/entities/match.entity'
import { Season } from 'src/seasons/entities/season.entity'
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('competencies')
export class Competency {
  @PrimaryGeneratedColumn()
  id_competency: number

  @Column({ nullable: false })
  id_category: number

  @Column({ nullable: false })
  name: string

  @Column({ nullable: true })
  description: string

  @Column({ nullable: false })
  start_date: Date

  @Column({ nullable: true })
  finish_date: Date

  @Column({ nullable: false })
  id_season: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @OneToMany(
    () => AthletesInCompetency,
    (athletesInCompetencyc) => athletesInCompetencyc.competency,
  )
  @JoinColumn({ name: 'id_competency' })
  athletesInCompetencyc: AthletesInCompetency[]

  @OneToMany(() => Match, (match) => match.competency)
  match: Match[]

  @ManyToOne(() => Category, (category) => category.competencies)
  @JoinColumn({ name: 'id_category' })
  category: Category

  @ManyToOne(() => Season, { nullable: false })
  @JoinColumn({ name: 'id_season' })
  season: Season
}
