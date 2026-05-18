import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateProfileRequest {
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  nickname: string;
}

export class RefreshTokenRequest {
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}
