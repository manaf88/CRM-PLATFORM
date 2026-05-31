import { IsEnum, IsUUID } from 'class-validator';

import { PostAssetType } from '../enums/post-asset-type.enum';

export class AttachPostAssetDto {
  @IsUUID()
  fileId!: string;

  @IsEnum(PostAssetType)
  assetType!: PostAssetType;
}