import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestUser } from '../auth/types/request-user.type';
import { MembershipsService } from '../memberships/memberships.service';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { StorageService } from '../files/storage.service';
import { PlatformRole } from '../users/enums/platform-role.enum';
import {
  AttachmentsService,
  MAX_ATTACHMENTS_PER_ENTITY,
} from './attachments.service';
import { EntityAttachment } from './entities/entity-attachment.entity';
import { AttachmentEntityType } from './enums/attachment-entity-type.enum';

/**
 * The rules that stop the attachments feature turning into a dumping ground,
 * and the one that decides who may take a file back down.
 */
describe('AttachmentsService', () => {
  const COMPANY = 'company-1';
  const TASK = 'task-1';

  const user = (id: string, platformRole = PlatformRole.USER): RequestUser => ({
    id,
    email: `${id}@example.com`,
    fullName: id,
    platformRole,
  });

  const build = (options: {
    fileSizeBytes?: number;
    existingCount?: number;
    existingAttachment?: Partial<EntityAttachment> | null;
    roles?: CompanyMembershipRole[];
    otherReferences?: number;
  }) => {
    const saved: Partial<EntityAttachment>[] = [];
    const removed: Partial<EntityAttachment>[] = [];
    const deletedKeys: string[] = [];

    const attachmentsRepository = {
      manager: {} as never,
      findOne: () => Promise.resolve(options.existingAttachment ?? null),
      count: () => Promise.resolve(options.otherReferences ?? 0),
      remove: (row: Partial<EntityAttachment>) => {
        removed.push(row);

        return Promise.resolve(row);
      },
    };

    const transactionRepository = {
      findOne: () => Promise.resolve(null),
      count: () => Promise.resolve(options.existingCount ?? 0),
      create: (row: Partial<EntityAttachment>) => row,
      save: (row: Partial<EntityAttachment>) => {
        saved.push(row);

        return Promise.resolve({ ...row, id: 'new-attachment' });
      },
    };

    const filesRepository = {
      findOne: () =>
        Promise.resolve({
          id: 'file-1',
          companyId: COMPANY,
          sizeBytes: options.fileSizeBytes ?? 1024,
          storageKey: 'companies/x/file.png',
        }),
      count: () => Promise.resolve(0),
      remove: () => Promise.resolve({}),
      createQueryBuilder: () => ({
        where: () => ({ limit: () => ({ getMany: () => Promise.resolve([]) }) }),
      }),
    };

    const manager = {
      getRepository: (entity: unknown) =>
        entity === EntityAttachment ? transactionRepository : filesRepository,
    };

    const zero = { count: () => Promise.resolve(0) };

    const membershipsService = {
      findActiveMembershipRoles: () => Promise.resolve(options.roles ?? []),
    };

    const storageService = {
      deleteObject: (key: string) => {
        deletedKeys.push(key);

        return Promise.resolve();
      },
    };

    const service = new AttachmentsService(
      attachmentsRepository as never,
      filesRepository as never,
      { count: () => Promise.resolve(1) } as never, // tasks
      zero as never, // posts
      zero as never, // campaigns
      zero as never, // leads
      zero as never, // brand profiles
      zero as never, // legacy task attachments
      zero as never, // post assets
      { create: (row: unknown) => row, save: () => Promise.resolve({}) } as never,
      membershipsService as unknown as MembershipsService,
      storageService as unknown as StorageService,
    );

    return { service, manager, saved, removed, deletedKeys };
  };

  describe('limits', () => {
    it('refuses a file over 25MB', async () => {
      const { service, manager } = build({
        fileSizeBytes: 30 * 1024 * 1024,
      });

      await expect(
        service.attachMany(manager as never, {
          companyId: COMPANY,
          entityType: AttachmentEntityType.TASK,
          entityId: TASK,
          fileIds: ['file-1'],
          uploadedById: 'user-1',
        }),
      ).rejects.toMatchObject({
        response: { code: 'FILE_TOO_LARGE' },
      });
    });

    it('refuses the twenty-first attachment', async () => {
      const { service, manager } = build({
        existingCount: MAX_ATTACHMENTS_PER_ENTITY,
      });

      await expect(
        service.attachMany(manager as never, {
          companyId: COMPANY,
          entityType: AttachmentEntityType.TASK,
          entityId: TASK,
          fileIds: ['file-1'],
          uploadedById: 'user-1',
        }),
      ).rejects.toMatchObject({
        response: { code: 'ATTACHMENT_LIMIT' },
      });
    });

    it('accepts a file inside both limits', async () => {
      const { service, manager, saved } = build({ existingCount: 3 });

      await service.attachMany(manager as never, {
        companyId: COMPANY,
        entityType: AttachmentEntityType.TASK,
        entityId: TASK,
        fileIds: ['file-1'],
        uploadedById: 'user-1',
      });

      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        entityType: AttachmentEntityType.TASK,
        entityId: TASK,
        fileId: 'file-1',
      });
    });

    it('rejects a create carrying more files than a record can hold', () => {
      expect(() =>
        AttachmentsService.assertFileIdCount(
          Array.from({ length: 21 }, (_, index) => `file-${index}`),
        ),
      ).toThrow(UnprocessableEntityException);
    });
  });

  describe('who may remove a file', () => {
    const attachment = {
      id: 'attachment-1',
      companyId: COMPANY,
      entityType: AttachmentEntityType.TASK,
      entityId: TASK,
      fileId: 'file-1',
      uploadedById: 'jessika',
    };

    it('lets the person who attached it', async () => {
      const { service, removed } = build({
        existingAttachment: attachment,
      });

      await service.remove(
        COMPANY,
        AttachmentEntityType.TASK,
        TASK,
        'attachment-1',
        user('jessika'),
      );

      expect(removed).toHaveLength(1);
    });

    it('lets an account manager clean up a file they did not attach', async () => {
      const { service, removed } = build({
        existingAttachment: attachment,
        roles: [CompanyMembershipRole.ACCOUNT_MANAGER],
      });

      await service.remove(
        COMPANY,
        AttachmentEntityType.TASK,
        TASK,
        'attachment-1',
        user('maria'),
      );

      expect(removed).toHaveLength(1);
    });

    it('stops a designer removing a file they did not attach', async () => {
      const { service } = build({
        existingAttachment: attachment,
        roles: [CompanyMembershipRole.DESIGNER],
      });

      await expect(
        service.remove(
          COMPANY,
          AttachmentEntityType.TASK,
          TASK,
          'attachment-1',
          user('yasin'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets an agency admin remove anything', async () => {
      const { service, removed } = build({
        existingAttachment: attachment,
        roles: [],
      });

      await service.remove(
        COMPANY,
        AttachmentEntityType.TASK,
        TASK,
        'attachment-1',
        user('admin', PlatformRole.AGENCY_ADMIN),
      );

      expect(removed).toHaveLength(1);
    });
  });

  describe('the underlying file', () => {
    const attachment = {
      id: 'attachment-1',
      companyId: COMPANY,
      entityType: AttachmentEntityType.TASK,
      entityId: TASK,
      fileId: 'file-1',
      uploadedById: 'jessika',
    };

    it('is left alone while something else still points at it', async () => {
      const { service, deletedKeys } = build({
        existingAttachment: attachment,
        otherReferences: 1,
      });

      await service.remove(
        COMPANY,
        AttachmentEntityType.TASK,
        TASK,
        'attachment-1',
        user('jessika'),
      );

      expect(deletedKeys).toEqual([]);
    });

    it('goes when the last reference does', async () => {
      const { service, deletedKeys } = build({
        existingAttachment: attachment,
        otherReferences: 0,
      });

      await service.remove(
        COMPANY,
        AttachmentEntityType.TASK,
        TASK,
        'attachment-1',
        user('jessika'),
      );

      expect(deletedKeys).toEqual(['companies/x/file.png']);
    });
  });
});
