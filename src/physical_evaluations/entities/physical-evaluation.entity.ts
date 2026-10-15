import { Season } from 'src/seasons/entities/season.entity'
import { User } from 'src/users/entities/user.entity'
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

export enum PhysicalEvaluationStage {
  PRE = 'pre',
  MID = 'mid',
  POST = 'post',
}

export enum Vo2TestMethod {
  COURSE_NAVETTE = 'course_navette',
  COOPER = 'cooper',
  OTRO = 'otro',
}

@Entity('physical_evaluations')
export class PhysicalEvaluation {
  @PrimaryGeneratedColumn()
  id_eval: number

  @Column()
  id_user: number

  @Column()
  id_season: number

  @Column({ type: 'enum', enum: PhysicalEvaluationStage })
  stage: PhysicalEvaluationStage

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  height_cm: number

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  weight_kg: number

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  vo2max_estimado?: number | null

  @Column({ type: 'enum', enum: Vo2TestMethod, nullable: true })
  test_method?: Vo2TestMethod | null

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  speed_20m?: number | null

  @Column({ type: 'date' })
  eval_date: string

  @Column({ type: 'int', nullable: true })
  evaluator_id?: number | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  athlete: User

  @ManyToOne(() => Season)
  @JoinColumn({ name: 'id_season' })
  season: Season

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'evaluator_id' })
  evaluator?: User | null
}
