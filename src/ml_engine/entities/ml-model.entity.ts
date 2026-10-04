import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

export interface MlModelMetrics {
  roc_auc?: number | null
  pr_auc?: number | null
  recall?: number | null
  precision?: number | null
  brier?: number | null
  n_train?: number | null
  n_test?: number | null
  positives_test?: number | null
}

@Index('UQ_ml_models_version', ['version'], { unique: true })
@Index('UQ_ml_models_active', ['is_active'], {
  unique: true,
  where: 'is_active = true',
})
@Entity('ml_models')
export class MlModel {
  @PrimaryGeneratedColumn()
  id_model: number

  @Column({ length: 50 })
  version: string

  @Column({ length: 50 })
  algorithm: string

  @Column({ length: 10 })
  feature_version: string

  @Column({ type: 'simple-json' })
  features: string[]

  @Column({ type: 'simple-json' })
  metrics: MlModelMetrics

  @Column({ type: 'simple-json', nullable: true })
  rules_baseline_metrics?: MlModelMetrics | null

  @Column({ type: 'date' })
  train_from: string

  @Column({ type: 'date' })
  train_to: string

  @Column({ type: 'date' })
  test_from: string

  @Column({ type: 'date' })
  test_to: string

  @Column({ type: 'boolean', default: false })
  is_synthetic: boolean

  @Column({ type: 'boolean', default: false })
  is_active: boolean

  @Column({ type: 'text', nullable: true })
  notes?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
