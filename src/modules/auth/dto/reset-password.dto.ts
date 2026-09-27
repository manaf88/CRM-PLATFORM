import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  /**
   * Twelve, not eight: every other way of setting a password on this platform
   * (create user, accept invitation, bootstrap admin) asks for twelve, and a
   * reset that accepted less would be the short way round all of them.
   */
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
