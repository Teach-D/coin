import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { AesEncryptor } from '../../../common/util/aes-encryptor';

export enum AuthProvider {
  GOOGLE = 'GOOGLE',
  KAKAO = 'KAKAO',
}

export enum UserRole {
  ROLE_USER = 'ROLE_USER',
  ROLE_ADMIN = 'ROLE_ADMIN',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', nullable: false, unique: true, length: 500 })
  email: string;

  @Column({ type: 'varchar', nullable: false, unique: true, length: 50 })
  nickname: string;

  @Column({ type: 'varchar', nullable: true, length: 500, name: 'profile_image_url' })
  profileImageUrl: string | null;

  @Column({ type: 'varchar', length: 20, nullable: false })
  provider: AuthProvider;

  @Column({ type: 'varchar', nullable: false, name: 'provider_id' })
  providerId: string;

  @Column({ type: 'varchar', length: 20, nullable: false, default: UserRole.ROLE_USER })
  role: UserRole;

  @Column({ type: 'bigint', nullable: false, default: 10_000_000 })
  balance: number;

  @VersionColumn({ default: 0 })
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  encryptEmail(encryptor: AesEncryptor): void {
    this.email = encryptor.encrypt(this.email);
  }

  decryptEmail(encryptor: AesEncryptor): string {
    return encryptor.decrypt(this.email);
  }
}
