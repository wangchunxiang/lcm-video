import { lt, eq, sql } from 'drizzle-orm';
import type { Db } from '@lcm/db';
import { collectLog, collectTask } from '@lcm/db';
import { matchCron } from './cron.ts';
import { startTask } from './runner.ts';

export interface SchedulerLogger {
  info: (message: string) => void;
  error: (error: unknown, message?: string) => void;
}

/**
 * 每 30 秒检查一次，按 cron 表达式判断当前分钟是否命中。
 * 任务增删改即时生效，不需要重启进程。
 */
export function startScheduler(db: Db, log: SchedulerLogger): () => void {
  let lastMinute = '';
  let lastCleanDate = '';

  const tick = async (): Promise<void> => {
    const now = new Date();

    const minuteKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} ${now.getHours()}:${now.getMinutes()}`;
    if (minuteKey !== lastMinute) {
      lastMinute = minuteKey;
      const tasks = await db.select().from(collectTask).where(eq(collectTask.isEnabled, 1));
      for (const task of tasks) {
        if (!task.cron) continue;
        if (!matchCron(task.cron, now)) continue;
        const result = await startTask(db, task.id);
        if (!result.started) {
          log.info(`[采集] 任务「${task.name}」本次跳过：${result.message}`);
        } else {
          log.info(`[采集] 任务「${task.name}」开始执行，记录 #${result.logId ?? 0}`);
        }
      }
    }

    const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    if (now.getHours() === 3 && now.getMinutes() === 0 && lastCleanDate !== dateKey) {
      lastCleanDate = dateKey;
      await db.delete(collectLog).where(lt(collectLog.startedAt, sql`DATE_SUB(NOW(), INTERVAL 30 DAY)`));
      log.info('[采集] 已清理 30 天前的采集记录');
    }
  };

  const timer = setInterval(() => {
    void tick().catch((error: unknown) => log.error(error, '[采集] 调度检查失败'));
  }, 30_000);
  (timer as unknown as { unref?: () => void }).unref?.();

  void tick().catch(() => undefined);

  return () => clearInterval(timer);
}
