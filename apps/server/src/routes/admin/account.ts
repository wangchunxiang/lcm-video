import { eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@lcm/db';
import { adminUser } from '@lcm/db';
import { AUTH_COOKIE } from '../../lib/auth-guard.ts';
import { ErrorCode, fail, ok } from '../../lib/http.ts';
import { hashPassword, verifyPassword } from '../../lib/password.ts';

export interface AccountRouteOpts {
  db: Db;
}

export const accountRoutes: FastifyPluginAsync<AccountRouteOpts> = async (app, opts) => {
  const { db } = opts;

  app.put('/profile', async (req, reply) => {
    const session = req.adminUser;
    if (!session) return fail(reply, 401, ErrorCode.UNAUTHORIZED, '请先登录');

    const body = (req.body ?? {}) as { nickname?: unknown };
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
    if (!nickname) return fail(reply, 400, ErrorCode.BAD_REQUEST, '昵称不能为空');
    if (nickname.length > 50) return fail(reply, 400, ErrorCode.BAD_REQUEST, '昵称不能超过 50 个字符');

    await db.update(adminUser).set({ nickname }).where(eq(adminUser.id, session.id));
    return ok(reply, { nickname });
  });

  app.put('/password', async (req, reply) => {
    const session = req.adminUser;
    if (!session) return fail(reply, 401, ErrorCode.UNAUTHORIZED, '请先登录');

    const body = (req.body ?? {}) as { old_password?: unknown; new_password?: unknown };
    const oldPassword = typeof body.old_password === 'string' ? body.old_password : '';
    const newPassword = typeof body.new_password === 'string' ? body.new_password : '';

    if (!oldPassword || !newPassword) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, '请填写原密码和新密码');
    }
    if (newPassword.length < 6) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, '新密码至少 6 位');
    }
    if (newPassword.length > 50) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, '新密码不能超过 50 位');
    }
    if (newPassword === oldPassword) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, '新密码不能与原密码相同');
    }

    const rows = await db
      .select({ password: adminUser.password })
      .from(adminUser)
      .where(eq(adminUser.id, session.id))
      .limit(1);
    const stored = rows[0]?.password ?? '';
    if (!verifyPassword(oldPassword, stored)) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, '原密码不正确');
    }

    await db
      .update(adminUser)
      .set({ password: hashPassword(newPassword), passwordVersion: sql`password_version + 1` })
      .where(eq(adminUser.id, session.id));

    req.log.info({ uid: session.id }, '管理员修改密码，旧会话已失效');
    reply.clearCookie(AUTH_COOKIE, { path: '/' });
    return ok(reply, null, '密码已修改，请重新登录');
  });
};
