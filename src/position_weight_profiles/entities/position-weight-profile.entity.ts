import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

@Index('UQ_position_weight_profiles_position_age_category', [
  'position',
  'age_category',
], { unique: true })
@Entity('position_weight_profiles')
export class PositionWeightProfile {
  @PrimaryGeneratedColumn()
  id_profile: number

  @Column({ length: 50 })
  position: string

  @Column({ length: 100 })
  age_category: string

  @Column({ type: 'decimal', precision: 3, scale: 2 })
  w_physical: number

  @Column({ type: 'decimal', precision: 3, scale: 2 })
  w_technical: number

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  w_tactical: number

  @Column({ type: 'decimal', precision: 3, scale: 2 })
  w_participation: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
