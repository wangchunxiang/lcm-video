import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LoggerService } from '@nestjs/common';
import type { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import { hashPassword } from '../common/security/password';
import { AdminUserEntity } from '../modules/admin-user/admin-user.entity';
/** 账号长度限制只在 DTO 里写一份：种子脚本与接口用同一组值，不会各改一处 */
import { ADMIN_USER_LIMITS } from '../modules/admin-user/dto/admin-user.dto';
import { CategoryEntity } from '../modules/category/category.entity';
import { SettingEntity } from '../modules/setting/setting.entity';
import { parseStatements } from './seed-sql';

/**
 * 空库首次启动的初始化（容器部署不用再手工导 seeds）。
 *
 * - 分类 / 站点配置：对应表为空时导入 `seeds/*.sql`，表里有数据就完全不动。
 *   由 `SEED_ON_START=false` 关闭，适合想从零手工建分类的场景。
 * - 管理员：表为空且配置了 `ADMIN_PASSWORD` 时创建；没配只打一条 warn，
 *   不阻塞启动（前台仍可访问，之后可补环境变量重启，或用 SQL 补账号）。
 *
 * 种子文件由 `nest-cli.json` 的 assets 复制进 dist，运行阶段无需 src。
 */

const CATEGORY_SEED = 'lcm_category.sql';
const SETTING_SEED = 'lcm_setting.sql';

function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(raw.trim().toLowerCase());
}

/** 读种子文件；读不到只告警，不能让一次部署因为少了 SQL 直接起不来。 */
function readSeedSql(file: string, logger: LoggerService): string | null {
  const path = join(__dirname, 'seeds', file);
  if (!existsSync(path)) {
    logger.warn(`种子文件缺失，跳过：${path}`);
    return null;
  }
  return readFileSync(path, 'utf8');
}

async function seedIfEmpty<T extends ObjectLiteral>(
  dataSource: DataSource,
  target: EntityTarget<T>,
  file: string,
  logger: LoggerService,
): Promise<void> {
  const repository = dataSource.getRepository(target);
  if ((await repository.count()) > 0) return;

  const sql = readSeedSql(file, logger);
  if (sql === null) return;

  for (const statement of parseStatements(sql)) {
    await dataSource.query(statement);
  }
  logger.log(`空表初始化完成：${file}`);
}

async function ensureAdmin(dataSource: DataSource, logger: LoggerService): Promise<void> {
  const repository = dataSource.getRepository(AdminUserEntity);
  if ((await repository.count()) > 0) return;

  const username = (process.env.ADMIN_USERNAME ?? 'admin').trim();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const nickname = (process.env.ADMIN_NICKNAME ?? '管理员').trim();
  if (password === '') {
    logger.warn(
      '空库没有管理员：在 .env 设置 ADMIN_PASSWORD（可同时设 ADMIN_USERNAME）后重启，或手工插入 lcm_admin_user',
    );
    return;
  }

  if (
    username.length < ADMIN_USER_LIMITS.usernameMin ||
    username.length > ADMIN_USER_LIMITS.usernameMax ||
    !/^[a-zA-Z0-9_-]+$/.test(username)
  ) {
    logger.error(
      `ADMIN_USERNAME 不合法（${ADMIN_USER_LIMITS.usernameMin}~${ADMIN_USER_LIMITS.usernameMax} 位字母、数字、下划线、减号），未创建管理员`,
    );
    return;
  }
  if (password.length < ADMIN_USER_LIMITS.passwordMin || password.length > ADMIN_USER_LIMITS.passwordMax) {
    logger.error(
      `ADMIN_PASSWORD 长度必须是 ${ADMIN_USER_LIMITS.passwordMin}~${ADMIN_USER_LIMITS.passwordMax}，未创建管理员`,
    );
    return;
  }

  await repository.insert({
    username,
    password: hashPassword(password),
    nickname: nickname.slice(0, ADMIN_USER_LIMITS.nicknameMax),
    isEnabled: 1,
    passwordVersion: 0,
  });
  logger.log(`已创建管理员 ${username}（来自 ADMIN_PASSWORD，建议创建后从 .env 移除密码）`);
}

/** 由 `SeedBootstrapService` 在应用启动、迁移完成之后调用。 */
export async function bootstrapSeed(dataSource: DataSource, logger: LoggerService): Promise<void> {
  if (envFlag('SEED_ON_START', true)) {
    await seedIfEmpty(dataSource, CategoryEntity, CATEGORY_SEED, logger);
    await seedIfEmpty(dataSource, SettingEntity, SETTING_SEED, logger);
  }
  await ensureAdmin(dataSource, logger);
}
