import { PartialType } from '@nestjs/mapped-types';

import { CreateResponsibilityAreaDto } from './create-responsibility-area.dto';

export class UpdateResponsibilityAreaDto extends PartialType(
  CreateResponsibilityAreaDto,
) {}