import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class AesEncryptor {
  private readonly algorithm = 'aes-256-cbc';
  private readonly key: Buffer;
  private readonly iv: Buffer;

  constructor(private readonly configService: ConfigService) {
    const rawKey = Buffer.from(configService.get<string>('AES_KEY', ''), 'base64');
    const paddedKey = Buffer.alloc(32);
    rawKey.copy(paddedKey);
    this.key = paddedKey;

    const hash = crypto.createHash('sha256').update(rawKey).digest();
    this.iv = hash.subarray(0, 16);
  }

  encrypt(plainText: string): string {
    const cipher = crypto.createCipheriv(this.algorithm, this.key, this.iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    return encrypted.toString('base64');
  }

  decrypt(cipherText: string): string {
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, this.iv);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(cipherText, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
