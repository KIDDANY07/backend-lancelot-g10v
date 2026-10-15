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

export enum FatigueAlertLevel {
  BAJO = 'bajo',
  MEDIO = 'medio',
  ALTO = 'alto',
}

export enum FatigueAlertStatus {
  OPEN = 'open',
  REVIEWED = 'reviewed',
  DISMISSED = 'dismissed',
}

@Entity('fatigue_alerts')
export class FatigueAlert {
  @PrimaryGeneratedColumn()
  id_alert: number

  @Column()
  id_user: number

  @Column({ type: 'date' })
  date: string

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  acute_load: number

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  chronic_load: number

  @Column({ type: 'decimal', precision: 4, scale: 2 })
  acwr_value: number

  @Column({ type: 'decimal', precision: 3, scale: 1 })
  rpe_avg: number

  @Column({ type: 'enum', enum: FatigueAlertLevel })
  level: FatigueAlertLevel

  @Column({
    type: 'enum',
    enum: FatigueAlertStatus,
    default: FatigueAlertStatus.OPEN,
  })
  status: FatigueAlertStatus

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  athlete: User
}
