import { PartialType } from '@nestjs/mapped-types';

import { CreateBrandProfileDto } from './create-brand-profile.dto';

export class UpdateBrandProfileDto extends PartialType(
  CreateBrandProfileDto,
) {}