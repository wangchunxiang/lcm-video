import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '@lcm/db';
import type { Env } from '../../env.ts';
import { ErrorCode, fail, ok } from '../../lib/http.ts';
import { getSettingNumber } from '../../lib/settings.ts';

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico', '.svg']);

export interface UploadRouteOpts {
  db: Db;
  env: Env;
}

export const uploadRoutes: FastifyPluginAsync<UploadRouteOpts> = async (app, opts) => {
  const { db, env } = opts;

  app.post('/', async (req, reply) => {
    const file = await req.file();
    if (!file) return fail(reply, 400, ErrorCode.BAD_REQUEST, '请选择要上传的文件');

    const ext = path.extname(file.filename ?? '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, `不支持的文件类型，仅支持 ${[...ALLOWED_EXT].join(' ')}`);
    }

    const buffer = await file.toBuffer();
    const maxMb = await getSettingNumber(db, 'upload_max_mb', 2);
    const maxBytes = Math.max(1, maxMb) * 1024 * 1024;
    if (buffer.length > maxBytes) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, `文件超过 ${maxMb} MB 上限`);
    }
    if (buffer.length === 0) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, '文件内容为空');
    }

    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dir = path.join(env.paths.uploadDir, year, month);
    await mkdir(dir, { recursive: true });

    const filename = `${randomUUID()}${ext}`;
    await writeFile(path.join(dir, filename), buffer);

    const url = `/uploads/${year}/${month}/${filename}`;
    req.log.info({ url, size: buffer.length }, '后台文件上传成功');
    return ok(reply, { url, size: buffer.length });
  });
};
