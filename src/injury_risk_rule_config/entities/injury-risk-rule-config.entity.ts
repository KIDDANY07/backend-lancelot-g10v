import { Category } from 'src/categories/entities/category.entity'
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

@Index('UQ_injury_risk_rule_configs_category', ['id_category'], {
  unique: true,
  where: 'id_category IS NOT NULL',
})
@Entity('injury_risk_rule_configs')
export class InjuryRiskRuleConfig {
  @PrimaryGeneratedColumn()
  id_config: number

  @Column({ nullable: true })
  id_category?: number | null

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 1.5 })
  sustained_acwr_threshold: number

  @Column({ type: 'int', default: 2 })
  sustained_acwr_min_days: number

  @Column({ type: 'int', default: 7 })
  sustained_acwr_lookback_days: number

  @Column({ type: 'smallint', default: 8 })
  sustained_rpe_threshold: number

  @Column({ type: 'int', default: 3 })
  sustained_rpe_min_sessions: number

  @Column({ type: 'int', default: 14 })
  sustained_rpe_lookback_days: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => Category, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_category' })
  category?: Category | null
}
