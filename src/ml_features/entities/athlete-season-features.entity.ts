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

export enum TalentLabelQuality {
  PENDING = 'pending',
  LABELED = 'labeled',
  EXCLUDED = 'excluded',
}

export const TALENT_FEATURE_VERSION = 't1'

@Index('UQ_athlete_season_features_user_season', ['id_user', 'id_season'], {
  unique: true,
})
@Entity('athlete_season_features')
export class AthleteSeasonFeatures {
  @PrimaryGeneratedColumn()
  id_feature: number

  @Column()
  id_user: number

  @Column()
  id_season: number

  @Column({ type: 'date' })
  season_start: string

  @Column()
  id_category: number

  @Column({ type: 'varchar', length: 30, nullable: true })
  position?: string | null

  @Column({ type: 'int', nullable: true })
  age_years?: number | null

  @Column({ type: 'smallint', nullable: true })
  birth_quarter?: number | null

  @Column({ type: 'int', nullable: true })
  years_to_category_max?: number | null

  @Column({ type: 'boolean', default: false })
  plays_up: boolean

  @Column({ type: 'int', default: 0 })
  seasons_in_club: number

  @Column({ type: 'int' })
  cohort_size: number

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  index_value: number

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  index_percentile: number

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  physical_score: number

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  technical_score: number

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  tactical_score?: number | null

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  participation_score: number

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  contribution_score?: number | null

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  index_delta?: number | null

  @Column({ type: 'int', default: 0 })
  injuries_in_season: number

  @Column({ type: 'boolean', default: false })
  severe_injury: boolean

  @Column({ type: 'boolean', default: false })
  rules_flagged: boolean

  @Column({ type: 'boolean', nullable: true })
  label_promoted?: boolean | null

  @Column({
    type: 'enum',
    enum: TalentLabelQuality,
    default: TalentLabelQuality.PENDING,
  })
  label_quality: TalentLabelQuality

  @Column({ type: 'varchar', length: 10, default: TALENT_FEATURE_VERSION })
  feature_version: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  athlete: User

  @ManyToOne(() => Season, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_season' })
  season: Season
}
