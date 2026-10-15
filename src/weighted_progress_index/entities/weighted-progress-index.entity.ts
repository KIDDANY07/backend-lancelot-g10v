import { PositionWeightProfile } from 'src/position_weight_profiles/entities/position-weight-profile.entity'
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

@Index('UQ_weighted_progress_index_user_season', ['id_user', 'id_season'], {
  unique: true,
})
@Entity('weighted_progress_indices')
export class WeightedProgressIndex {
  @PrimaryGeneratedColumn()
  id_index: number

  @Column()
  id_user: number

  @Column()
  id_season: number

  @Column({ type: 'int', nullable: true })
  id_profile: number | null

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  physical_score: number

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  technical_score: number

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  participation_score: number

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  index_value: number

  @Column({ type: 'simple-array', nullable: true })
  warnings?: string[] | null

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

  @ManyToOne(() => PositionWeightProfile, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'id_profile' })
  profile: PositionWeightProfile
}
