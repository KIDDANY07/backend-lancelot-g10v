import { AthletesInCategory } from 'src/athletes_in_categories/entities/athletes_in_category.entity'
import { AthletesInCompetency } from 'src/athletes_in_competencies/entities/athletes_in_competency.entity'
import { Role } from 'src/roles/entities/role.entity'
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id_user: number

  @Column({ nullable: false })
  id_role: number

  @Column({ nullable: false, length: 100 })
  name: string

  @Column({ nullable: false, length: 100 })
  lastname: string

  @Column({ nullable: false, length: 150 })
  email: string

  @Column({ nullable: false, length: 255 })
  password: string

  @Column({ type: 'date', nullable: true })
  birth_date?: string | null

  @Column({ type: 'timestamptz', nullable: true })
  data_policy_accepted_at?: Date | null

  @Column({ type: 'varchar', length: 20, nullable: true })
  data_policy_version?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => Role, (role) => role.user)
  @JoinColumn({ name: 'id_role' })
  role: Role

  @OneToMany(
    () => AthletesInCategory,
    (athletesInCategory) => athletesInCategory.user,
  )
  @JoinColumn({ name: 'id_user' })
  athletesInCategory: AthletesInCategory[]

  @OneToMany(
    () => AthletesInCompetency,
    (athletesInCompetency) => athletesInCompetency.user,
  )
  @JoinColumn({ name: 'id_user' })
  athletesInCompetency: AthletesInCompetency[]
}
