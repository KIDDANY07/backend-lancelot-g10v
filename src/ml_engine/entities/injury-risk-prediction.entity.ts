import { InjuryRiskLevel } from 'src/injury_risk_assessments/entities/injury-risk-assessment.entity'
import type { MlTopFactor } from 'src/injury_risk_assessments/predictors/injury-risk-predictor.interface'
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

@Index('UQ_injury_risk_predictions_user_date', ['id_user', 'date'], {
  unique: true,
})
@Entity('injury_risk_predictions')
export class InjuryRiskPrediction {
  @PrimaryGeneratedColumn()
  id_prediction: number

  @Column()
  id_user: number

  @Column({ type: 'date' })
  date: string

  @Column()
  id_model: number

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  probability: number

  @Column({ type: 'enum', enum: InjuryRiskLevel, nullable: true })
  risk_level?: InjuryRiskLevel | null

  @Column({ type: 'simple-json', nullable: true })
  top_factors?: MlTopFactor[] | null

  @Column({ type: 'enum', enum: InjuryRiskLevel, nullable: true })
  rules_risk_level?: InjuryRiskLevel | null

  @Column({ type: 'enum', enum: MlEngineMode })
  engine_mode: MlEngineMode

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  athlete: User

  @ManyToOne(() => MlModel)
  @JoinColumn({ name: 'id_model' })
  model: MlModel
}
