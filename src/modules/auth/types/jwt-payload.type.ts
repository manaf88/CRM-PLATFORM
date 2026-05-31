import { PlatformRole } from '../../users/enums/platform-role.enum';

export type JwtPayload = {
  sub: string;
  email: string;
  platformRole: PlatformRole;
};