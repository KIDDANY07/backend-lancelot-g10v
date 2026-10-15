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

export enum ParentalConsentStatus {
  PENDING = 'pending',
  GRANTED = 'granted',
  REVOKED = 'revoked',
}

@Entity('parental_consents')
export class ParentalConsent {
  @PrimaryGeneratedColumn()
  id_consent: number

  @Column()
  id_user: number

  @Column({ length: 150 })
  guardian_name: string

  @Column({ length: 30 })
  guardian_document: string

  @Column({ length: 40 })
  guardian_relationship: string

  @Column({ type: 'timestamptz' })
  signed_at: Date

  @Column({ type: 'varchar', length: 255, nullable: true })
  document_url?: string | null

  @Column({
    type: 'enum',
    enum: ParentalConsentStatus,
    default: ParentalConsentStatus.PENDING,
  })
  status: ParentalConsentStatus

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  athlete: User
}
