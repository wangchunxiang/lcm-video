import { sql } from 'drizzle-orm';
import { bigint, char, datetime, index, int, json, mediumtext, mysqlTable, text, tinyint, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';

const pk = () => bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey();
const fk = (name: string) => bigint(name, { mode: 'number', unsigned: true }).notNull().default(0);
const createdAt = () => datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`);
const updatedAt = () =>
  datetime('updated_at').notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);

/** 分类，两级 */
export const category = mysqlTable(
  'lcm_category',
  {
    id: pk(),
    pid: fk('pid'),
    name: varchar('name', { length: 50 }).notNull().default(''),
    alias: varchar('alias', { length: 50 }).notNull().default(''),
    matchNames: varchar('match_names', { length: 255 }).notNull().default(''),
    sort: int('sort', { unsigned: true }).notNull().default(0),
    isShow: tinyint('is_show', { unsigned: true }).notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('uk_alias').on(t.alias), index('idx_pid_sort').on(t.pid, t.sort)],
);

/** 影片主表 */
export const vod = mysqlTable(
  'lcm_vod',
  {
    id: pk(),
    categoryId: fk('category_id'),
    categoryPid: fk('category_pid'),
    name: varchar('name', { length: 255 }).notNull().default(''),
    nameHash: char('name_hash', { length: 32 }).notNull().default(''),
    subName: varchar('sub_name', { length: 500 }).notNull().default(''),
    letter: char('letter', { length: 1 }).notNull().default(''),
    cover: varchar('cover', { length: 500 }).notNull().default(''),
    actor: varchar('actor', { length: 1000 }).notNull().default(''),
    director: varchar('director', { length: 500 }).notNull().default(''),
    writer: varchar('writer', { length: 500 }).notNull().default(''),
    intro: varchar('intro', { length: 1000 }).notNull().default(''),
    content: text('content'),
    remarks: varchar('remarks', { length: 255 }).notNull().default(''),
    releaseDate: varchar('release_date', { length: 255 }).notNull().default(''),
    episodeCount: int('episode_count', { unsigned: true }).notNull().default(0),
    area: varchar('area', { length: 100 }).notNull().default(''),
    lang: varchar('lang', { length: 100 }).notNull().default(''),
    year: int('year', { unsigned: true }).notNull().default(0),
    status: tinyint('status', { unsigned: true }).notNull().default(1),
    collectedAt: datetime('collected_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('idx_category_status').on(t.categoryId, t.status),
    index('idx_pid_status').on(t.categoryPid, t.status),
    index('idx_letter').on(t.letter),
    index('idx_name_hash').on(t.nameHash),
    index('idx_status_collected').on(t.status, t.collectedAt),
  ],
);

/** 播放线路，一条线路一行 */
export const vodPlay = mysqlTable(
  'lcm_vod_play',
  {
    id: pk(),
    vodId: fk('vod_id'),
    sourceId: fk('source_id'),
    sourceFrom: varchar('source_from', { length: 50 }).notNull().default(''),
    sourceVodId: varchar('source_vod_id', { length: 50 }).notNull().default(''),
    sourceUpdatedAt: datetime('source_updated_at'),
    collectedAt: datetime('collected_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    playUrl: mediumtext('play_url').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('uk_vod_source_from').on(t.vodId, t.sourceId, t.sourceFrom),
    index('idx_source').on(t.sourceId),
  ],
);

/** 采集源站 */
export const collectSource = mysqlTable(
  'lcm_collect_source',
  {
    id: pk(),
    name: varchar('name', { length: 50 }).notNull().default(''),
    apiUrl: varchar('api_url', { length: 255 }).notNull().default(''),
    apiFormat: varchar('api_format', { length: 10 }).notNull().default('json'),
    apiParams: varchar('api_params', { length: 500 }).notNull().default(''),
    parseUrl: varchar('parse_url', { length: 255 }).notNull().default(''),
    isEnabled: tinyint('is_enabled', { unsigned: true }).notNull().default(1),
    intervalSec: int('interval_sec', { unsigned: true }).notNull().default(3),
    pagesize: int('pagesize', { unsigned: true }).notNull().default(100),
    timeout: int('timeout', { unsigned: true }).notNull().default(30),
    retryTimes: tinyint('retry_times', { unsigned: true }).notNull().default(2),
    lastSyncAt: datetime('last_sync_at'),
    lastSyncStatus: tinyint('last_sync_status', { unsigned: true }).notNull().default(0),
    lastSyncMsg: varchar('last_sync_msg', { length: 255 }).notNull().default(''),
    /** 最近一次采集到的线路标识，逗号分隔，仅用于后台候选提示 */
    playFrom: varchar('play_from', { length: 500 }).notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_enabled').on(t.isEnabled)],
);

/** 全站线路注册表：一条 source_from 一行，决定前台显示名、顺序与启停 */
export const playLine = mysqlTable(
  'lcm_play_line',
  {
    id: pk(),
    sourceFrom: varchar('source_from', { length: 50 }).notNull().default(''),
    name: varchar('name', { length: 50 }).notNull().default(''),
    sort: int('sort', { unsigned: true }).notNull().default(0),
    isEnabled: tinyint('is_enabled', { unsigned: true }).notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('uk_source_from').on(t.sourceFrom), index('idx_sort').on(t.sort)],
);

/** 源站分类与本站分类的映射 */
export const collectSourceCategory = mysqlTable(
  'lcm_collect_source_category',
  {
    id: pk(),
    sourceId: fk('source_id'),
    sourceTypeId: varchar('source_type_id', { length: 50 }).notNull().default(''),
    sourceTypeName: varchar('source_type_name', { length: 100 }).notNull().default(''),
    sourceTypePid: varchar('source_type_pid', { length: 50 }).notNull().default(''),
    categoryId: fk('category_id'),
    matchType: tinyint('match_type', { unsigned: true }).notNull().default(0),
    status: tinyint('status', { unsigned: true }).notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('uk_source_type').on(t.sourceId, t.sourceTypeId),
    index('idx_category').on(t.categoryId),
    index('idx_source_status').on(t.sourceId, t.status),
  ],
);

/** 采集任务 */
export const collectTask = mysqlTable(
  'lcm_collect_task',
  {
    id: pk(),
    name: varchar('name', { length: 50 }).notNull().default(''),
    sourceId: fk('source_id'),
    rangeType: tinyint('range_type', { unsigned: true }).notNull().default(1),
    cron: varchar('cron', { length: 50 }).notNull().default(''),
    isEnabled: tinyint('is_enabled', { unsigned: true }).notNull().default(1),
    lastRunAt: datetime('last_run_at'),
    lastRunStatus: tinyint('last_run_status', { unsigned: true }).notNull().default(0),
    lastRunMsg: varchar('last_run_msg', { length: 255 }).notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_source').on(t.sourceId), index('idx_enabled').on(t.isEnabled)],
);

/** 采集记录，一次任务执行一行 */
export const collectLog = mysqlTable(
  'lcm_collect_log',
  {
    id: pk(),
    taskId: fk('task_id'),
    sourceId: fk('source_id'),
    status: tinyint('status', { unsigned: true }).notNull().default(0),
    totalPages: int('total_pages', { unsigned: true }).notNull().default(0),
    total: int('total', { unsigned: true }).notNull().default(0),
    inserted: int('inserted', { unsigned: true }).notNull().default(0),
    updated: int('updated', { unsigned: true }).notNull().default(0),
    skipped: int('skipped', { unsigned: true }).notNull().default(0),
    ignored: int('ignored', { unsigned: true }).notNull().default(0),
    failed: int('failed', { unsigned: true }).notNull().default(0),
    message: varchar('message', { length: 500 }).notNull().default(''),
    startedAt: datetime('started_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    finishedAt: datetime('finished_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_task_started').on(t.taskId, t.startedAt), index('idx_started').on(t.startedAt)],
);

/** 采集记录明细，一页一行 */
export const collectLogDetail = mysqlTable(
  'lcm_collect_log_detail',
  {
    id: pk(),
    logId: fk('log_id'),
    page: int('page', { unsigned: true }).notNull().default(0),
    total: int('total', { unsigned: true }).notNull().default(0),
    inserted: int('inserted', { unsigned: true }).notNull().default(0),
    updated: int('updated', { unsigned: true }).notNull().default(0),
    skipped: int('skipped', { unsigned: true }).notNull().default(0),
    ignored: int('ignored', { unsigned: true }).notNull().default(0),
    failed: int('failed', { unsigned: true }).notNull().default(0),
    failDetail: json('fail_detail'),
    message: varchar('message', { length: 500 }).notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_log_page').on(t.logId, t.page)],
);

/** 后台账号 */
export const adminUser = mysqlTable(
  'lcm_admin_user',
  {
    id: pk(),
    username: varchar('username', { length: 50 }).notNull().default(''),
    password: varchar('password', { length: 255 }).notNull().default(''),
    nickname: varchar('nickname', { length: 50 }).notNull().default(''),
    isEnabled: tinyint('is_enabled', { unsigned: true }).notNull().default(1),
    passwordVersion: int('password_version', { unsigned: true }).notNull().default(0),
    lastLoginAt: datetime('last_login_at'),
    lastLoginIp: varchar('last_login_ip', { length: 45 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('uk_username').on(t.username)],
);

/** 站点与程序配置 */
export const setting = mysqlTable(
  'lcm_setting',
  {
    id: pk(),
    name: varchar('name', { length: 50 }).notNull().default(''),
    value: text('value'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('uk_name').on(t.name)],
);

export const adFeature = mysqlTable(
  'lcm_ad_feature',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    sourceId: bigint('source_id', { mode: 'number', unsigned: true }).notNull(),
    kind: tinyint('kind', { unsigned: true }).notNull().default(2),
    durations: varchar('durations', { length: 255 }).notNull(),
    totalMs: int('total_ms', { unsigned: true }).notNull().default(0),
    hitVods: int('hit_vods', { unsigned: true }).notNull().default(0),
    sample: json('sample'),
    status: tinyint('status', { unsigned: true }).notNull().default(0),
    createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('uk_source_durations').on(table.sourceId, table.durations),
    index('idx_source_status').on(table.sourceId, table.status),
  ],
);
