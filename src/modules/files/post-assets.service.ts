import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ContentPost } from '../content/entities/content-post.entity';
import { AttachPostAssetDto } from './dto/attach-post-asset.dto';
import { FileEntity } from './entities/file.entity';
import { PostAsset } from './entities/post-asset.entity';

@Injectable()
export class PostAssetsService {
  constructor(
    @InjectRepository(PostAsset)
    private readonly postAssetsRepository: Repository<PostAsset>,
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    @InjectRepository(ContentPost)
    private readonly postsRepository: Repository<ContentPost>,
  ) {}

  async attachFileToPost(
    companyId: string,
    postId: string,
    dto: AttachPostAssetDto,
  ): Promise<PostAsset> {
    await this.ensurePostExists(companyId, postId);
    await this.ensureFileExists(companyId, dto.fileId);

    const postAsset = this.postAssetsRepository.create({
      companyId,
      postId,
      fileId: dto.fileId,
      assetType: dto.assetType,
    });

    return this.postAssetsRepository.save(postAsset);
  }

  async findPostAssets(
    companyId: string,
    postId: string,
  ): Promise<PostAsset[]> {
    await this.ensurePostExists(companyId, postId);

    return this.postAssetsRepository.find({
      where: {
        companyId,
        postId,
      },
      relations: {
        file: true,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  async removePostAsset(
    companyId: string,
    postId: string,
    assetId: string,
  ): Promise<{ success: true }> {
    const asset = await this.postAssetsRepository.findOne({
      where: {
        id: assetId,
        companyId,
        postId,
      },
    });

    if (!asset) {
      throw new NotFoundException('Post asset not found');
    }

    await this.postAssetsRepository.remove(asset);

    return { success: true };
  }

  private async ensurePostExists(
    companyId: string,
    postId: string,
  ): Promise<void> {
    const post = await this.postsRepository.findOne({
      where: {
        id: postId,
        companyId,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }
  }

  private async ensureFileExists(
    companyId: string,
    fileId: string,
  ): Promise<void> {
    const file = await this.filesRepository.findOne({
      where: {
        id: fileId,
        companyId,
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }
  }
}