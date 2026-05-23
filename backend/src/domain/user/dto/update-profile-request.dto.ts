import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileRequest {
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  @Matches(/^\S+$/, { message: '닉네임에 공백을 포함할 수 없습니다' })
  nickname: string;
}

export class RefreshTokenRequest {
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}
