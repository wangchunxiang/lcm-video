import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { runInRequestContext } from '../../common/context/request-context';
import type { SettingService } from '../setting/setting.service';
import { AdminUserService } from './admin-user.service';
import type { AdminUserEntity } from './admin-user.entity';

/**
 * 只喂被这两条校验用到的 `count` / `findOne`，写库由 nest-crud 基类负责，这里不碰。
 * 四个用例都在走到 `super.update` / `super.delete` 之前就抛出，所以不需要真库。
 */
function makeService(enabledCount: number): AdminUserService {
  const repository = {
    count: () => Promise.resolve(enabledCount),
    findOne: () => Promise.resolve({ id: '7', isEnabled: 1 }),
  } as unknown as Repository<AdminUserEntity>;
  return new AdminUserService(repository, {} as ConfigService, {} as SettingService);
}

describe('AdminUserService 的禁用与删除保护', () => {
  it('不能禁用自己的账号（即使库里还有别的启用账号）', async () => {
    const service = makeService(2);
    await expect(
      runInRequestContext({ userId: '5' }, () => service.update('5', { isEnabled: 0 })),
    ).rejects.toThrow(new BadRequestException('不能禁用自己的账号'));
  });

  it('禁用别人时只剩一个启用账号则拦住', async () => {
    const service = makeService(1);
    await expect(
      runInRequestContext({ userId: '5' }, () => service.update('7', { isEnabled: 0 })),
    ).rejects.toThrow(new BadRequestException('至少要保留一个启用状态的账号'));
  });

  it('不能删除自己的账号', async () => {
    const service = makeService(2);
    await expect(runInRequestContext({ userId: '5' }, () => service.delete('5'))).rejects.toThrow(
      new BadRequestException('不能删除自己的账号'),
    );
  });

  it('不在请求链路里（定时任务、脚本）没有登录人，只剩「最后一个启用账号」这条不变量', async () => {
    const service = makeService(1);
    await expect(service.update('7', { isEnabled: 0 })).rejects.toThrow(
      new BadRequestException('至少要保留一个启用状态的账号'),
    );
  });
});
