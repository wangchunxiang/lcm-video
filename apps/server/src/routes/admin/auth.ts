import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@lcm/db';
import { adminUser } from '@lcm/db';
import type { Env } from '../../env.ts';
import { AUTH_COOKIE, createRequireAdmin } from '../../lib/auth-guard.ts';
import { ErrorCode, fail, ok } from '../../lib/http.ts';
import { signToken } from '../../lib/jwt.ts';
import { isLocked, recordFailure, resetFailures } from '../../lib/login-guard.ts';
import { verifyPassword } from '../../lib/password.ts';
import { getSettingNumber } from '../../lib/settings.ts';

export interface AuthRouteOpts {
  db: Db;
  env: Env;
}

interface LoginBody {
  username?: unknown;
  password?: unknown;
}

export const adminAuthRoutes: FastifyPluginAsync<AuthRouteOpts> = async (app, opts) => {
  const { db, env } = opts;
  const requireAdmin = createRequireAdmin(db, env.jwtSecret);

  app.post('/login', async (req, reply) => {
    const body = (req.body ?? {}) as LoginBody;
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, '请输入账号和密码');
    }

    const key = req.ip;
    if (isLocked(key)) {
      return fail(reply, 429, 42900, '尝试次数过多，请 15 分钟后再试');
    }

    const rows = await db
      .select()
      .from(adminUser)
      .where(eq(adminUser.username, username))
      .limit(1);
    const user = rows[0];

    const passed = user ? verifyPassword(password, user.password) : false;
    if (!user || !passed || user.isEnabled !== 1) {
      recordFailure(key);
      return fail(reply, 401, ErrorCode.UNAUTHORIZED, '账号或密码错误');
    }

    resetFailures(key);

    const days = await getSettingNumber(db, 'login_expire_days', 7);
    const exp = Math.floor(Date.now() / 1000) + days * 86400;
    const token = signToken({ uid: user.id, pv: user.passwordVersion, exp }, env.jwtSecret);

    reply.setCookie(AUTH_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: req.protocol === 'https',
      maxAge: days * 86400,
    });

    await db
      .update(adminUser)
      .set({ lastLoginAt: new Date(), lastLoginIp: req.ip })
      .where(eq(adminUser.id, user.id));

    return ok(reply, {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
    });
  });

  app.post('/logout', async (_req, reply) => {
    reply.clearCookie(AUTH_COOKIE, { path: '/' });
    return ok(reply, null);
  });

  app.get('/me', { preHandler: requireAdmin }, async (req, reply) => {
    return ok(reply, req.adminUser ?? null);
  });
};
