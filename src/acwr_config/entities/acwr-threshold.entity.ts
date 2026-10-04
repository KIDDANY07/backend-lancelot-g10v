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

@Index('UQ_acwr_thresholds_category', ['id_category'], {
  unique: true,
  where: 'id_category IS NOT NULL',
})
@Entity('acwr_thresholds')
export class AcwrThreshold {
  @PrimaryGeneratedColumn()
  id_threshold: number

  @Column({ nullable: true })
  id_category?: number | null

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 0.8 })
  low_min: number

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 1.3 })
  low_max: number

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 1.5 })
  medium_max: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => Category, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_category' })
  category?: Category | null
}
