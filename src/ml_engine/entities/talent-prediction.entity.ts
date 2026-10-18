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
import { MlEngineMode } from './ml-engine-config.entity'
import { MlModel } from './ml-model.entity'

@Index('UQ_talent_predictions_user_season', ['id_user', 'id_season'], {
  unique: true,
})
@Entity('talent_predictions')
export class TalentPrediction {
  @PrimaryGeneratedColumn()
  id_prediction: number

  @Column()
  id_user: number

  @Column()
  id_season: number

  @Column()
  id_model: number

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  probability: number

  @Column({ type: 'simple-json' })
  top_factors: { feature: string; contribution: number }[]

  @Column({ type: 'boolean', default: false })
  rules_flagged: boolean

  @Column({ type: 'enum', enum: MlEngineMode })
  engine_mode: MlEngineMode

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

  @ManyToOne(() => MlModel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_model' })
  model: MlModel
}
