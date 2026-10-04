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

export enum InjurySeverity {
  LEVE = 'leve',
  MODERADA = 'moderada',
  SEVERA = 'severa',
}

export enum InjuryStatus {
  ACTIVE = 'active',
  RECOVERING = 'recovering',
  RECOVERED = 'recovered',
}

export enum InjuryMechanism {
  CONTACTO = 'contacto',
  SIN_CONTACTO = 'sin_contacto',
}

@Entity('injuries')
export class Injury {
  @PrimaryGeneratedColumn()
  id_injury: number

  @Column()
  id_user: number

  @Column({ type: 'date' })
  injury_date: string

  @Column({ length: 50 })
  body_part: string

  @Column({ type: 'enum', enum: InjurySeverity })
  severity: InjurySeverity

  @Column({ type: 'text', nullable: true })
  diagnosis?: string | null

  @Column({ type: 'date', nullable: true })
  recovery_date?: string | null

  @Column({
    type: 'enum',
    enum: InjuryStatus,
    default: InjuryStatus.ACTIVE,
  })
  status: InjuryStatus

  @Column({ type: 'enum', enum: InjuryMechanism, nullable: true })
  mechanism?: InjuryMechanism | null

  @Column({ type: 'int', nullable: true })
  time_loss_days?: number | null

  @Column()
  registered_by: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => User)
  @JoinColumn({ name: 'id_user' })
  athlete: User

  @ManyToOne(() => User)
  @JoinColumn({ name: 'registered_by' })
  registeredByUser: User
}
