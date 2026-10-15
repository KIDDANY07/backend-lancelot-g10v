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

export enum HealthRecordStatus {
  ACTIVE = 'active',
  RESOLVED = 'resolved',
}

@Entity('health_records')
export class HealthRecord {
  @PrimaryGeneratedColumn()
  id_health: number

  @Column()
  id_user: number

  @Column({ length: 60 })
  condition_type: string

  @Column({ type: 'text' })
  description: string

  @Column({ default: false })
  restriction: boolean

  @Column({
    type: 'enum',
    enum: HealthRecordStatus,
    default: HealthRecordStatus.ACTIVE,
  })
  status: HealthRecordStatus

  @Column({ type: 'int', nullable: true })
  registered_by: number | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  athlete: User

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'registered_by' })
  registeredByUser: User
}
