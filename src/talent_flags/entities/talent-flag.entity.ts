import { Season } from 'src/seasons/entities/season.entity'
import { User } from 'src/users/entities/user.entity'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

export enum TalentFlagStatus {
  OPEN = 'open',
  REVIEWED = 'reviewed',
  DISMISSED = 'dismissed',
}

export enum TalentFlagSource {
  MANUAL = 'manual',
  RULES = 'rules',
  ML = 'ml',
}

@Index('UQ_talent_flags_rules_user_season', ['id_user', 'id_season'], {
  unique: true,
  where: "source = 'rules'",
})
@Entity('talent_flags')
export class TalentFlag {
  @PrimaryGeneratedColumn()
  id_flag: number

  @Column()
  id_user: number

  @Column()
  id_season: number

  @Column({ type: 'text' })
  criteria: string

  @Column({ type: 'text' })
  recommended_action: string

  @Column({
    type: 'enum',
    enum: TalentFlagStatus,
    default: TalentFlagStatus.OPEN,
  })
  status: TalentFlagStatus

  @Column({
    type: 'enum',
    enum: TalentFlagSource,
    default: TalentFlagSource.MANUAL,
  })
  source: TalentFlagSource

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  score?: number | null

  @Column({ type: 'simple-array', nullable: true })
  triggered_rules?: string[] | null

  @Column({ type: 'simple-json', nullable: true })
  warnings?: string[] | null

  @Column({ nullable: true })
  created_by?: number | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => User)
  @JoinColumn({ name: 'id_user' })
  athlete: User

  @ManyToOne(() => Season)
  @JoinColumn({ name: 'id_season' })
  season: Season

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdByUser?: User | null
}
