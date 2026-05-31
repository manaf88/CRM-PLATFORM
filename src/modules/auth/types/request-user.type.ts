import { PlatformRole } from '../../users/enums/platform-role.enum';

export type RequestUser = {
  id: string;
  email: string;
  fullName: string;
  platformRole: PlatformRole;
};