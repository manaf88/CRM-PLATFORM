import { ArrayMaxSize, IsArray, IsBoolean, IsEnum } from 'class-validator';

import { NotificationType } from '../enums/notification-type.enum';

/**
 * A full replacement, not a patch: the settings screen sends the whole state
 * every time, so a missing key means "off", never "leave it alone".
 */
export class UpdateNotificationPreferencesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsEnum(NotificationType, { each: true })
  mutedTypes!: NotificationType[];

  @IsBoolean()
  emailDigest!: boolean;
}
