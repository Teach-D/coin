import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthProvider, User } from '../entity/user.entity';

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  async findById(id: number): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByProviderAndProviderId(provider: AuthProvider, providerId: string): Promise<User | null> {
    return this.repo.findOne({ where: { provider, providerId } });
  }

  async existsByNickname(nickname: string): Promise<boolean> {
    return this.repo.exists({ where: { nickname } });
  }

  async findAll(): Promise<User[]> {
    return this.repo.find();
  }

  async findAllByIds(ids: number[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return this.repo.findByIds(ids);
  }

  async save(user: User): Promise<User> {
    return this.repo.save(user);
  }
}
