/**
 * 从 v2 旧库（`lcm_video`）把数据搬到当前库（`lcm-video`）。
 *
 * 用法：
 *   LEGACY_DATABASE_URL='mysql://user:pass@host:3306/lcm_video' \
 *     npm run db:import-legacy -w apps/server -- --dry-run
 *   ... -- --truncate --force
 *
 * 说明：
 * - 旧库与新库表名/列名大体一致，差异在下面 `TABLES` 的 `map` 里逐条处理：
 *   改名（collect_log → collect_task_log）、删列（vod.letter、collect_source.api_format）、
 *   状态值重排（log.status、task.last_run_status）、kind 由字符串改数字（merge_ignore）。
 * - `--truncate` 先清空目标表再导入；不加则按主键 upsert（可重复执行）。
 * - `--force` 是写库开关，缺省只做 dry-run，避免误操作。
 */
import mysql from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

type Row = Record<string, unknown>;

interface TablePlan {
  /** 目标表名 */
  target: string;
  /** 旧库表名，缺省与目标同名 */
  source?: string;
  /** 目标表列（不含 id 以外的自增列也一样按主键写回） */
  columns: readonly string[];
  /** 旧行 → 目标行；返回 null 表示跳过 */
  map?: (row: Row, ctx: Context) => Row | null;
  /** 分批游标列，默认主键 id；旧表没有 id 的（如 lcm_vod_merge_ignore）要指定 */
  cursor?: string;
}

interface Context {
  tasks: Map<number, string>;
  sources: Map<number, string>;
}

const statusOfLog = (value: number): number => {
  // 旧：0 进行中 / 1 成功 / 2 失败 / 3 已取消
  // 新：1 运行中 / 2 成功 / 3 失败 / 4 已取消
  switch (value) {
    case 0:
      return 1;
    case 1:
      return 2;
    case 2:
      return 3;
    case 3:
      return 4;
    default:
      return value;
  }
};

const statusOfTask = (value: number): number => {
  // 旧：0 未跑 / 1 成功 / 2 失败；新：0 未运行 / 1 运行中 / 2 成功 / 3 失败 / 4 已取消
  switch (value) {
    case 1:
      return 2;
    case 2:
      return 3;
    default:
      return value;
  }
};

/** 上映日期旧列是 varchar(255)，新列 varchar(20)：能认出年月日就规范化，否则截断 */
export function normalizeReleaseDate(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const match = text.match(/(\d{4})\s*[-./年]\s*(\d{1,2})\s*[-./月]\s*(\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`;
  }
  const yearOnly = text.match(/^(\d{4})$/);
  if (yearOnly) return yearOnly[1]!;
  return text.slice(0, 20);
}

const TABLES: readonly TablePlan[] = [
  {
    target: 'lcm_category',
    columns: ['id', 'created_at', 'updated_at', 'pid', 'name', 'alias', 'match_names', 'sort', 'is_show'],
  },
  {
    target: 'lcm_collect_source',
    columns: [
      'id', 'created_at', 'updated_at', 'name', 'api_url', 'api_params', 'parse_url', 'is_enabled',
      'interval_sec', 'pagesize', 'timeout', 'retry_times', 'last_sync_at', 'last_sync_status',
      'last_sync_msg', 'play_from',
    ],
  },
  {
    target: 'lcm_collect_task',
    columns: [
      'id', 'created_at', 'updated_at', 'name', 'source_id', 'range_type', 'cron', 'is_enabled',
      'last_run_at', 'last_run_status', 'last_run_msg',
    ],
    map: (row) => ({ ...row, last_run_status: statusOfTask(Number(row.last_run_status ?? 0)) }),
  },
  {
    target: 'lcm_vod',
    columns: [
      'id', 'created_at', 'updated_at', 'category_id', 'category_pid', 'name', 'name_hash',
      'name_hash_loose', 'sub_name', 'cover', 'cover_host', 'actor', 'director', 'writer', 'intro',
      'content', 'remarks', 'release_date', 'episode_count', 'area', 'lang', 'year', 'status',
      'collected_at',
    ],
    map: (row) => {
      const { letter: _letter, ...rest } = row;
      return { ...rest, release_date: normalizeReleaseDate(row.release_date) };
    },
  },
  {
    target: 'lcm_vod_play',
    columns: [
      'id', 'created_at', 'updated_at', 'vod_id', 'source_id', 'source_from', 'source_vod_id',
      'source_updated_at', 'collected_at', 'play_url',
    ],
  },
  {
    target: 'lcm_collect_task_log',
    source: 'lcm_collect_log',
    columns: [
      'id', 'created_at', 'updated_at', 'task_id', 'source_id', 'task_name', 'range_type', 'status',
      'total_pages', 'last_page', 'resume_count', 'interrupted_ms', 'total', 'inserted', 'updated',
      'skipped', 'ignored', 'failed', 'message', 'started_at', 'finished_at',
    ],
    map: (row, ctx) => {
      const taskId = Number(row.task_id ?? 0);
      const sourceId = Number(row.source_id ?? 0);
      // 旧表没有 task_name 快照：任务还在就用现名，已被删的只能标出原始 id
      const taskName =
        taskId === 0
          ? `手动采集·${ctx.sources.get(sourceId) ?? '未知源站'}`
          : (ctx.tasks.get(taskId) ?? `任务 #${taskId}（已删除）`);
      return {
        ...row,
        status: statusOfLog(Number(row.status ?? 0)),
        task_name: taskName,
        interrupted_ms: Math.min(Number(row.interrupted_ms ?? 0), 4294967295),
      };
    },
  },
  {
    target: 'lcm_collect_task_log_detail',
    source: 'lcm_collect_log_detail',
    columns: [
      'id', 'created_at', 'updated_at', 'log_id', 'page', 'total', 'inserted', 'updated', 'skipped',
      'ignored', 'failed', 'fail_detail', 'message',
    ],
  },
  {
    target: 'lcm_source_rule',
    columns: ['id', 'created_at', 'updated_at', 'source_id', 'kind', 'from_url', 'to_url', 'is_enabled', 'sort'],
  },
  {
    target: 'lcm_cover_check',
    columns: ['id', 'created_at', 'updated_at', 'host', 'vod_count', 'status', 'sample_ok', 'sample_fail', 'message', 'checked_at'],
  },
  {
    target: 'lcm_ad_feature',
    columns: ['id', 'created_at', 'updated_at', 'source_id', 'kind', 'durations', 'total_ms', 'hit_vods', 'sample'],
  },
  {
    target: 'lcm_vod_merge_ignore',
    columns: ['id', 'created_at', 'updated_at', 'merge_key', 'kind'],
    // 旧表没有 id（主键就是 merge_key），按 merge_key 分批，id 交给自增
    cursor: 'merge_key',
    map: (row) => ({
      id: null,
      created_at: row.created_at,
      updated_at: row.created_at,
      merge_key: row.merge_key,
      kind: row.kind === 'suspect' ? 2 : 1,
    }),
  },
  {
    target: 'lcm_play_line',
    columns: ['id', 'created_at', 'updated_at', 'source_from', 'name', 'sort', 'is_enabled'],
  },
  {
    target: 'lcm_admin_user',
    columns: [
      'id', 'created_at', 'updated_at', 'username', 'password', 'nickname', 'is_enabled',
      'password_version', 'last_login_at', 'last_login_ip',
    ],
  },
  {
    target: 'lcm_setting',
    columns: ['id', 'created_at', 'updated_at', 'name', 'value'],
    // 这四个键在新版已删除；merge_rules 单独搬进 lcm_vod_merge_rule
    map: (row) =>
      ['site_theme', 'site_logo', 'site_favicon', 'upload_max_mb', 'merge_rules'].includes(String(row.name))
        ? null
        : row,
  },
];

const BATCH = 5000;
/** 服务端 INSERT…SELECT 每次搬多少 id 区间（同实例时用，避免把大表搬到 Node 再写回） */
const ID_SPAN = 20000;

interface Args {
  force: boolean;
  dryRun: boolean;
  truncate: boolean;
  /** 只搬这几张目标表，逗号分隔；缺省搬全部 */
  tables: string[] | null;
  /** 旧库与新库在同一实例时，用 INSERT…SELECT 让服务端直接搬（大表快得多） */
  fastCopy: boolean;
}

function parseArgs(argv: string[]): Args {
  const tables = argv.find((arg) => arg.startsWith('--tables='));
  return {
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
    truncate: argv.includes('--truncate'),
    tables: tables ? tables.slice('--tables='.length).split(',').map((name) => name.trim()).filter(Boolean) : null,
    fastCopy: argv.includes('--fast-copy'),
  };
}

function parseUrl(url: string): URL {
  return new URL(url);
}

function dbName(url: string): string {
  return decodeURIComponent(parseUrl(url).pathname.replace(/^\//, ''));
}

/** 两个连接串是否指向同一个 MySQL 实例（库名可以不同） */
function sameInstance(left: string, right: string): boolean {
  const a = parseUrl(left);
  const b = parseUrl(right);
  return a.hostname === b.hostname && (a.port || '3306') === (b.port || '3306');
}

/** 旧库默认与新库同实例、库名 lcm_video；跨实例时用 LEGACY_DATABASE_URL 覆盖 */
function deriveLegacyUrl(targetUrl: string): string {
  const parsed = new URL(targetUrl);
  parsed.pathname = '/lcm_video';
  return parsed.toString();
}

/** 同实例时由服务端直接 INSERT…SELECT：不经过 Node，大表能快一个量级 */
async function copyServerSide(
  target: mysql.Connection,
  plan: TablePlan,
  source: string,
  legacyDb: string,
  targetDb: string,
): Promise<number> {
  const columns = plan.columns.map((column) => `\`${column}\``).join(',');
  const updates = plan.columns
    .filter((column) => column !== 'id')
    .map((column) => `\`${column}\` = VALUES(\`${column}\`)`)
    .join(',');
  const [maxRows] = await target.query<RowDataPacket[]>(
    `SELECT COALESCE(MAX(id), 0) AS maxId FROM \`${legacyDb}\`.\`${source}\``,
  );
  const maxId = Number(maxRows[0]?.maxId ?? 0);
  let copied = 0;
  for (let start = 0; start <= maxId; start += ID_SPAN) {
    const [result] = await target.query<ResultSetHeader>(
      `INSERT INTO \`${targetDb}\`.\`${plan.target}\` (${columns})
       SELECT ${columns} FROM \`${legacyDb}\`.\`${source}\`
        WHERE id > ? AND id <= ?
       ON DUPLICATE KEY UPDATE ${updates}`,
      [start, start + ID_SPAN],
    );
    copied += result.affectedRows;
  }
  return copied;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const targetUrl = process.env.DATABASE_URL;
  if (!targetUrl) throw new Error('缺少 DATABASE_URL');
  const legacyUrl = process.env.LEGACY_DATABASE_URL ?? deriveLegacyUrl(targetUrl);

  const legacy = await mysql.createConnection(legacyUrl);
  const target = await mysql.createConnection(targetUrl);
  const write = args.force && !args.dryRun;

  try {
    const [taskRows] = await legacy.query<RowDataPacket[]>('SELECT id, name FROM lcm_collect_task');
    const [sourceRows] = await legacy.query<RowDataPacket[]>('SELECT id, name FROM lcm_collect_source');
    const ctx: Context = {
      tasks: new Map(taskRows.map((row) => [Number(row.id), String(row.name)])),
      sources: new Map(sourceRows.map((row) => [Number(row.id), String(row.name)])),
    };

    if (args.truncate && write) {
      for (const plan of [...TABLES].reverse()) {
        // 表之间没有物理外键，TRUNCATE 比 DELETE 快得多
        await target.query(`TRUNCATE TABLE \`${plan.target}\``);
      }
      console.log('[import] 已清空目标表');
    }

    for (const plan of TABLES) {
      if (args.tables && !args.tables.includes(plan.target)) continue;
      const source = plan.source ?? plan.target;
      const [countRows] = await legacy.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM \`${source}\``);
      const total = Number(countRows[0]?.n ?? 0);
      if (!write) {
        console.log(`[dry-run] ${source} → ${plan.target}: ${total} 行`);
        continue;
      }

      // 同实例 + 不需要逐行转换：交给服务端 INSERT…SELECT，避免大表在 Node 里过一遍
      if (args.fastCopy && !plan.map && sameInstance(legacyUrl, targetUrl)) {
        const started = Date.now();
        const copied = await copyServerSide(target, plan, source, dbName(legacyUrl), dbName(targetUrl));
        console.log(
          `[import] ${source} → ${plan.target}: ${copied} 行（服务端复制，${((Date.now() - started) / 1000).toFixed(1)}s）`,
        );
        continue;
      }

      let copied = 0;
      let skipped = 0;
      const cursor = plan.cursor ?? 'id';
      let lastCursor: string | number = plan.cursor ? '' : 0;
      // 整表一个事务：每批 INSERT 只提交一次，比逐批自动提交快一个量级
      await target.beginTransaction();
      try {
        for (;;) {
          const [rows] = await legacy.query<RowDataPacket[]>(
            `SELECT * FROM \`${source}\` WHERE \`${cursor}\` > ? ORDER BY \`${cursor}\` ASC LIMIT ?`,
            [lastCursor, BATCH],
          );
          if (rows.length === 0) break;
          const mapped: Row[] = [];
          for (const row of rows) {
            lastCursor = row[cursor] as string | number;
            const next = plan.map ? plan.map(row, ctx) : row;
            if (!next) {
              skipped += 1;
              continue;
            }
            mapped.push(Object.fromEntries(plan.columns.map((column) => [column, next[column] ?? null])));
          }
          if (mapped.length > 0) {
            const placeholders = mapped.map(() => `(${plan.columns.map(() => '?').join(',')})`).join(',');
            const values = mapped.flatMap((row) => plan.columns.map((column) => row[column]));
            await target.query(
              `INSERT INTO \`${plan.target}\` (${plan.columns.map((c) => `\`${c}\``).join(',')}) VALUES ${placeholders}
               ON DUPLICATE KEY UPDATE ${plan.columns
                 .filter((column) => column !== 'id')
                 .map((column) => `\`${column}\` = VALUES(\`${column}\`)`)
                 .join(',')}`,
              values,
            );
          }
          copied += mapped.length;
          if (rows.length < BATCH) break;
        }
        await target.commit();
      } catch (error) {
        await target.rollback();
        throw error;
      }
      console.log(`[import] ${source} → ${plan.target}: ${copied} 行${skipped ? `，跳过 ${skipped} 行` : ''}`);
    }

    if (write) {
      // 旧库的 merge_rules JSON → lcm_vod_merge_rule（一行一个字段）
      const [[setting]] = await legacy.query<RowDataPacket[]>(
        "SELECT value FROM lcm_setting WHERE name = 'merge_rules' LIMIT 1",
      );
      if (setting?.value) {
        const parsed = JSON.parse(setting.value) as { mode?: string; fields?: Record<string, string> };
        const rows: Array<[string, string]> = [['mode', parsed.mode === 'off' ? 'off' : 'merge']];
        for (const [key, value] of Object.entries(parsed.fields ?? {})) rows.push([key, String(value)]);
        const placeholders = rows.map(() => '(?, ?)').join(',');
        await target.query(
          `INSERT INTO lcm_vod_merge_rule (rule_key, rule_value) VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE rule_value = VALUES(rule_value)`,
          rows.flat(),
        );
        console.log(`[import] merge_rules JSON → lcm_vod_merge_rule: ${rows.length} 行`);
      }
    }

    console.log(write ? '[import] 完成' : '[dry-run] 未写库；确认无误后加 --force 再执行（需要重建目标表数据时再加 --truncate）');
  } finally {
    await legacy.end();
    await target.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
