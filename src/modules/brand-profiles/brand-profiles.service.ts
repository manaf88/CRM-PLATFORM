import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { CreateBrandProfileDto } from './dto/create-brand-profile.dto';
import { UpdateBrandProfileDto } from './dto/update-brand-profile.dto';
import { BrandProfile } from './entities/brand-profile.entity';

@Injectable()
export class BrandProfilesService {
  constructor(
    @InjectRepository(BrandProfile)
    private readonly brandProfilesRepository: Repository<BrandProfile>,
  ) {}

  async create(
    companyId: string,
    dto: CreateBrandProfileDto,
    currentUser: RequestUser,
  ): Promise<BrandProfile> {
    const existingProfile = await this.brandProfilesRepository.findOne({
      where: { companyId },
    });

    if (existingProfile) {
      throw new ConflictException(
        'Brand profile already exists for this company',
      );
    }

    const profile = this.brandProfilesRepository.create({
      companyId,
      brandName: dto.brandName.trim(),
      industry: this.cleanOptionalString(dto.industry),
      description: this.cleanOptionalString(dto.description),
      targetAudience: this.cleanOptionalString(dto.targetAudience),
      toneOfVoice: this.cleanOptionalString(dto.toneOfVoice),
      languages: dto.languages ?? [],
      colors: dto.colors ?? [],
      services: dto.services ?? [],
      offers: dto.offers ?? [],
      serviceAreas: this.cleanStringArray(dto.serviceAreas),
      ctaPreferences: this.cleanStringArray(dto.ctaPreferences),
      forbiddenWords: this.cleanStringArray(dto.forbiddenWords),
      brandNotes: this.cleanOptionalString(dto.brandNotes),
      createdById: currentUser.id,
      updatedById: currentUser.id,
    });

    return this.brandProfilesRepository.save(profile);
  }

  async findByCompanyId(companyId: string): Promise<BrandProfile> {
    const profile = await this.brandProfilesRepository.findOne({
      where: { companyId },
    });

    if (!profile) {
      throw new NotFoundException('Brand profile not found');
    }

    return profile;
  }

  async update(
    companyId: string,
    dto: UpdateBrandProfileDto,
    currentUser: RequestUser,
  ): Promise<BrandProfile> {
    const profile = await this.findByCompanyId(companyId);

    if (dto.brandName !== undefined) {
      profile.brandName = dto.brandName.trim();
    }

    if (dto.industry !== undefined) {
      profile.industry = this.cleanOptionalString(dto.industry);
    }

    if (dto.description !== undefined) {
      profile.description = this.cleanOptionalString(dto.description);
    }

    if (dto.targetAudience !== undefined) {
      profile.targetAudience = this.cleanOptionalString(dto.targetAudience);
    }

    if (dto.toneOfVoice !== undefined) {
      profile.toneOfVoice = this.cleanOptionalString(dto.toneOfVoice);
    }

    if (dto.languages !== undefined) {
      profile.languages = dto.languages;
    }

    if (dto.colors !== undefined) {
      profile.colors = dto.colors;
    }

    if (dto.services !== undefined) {
      profile.services = dto.services;
    }

    if (dto.offers !== undefined) {
      profile.offers = dto.offers;
    }

    if (dto.serviceAreas !== undefined) {
      profile.serviceAreas = this.cleanStringArray(dto.serviceAreas);
    }

    if (dto.ctaPreferences !== undefined) {
      profile.ctaPreferences = this.cleanStringArray(dto.ctaPreferences);
    }

    if (dto.forbiddenWords !== undefined) {
      profile.forbiddenWords = this.cleanStringArray(dto.forbiddenWords);
    }

    if (dto.brandNotes !== undefined) {
      profile.brandNotes = this.cleanOptionalString(dto.brandNotes);
    }

    profile.updatedById = currentUser.id;

    return this.brandProfilesRepository.save(profile);
  }

  private cleanOptionalString(value?: string): string | null {
    if (value === undefined) {
      return null;
    }

    const cleaned = value.trim();

    return cleaned.length > 0 ? cleaned : null;
  }

  private cleanStringArray(values?: string[]): string[] {
    if (!values) {
      return [];
    }

    return values
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }
}