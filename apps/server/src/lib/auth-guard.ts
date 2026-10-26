import { eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '@lcm/db';
import { adminUser } from '@lcm/db';
import { verifyToken } from './jwt.ts';
import { ErrorCode, fail } from './http.ts';

export const AUTH_COOKIE = 'lcm_token';

export function createRequireAdmin(db: Db, secret: string) {
  return async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = req.cookies[AUTH_COOKIE];
    if (!token) {
      fail(reply, 401, ErrorCode.UNAUTHORIZED, '请先登录');
      return;
    }

    const payload = verifyToken(token, secret);
    if (!payload) {
      fail(reply, 401, ErrorCode.UNAUTHORIZED, '登录已失效，请重新登录');
      return;
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
      fail(reply, 401, ErrorCode.UNAUTHORIZED, '账号不存在');
      return;
    }
    if (user.isEnabled !== 1) {
      fail(reply, 403, ErrorCode.FORBIDDEN, '账号已被禁用');
      return;
    }
    if (user.passwordVersion !== payload.pv) {
      fail(reply, 401, ErrorCode.UNAUTHORIZED, '密码已修改，请重新登录');
      return;
    }

    req.adminUser = {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
    };
  };
}
