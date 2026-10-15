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

export enum DevelopmentObjectiveStatus {
  OPEN = 'open',
  ACHIEVED = 'achieved',
  MISSED = 'missed',
}

@Entity('development_objectives')
export class DevelopmentObjective {
  @PrimaryGeneratedColumn()
  id_objective: number

  @Column()
  id_user: number

  @Column()
  id_season: number

  @Column({ type: 'text' })
  description: string

  @Column({ type: 'date' })
  target_date: string

  @Column({
    type: 'enum',
    enum: DevelopmentObjectiveStatus,
    default: DevelopmentObjectiveStatus.OPEN,
  })
  status: DevelopmentObjectiveStatus

  @Column({ type: 'int', nullable: true })
  set_by: number | null

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
  @JoinColumn({ name: 'set_by' })
  setByUser: User
}
