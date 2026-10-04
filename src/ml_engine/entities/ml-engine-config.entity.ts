import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

export enum MlEngineMode {
  RULES = 'rules',
  SHADOW = 'shadow',
  ML = 'ml',
}

@Entity('ml_engine_configs')
export class MlEngineConfig {
  @PrimaryGeneratedColumn()
  id_config: number

  @Column({ type: 'enum', enum: MlEngineMode, default: MlEngineMode.RULES })
  engine: MlEngineMode

  @Column({ type: 'int', default: 270 })
  min_labeled_days: number

  @Column({ type: 'int', default: 30 })
  min_non_contact_injuries: number

  @Column({ type: 'int', default: 20 })
  min_athletes: number

  @Column({ type: 'decimal', precision: 4, scale: 3, default: 0.25 })
  prob_medium_threshold: number

  @Column({ type: 'decimal', precision: 4, scale: 3, default: 0.5 })
  prob_high_threshold: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
