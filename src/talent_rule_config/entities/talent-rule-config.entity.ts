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

@Index('UQ_talent_rule_configs_category', ['id_category'], {
  unique: true,
  where: 'id_category IS NOT NULL',
})
@Entity('talent_rule_configs')
export class TalentRuleConfig {
  @PrimaryGeneratedColumn()
  id_config: number

  @Column({ nullable: true })
  id_category?: number | null

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 80 })
  min_percentile: number

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 40 })
  min_dimension_score: number

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 5 })
  min_improvement_delta: number

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 50 })
  min_participation_score: number

  @Column({ type: 'boolean', default: true })
  exclude_severe_injury: boolean

  @Column({ type: 'smallint', default: 1 })
  min_supporting_criteria: number

  @Column({ type: 'smallint', default: 12 })
  near_max_age_months: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => Category, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_category' })
  category?: Category | null
}
