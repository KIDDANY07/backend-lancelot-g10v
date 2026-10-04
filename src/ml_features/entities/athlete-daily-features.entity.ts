import { InjuryRiskLevel } from 'src/injury_risk_assessments/entities/injury-risk-assessment.entity'
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

export enum FeatureLabelQuality {
  PENDING = 'pending',
  LABELED = 'labeled',
  UNKNOWN_MECHANISM = 'unknown_mechanism',
}

export const FEATURE_VERSION = 'v1'

@Index('UQ_athlete_daily_features_user_date', ['id_user', 'date'], {
  unique: true,
})
@Entity('athlete_daily_features')
export class AthleteDailyFeatures {
  @PrimaryGeneratedColumn()
  id_feature: number

  @Column()
  id_user: number

  @Index('IDX_athlete_daily_features_date')
  @Column({ type: 'date' })
  date: string

  @Column({ type: 'int', nullable: true })
  id_season?: number | null

  @Column({ type: 'int', nullable: true })
  id_category?: number | null

  @Column({ type: 'varchar', length: 30, nullable: true })
  position?: string | null

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  age_years?: number | null

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  acute_load_7d: number

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  chronic_load_28d: number

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  acwr?: number | null

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  acwr_ewma?: number | null

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  monotony_7d?: number | null

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  strain_7d?: number | null

  @Column({ type: 'smallint', default: 0 })
  sessions_7d: number

  @Column({ type: 'decimal', precision: 4, scale: 2, nullable: true })
  rpe_avg_7d?: number | null

  @Column({ type: 'int', default: 0 })
  match_minutes_7d: number

  @Column({ type: 'smallint', default: 0 })
  high_rpe_sessions_14d: number

  @Column({ type: 'int', default: 0 })
  prior_injuries_count: number

  @Column({ type: 'int', default: 0 })
  prior_non_contact_injuries_count: number

  @Column({ type: 'int', nullable: true })
  days_since_last_injury?: number | null

  @Column({ type: 'boolean', default: false })
  is_recovering: boolean

  @Column({ type: 'boolean', default: true })
  is_available: boolean

  @Column({ type: 'enum', enum: InjuryRiskLevel, nullable: true })
  rules_risk_level?: InjuryRiskLevel | null

  @Column({ type: 'boolean', nullable: true })
  label_injury_7d?: boolean | null

  @Column({
    type: 'enum',
    enum: FeatureLabelQuality,
    default: FeatureLabelQuality.PENDING,
  })
  label_quality: FeatureLabelQuality

  @Column({ type: 'timestamptz', nullable: true })
  labeled_at?: Date | null

  @Column({ type: 'varchar', length: 10, default: FEATURE_VERSION })
  feature_version: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  athlete: User
}
