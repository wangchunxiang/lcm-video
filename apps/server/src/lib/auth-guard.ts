import { eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '@lcm/db';
import { adminUser } from '@lcm/db';
import { verifyToken } from './jwt.ts';
import { ErrorCode, fail } from './http.ts';

export const AUTH_COOKIE = 'lcm_token';

export function createRequireAdmin(db: Db, secret: string) {
  return async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> {
    const token = req.cookies[AUTH_COOKIE];
    if (!token) {
      return fail(reply, 401, ErrorCode.UNAUTHORIZED, '请先登录');
    }

    const payload = verifyToken(token, secret);
    if (!payload) {
      return fail(reply, 401, ErrorCode.UNAUTHORIZED, '登录已失效，请重新登录');
    }

    const rows = await db
      .select({
        id: adminUser.id,
        username: adminUser.username,
        nickname: adminUser.nickname,
        isEnabled: adminUser.isEnabled,
        passwordVersion: adminUser.passwordVersion,
      })
      .from(adminUser)
      .where(eq(adminUser.id, payload.uid))
      .limit(1);

    const user = rows[0];
    if (!user) {
      return fail(reply, 401, ErrorCode.UNAUTHORIZED, '账号不存在');
    }
    if (user.isEnabled !== 1) {
      return fail(reply, 403, ErrorCode.FORBIDDEN, '账号已被禁用');
    }
    if (user.passwordVersion !== payload.pv) {
      return fail(reply, 401, ErrorCode.UNAUTHORIZED, '密码已修改，请重新登录');
    }

    req.adminUser = {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
    };
  };
}
