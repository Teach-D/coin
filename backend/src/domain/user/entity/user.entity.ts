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

  @Column({ type: 'varchar', nullable: true, unique: true, length: 500 })
  email: string | null;

  @Column({ type: 'varchar', nullable: false, unique: true, length: 50 })
  nickname: string;

  @Column({ name: 'nickname_set', type: 'boolean', nullable: false, default: false })
  nicknameSet: boolean;

  @Column({ type: 'varchar', nullable: true, length: 500, name: 'profile_image_url' })
  profileImageUrl: string | null;

  @Column({ type: 'varchar', length: 20, nullable: false })
  provider: AuthProvider;

  @Column({ type: 'varchar', nullable: true, name: 'provider_id' })
  providerId: string | null;

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

  @Column({ type: 'timestamptz', nullable: true, name: 'deleted_at', default: null })
  deletedAt: Date | null = null;

  withdraw(): void {
    this.email = null;
    this.profileImageUrl = null;
    this.providerId = null;
    this.nickname = `(탈퇴한 사용자)-${this.id}`;
    this.deletedAt = new Date();
  }

  isWithdrawn(): boolean {
    return this.deletedAt !== null;
  }

  encryptEmail(encryptor: AesEncryptor): void {
    if (this.email !== null) {
      this.email = encryptor.encrypt(this.email);
    }
  }

  decryptEmail(encryptor: AesEncryptor): string | null {
    if (this.email === null) return null;
    return encryptor.decrypt(this.email);
  }
}
