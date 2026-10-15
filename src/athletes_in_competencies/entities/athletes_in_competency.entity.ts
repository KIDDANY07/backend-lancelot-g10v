import { Competency } from 'src/competencies/entities/competency.entity'
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

@Entity('athletes_in_competencies')
export class AthletesInCompetency {
  @PrimaryGeneratedColumn()
  id_ath_comp: number

  @Column({ nullable: false })
  id_user: number

  @Column()
  id_competency: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => User, (user) => user.athletesInCompetency, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_user' })
  user: User

  @ManyToOne(
    () => Competency,
    (competency) => competency.athletesInCompetencyc,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'id_competency' })
  competency: Competency
}
