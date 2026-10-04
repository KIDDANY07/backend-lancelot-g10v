import { User } from 'src/users/entities/user.entity'
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

export enum InjuryRiskAssessmentMethod {
  RULES = 'rules',
  ML_MODEL = 'ml_model',
}

export enum InjuryRiskLevel {
  BAJO = 'bajo',
  MEDIO = 'medio',
  ALTO = 'alto',
}

export enum InjuryRiskAssessmentStatus {
  OPEN = 'open',
  REVIEWED = 'reviewed',
  DISMISSED = 'dismissed',
}

export enum InjuryRiskRuleCode {
  SUSTAINED_ACWR = 'acwr_sostenido',
  SUSTAINED_HIGH_RPE = 'rpe_alto_sostenido',
  RELAPSE = 'recaida',
  ML_PREDICTION = 'prediccion_ml',
}

@Entity('injury_risk_assessments')
export class InjuryRiskAssessment {
  @PrimaryGeneratedColumn()
  id_assessment: number

  @Column()
  id_user: number

  @Column({ type: 'date' })
  assessment_date: string

  @Column({ type: 'enum', enum: InjuryRiskAssessmentMethod })
  method: InjuryRiskAssessmentMethod

  @Column({ type: 'enum', enum: InjuryRiskLevel })
  risk_level: InjuryRiskLevel

  @Column({ type: 'simple-array' })
  triggered_rules: InjuryRiskRuleCode[]

  @Column({ type: 'text', nullable: true })
  details?: string | null

  @Column({ type: 'decimal', precision: 4, scale: 2, nullable: true })
  acwr_value?: number | null

  @Column({
    type: 'enum',
    enum: InjuryRiskAssessmentStatus,
    default: InjuryRiskAssessmentStatus.OPEN,
  })
  status: InjuryRiskAssessmentStatus

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => User)
  @JoinColumn({ name: 'id_user' })
  athlete: User
}
