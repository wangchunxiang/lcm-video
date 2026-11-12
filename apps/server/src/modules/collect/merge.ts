import { Logger } from '@nestjs/common';
import { hostOf } from '@lcm/shared';
import type { Repository } from 'typeorm';
import type { CoverCheckEntity } from '../cover-check/cover-check.entity';
import type { SettingEntity } from '../setting/setting.entity';
import type { MergeRuleEntity } from '../vod-merge-rule/vod-merge-rule.entity';

/** 同一条影片被多个采集源命中时，写库前对每个字段做取舍 */
export type MergeMode = 'off' | 'merge';

export type MergeStrategy =
  | 'keep'
  | 'new'
  | 'nonempty'
  | 'longer'
  | 'more'
  | 'larger'
  | 'progress'
  | 'date'
  | 'cover';

export interface MergeFieldDef {
  key: string;
  label: string;
  strategies: MergeStrategy[];
  hint: string;
}

export const STRATEGY_LABELS: Record<MergeStrategy, string> = {
  keep: '保留旧值',
  new: '总是覆盖',
  nonempty: '新值非空才覆盖',
  longer: '取较长',
  more: '按人数取多',
  larger: '取较大数值',
  progress: '按更新进度比较',
  date: '旧值空才补',
  cover: '旧图为空或已失效才换',
};

/** 可配置的字段；键名与 lcm_vod 字段一致，progress 同时管 remarks 与 episodeCount */
export const MERGE_FIELDS: MergeFieldDef[] = [
  { key: 'progress', label: '更新进度', strategies: ['progress', 'keep'], hint: '完结 > 连载 > 标记；连载按集数取大，标记之间保留旧值' },
  { key: 'episodeCount', label: '集数', strategies: ['larger', 'new', 'keep'], hint: '默认取较大值，避免源站数据残缺把集数改小' },
  { key: 'cover', label: '封面', strategies: ['cover', 'nonempty', 'new', 'keep'], hint: '旧图缺失、旧图域名已失效、或同源更新时替换' },
  { key: 'subName', label: '副标题', strategies: ['nonempty', 'longer', 'new', 'keep'], hint: '一句话卖点，默认新值非空才覆盖' },
  { key: 'intro', label: '简介', strategies: ['longer', 'nonempty', 'new', 'keep'], hint: '默认取较长的一条' },
  { key: 'content', label: '剧情', strategies: ['longer', 'nonempty', 'new', 'keep'], hint: '默认取较长的一条' },
  { key: 'actor', label: '演员', strategies: ['more', 'nonempty', 'new', 'keep'], hint: '按人数取多，人数相同保留旧值' },
  { key: 'director', label: '导演', strategies: ['more', 'nonempty', 'new', 'keep'], hint: '按人数取多' },
  { key: 'writer', label: '编剧', strategies: ['more', 'nonempty', 'new', 'keep'], hint: '按人数取多' },
  { key: 'area', label: '地区', strategies: ['nonempty', 'new', 'keep'], hint: '默认旧值空才补' },
  { key: 'lang', label: '语言', strategies: ['nonempty', 'new', 'keep'], hint: '默认旧值空才补' },
  { key: 'releaseDate', label: '上映日期', strategies: ['date', 'nonempty', 'new', 'keep'], hint: '旧值空或旧值不是日期、新值是日期时才替换' },
  { key: 'year', label: '年份', strategies: ['keep', 'new'], hint: '默认旧值有值就保留；选「总是覆盖」时新值非 0 才替换' },
];

/** 不参与合并的字段，页面上只做说明 */
export const FIXED_FIELDS = [
  { label: '片名 / 判重键', hint: 'name、nameHash、nameHashLoose' },
  { label: '分类 / 状态', hint: 'categoryId、categoryPid、status、createdAt' },
];

export interface MergeConfig {
  mode: MergeMode;
  fields: Record<string, MergeStrategy>;
}

export const DEFAULT_MERGE_CONFIG: MergeConfig = {
  mode: 'merge',
  fields: Object.fromEntries(MERGE_FIELDS.map((field) => [field.key, field.strategies[0]])) as Record<string, MergeStrategy>,
};

/** 旧版整份规则在 lcm_setting 里的键名；只读兜底，新数据一律写 lcm_vod_merge_rule */
export const MERGE_CONFIG_KEY = 'merge_rules';

/** 整表开关在规则表里的键名 */
export const MERGE_MODE_KEY = 'mode';

const logger = new Logger('MergeRule');

const fieldOf = (key: string): MergeFieldDef | undefined => MERGE_FIELDS.find((field) => field.key === key);

export type NormalizedMerge = { ok: true; config: MergeConfig } | { ok: false; msg: string };

/** 校验并补全一份配置（接口入参、旧版 JSON 迁移都走这里） */
export function normalizeMergeConfig(raw: unknown): NormalizedMerge {
  const config: MergeConfig = {
    mode: DEFAULT_MERGE_CONFIG.mode,
    fields: { ...DEFAULT_MERGE_CONFIG.fields },
  };
  if (raw === null || raw === undefined) return { ok: true, config };
  if (typeof raw !== 'object') return { ok: false, msg: '入库规则格式不正确' };

  const input = raw as { mode?: unknown; fields?: unknown };
  if (input.mode !== undefined) {
    if (input.mode !== 'off' && input.mode !== 'merge') return { ok: false, msg: '合并模式取值不合法' };
    config.mode = input.mode;
  }

  if (input.fields !== undefined && input.fields !== null) {
    if (typeof input.fields !== 'object') return { ok: false, msg: '字段策略格式不正确' };
    for (const [key, value] of Object.entries(input.fields as Record<string, unknown>)) {
      const field = fieldOf(key);
      if (!field) continue; // 未知字段忽略，兼容以后删掉的配置
      if (typeof value !== 'string' || !field.strategies.includes(value as MergeStrategy)) {
        return { ok: false, msg: `${field.label}的取值不合法` };
      }
      config.fields[key] = value as MergeStrategy;
    }
  }

  return { ok: true, config };
}

/** 把库里的行拼成一份配置：缺行用默认值，非法行忽略并告警，未知行跳过。 */
export function configFromRows(
  rows: Array<Pick<MergeRuleEntity, 'ruleKey' | 'ruleValue'>>,
): MergeConfig {
  const config: MergeConfig = {
    mode: DEFAULT_MERGE_CONFIG.mode,
    fields: { ...DEFAULT_MERGE_CONFIG.fields },
  };
  for (const row of rows) {
    if (row.ruleKey === MERGE_MODE_KEY) {
      if (row.ruleValue === 'off' || row.ruleValue === 'merge') config.mode = row.ruleValue;
      else logger.warn(`入库规则 mode 的取值不合法（${row.ruleValue}），已回落默认值`);
      continue;
    }
    const field = fieldOf(row.ruleKey);
    if (field === undefined) {
      logger.warn(`入库规则出现未知字段 ${row.ruleKey}，已忽略`);
      continue;
    }
    if (!field.strategies.includes(row.ruleValue as MergeStrategy)) {
      logger.warn(`入库规则 ${field.key} 的取值不合法（${row.ruleValue}），已回落默认值`);
      continue;
    }
    config.fields[field.key] = row.ruleValue as MergeStrategy;
  }
  return config;
}

/** 旧版整份 JSON：解析成功就迁移一次，失败只告警、不阻塞采集。 */
async function loadLegacyConfig(settingRepository: Repository<SettingEntity>): Promise<MergeConfig> {
  const row = await settingRepository.findOne({
    where: { key: MERGE_CONFIG_KEY },
    select: { value: true },
  });
  const raw = row?.value ?? '';
  if (raw.trim() === '') return DEFAULT_MERGE_CONFIG;
  try {
    const parsed = normalizeMergeConfig(JSON.parse(raw));
    if (!parsed.ok) {
      logger.warn(`lcm_setting.${MERGE_CONFIG_KEY} 不合法（${parsed.msg}），已使用默认入库规则`);
      return DEFAULT_MERGE_CONFIG;
    }
    return parsed.config;
  } catch {
    logger.warn(`lcm_setting.${MERGE_CONFIG_KEY} 不是合法 JSON，已使用默认入库规则`);
    return DEFAULT_MERGE_CONFIG;
  }
}

/**
 * 读一次入库规则。
 *
 * 表为空时（新库或刚升级）按默认值落库；升级前存在 `lcm_setting.merge_rules` 的，
 * 解析一次后迁移成行再返回。之后所有读取都只走 `lcm_vod_merge_rule`。
 */
export async function loadMergeConfig(
  ruleRepository: Repository<MergeRuleEntity>,
  settingRepository?: Repository<SettingEntity>,
): Promise<MergeConfig> {
  const rows = await ruleRepository.find({ select: { ruleKey: true, ruleValue: true } });
  if (rows.length === 0) {
    const initial =
      settingRepository === undefined ? DEFAULT_MERGE_CONFIG : await loadLegacyConfig(settingRepository);
    await saveMergeConfig(ruleRepository, initial);
    return initial;
  }
  return configFromRows(rows);
}

/** 整份写回：一次 upsert，`rule_key` 是唯一键。 */
export async function saveMergeConfig(
  ruleRepository: Repository<MergeRuleEntity>,
  config: MergeConfig,
): Promise<void> {
  const rows: Array<Pick<MergeRuleEntity, 'ruleKey' | 'ruleValue'>> = [
    { ruleKey: MERGE_MODE_KEY, ruleValue: config.mode },
    ...MERGE_FIELDS.map((field) => ({
      ruleKey: field.key,
      ruleValue: config.fields[field.key] ?? field.strategies[0] ?? 'keep',
    })),
  ];
  await ruleRepository.upsert(rows, ['ruleKey']);
}

/** 图片体检判定为失效的封面域名，采集时会顺带换掉这些封面 */
export async function loadBrokenCoverHosts(
  coverCheckRepository: Repository<CoverCheckEntity>,
): Promise<Set<string>> {
  const rows = await coverCheckRepository.find({ where: { status: 2 }, select: { host: true } });
  return new Set(rows.map((row) => row.host.trim().toLowerCase()).filter((host) => host !== ''));
}

export interface MergeContext {
  /** 这部片已经有本采集源的线路：视为源站自身数据在演进，静态字段允许非空覆盖 */
  trusted: boolean;
  brokenCoverHosts: Set<string>;
}

export interface MergeableVod {
  name: string;
  nameHash: string;
  nameHashLoose: string;
  subName: string;
  cover: string;
  coverHost?: string;
  actor: string;
  director: string;
  writer: string;
  intro: string;
  content: string | null;
  remarks: string;
  releaseDate: string;
  episodeCount: number;
  area: string;
  lang: string;
  year: number;
}

/** 各源站的空值写法，统一当作「没数据」 */
const BLANK_VALUES = new Set([
  '', '-', '--', '—', '未知', '暂无', '无', '空', '不详', 'n/a', 'null', 'undefined',
  '暂无简介', '暂无导演', '暂无演员', '0000-00-00',
]);

const isBlank = (value: string | null | undefined): boolean => {
  const text = String(value ?? '').trim();
  return text === '' || BLANK_VALUES.has(text.toLowerCase());
};

const isEmptyDate = (value: string | null | undefined): boolean => {
  const text = String(value ?? '').trim();
  return text === '' || /^0{4}[-/]0{2}[-/]0{2}/.test(text) || text === '1970-01-01';
};

const PEOPLE_SPLIT = /[,，、/／|;；]+|\s{2,}/;

const countPeople = (value: string | null | undefined): number => {
  const text = String(value ?? '').trim();
  if (isBlank(text)) return 0;
  return text
    .split(PEOPLE_SPLIT)
    .map((part) => part.trim())
    .filter((part) => part !== '' && !isBlank(part)).length;
};

const parseDate = (value: string | null | undefined): { y: number; m: number; d: number } | null => {
  const text = String(value ?? '').trim();
  if (isBlank(text) || isEmptyDate(text)) return null;
  const normal = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (normal) return { y: Number(normal[1]), m: Number(normal[2]), d: Number(normal[3]) };
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return { y: Number(compact[1]), m: Number(compact[2]), d: Number(compact[3]) };
  return null;
};

/**
 * 更新进度：完结 3 > 连载 2 > 其它标记 1 > 空 0。
 * 「已完结」「全集」「全 40 集」算完结，「更新至第 12 集」算连载。
 */
function parseProgress(remarks: string | null | undefined): { rank: number; episode: number } {
  const text = String(remarks ?? '')
    .replace(/[（(][^)）]*[)）]/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (isBlank(text)) return { rank: 0, episode: 0 };
  if (/完结|已完|全集|全\d+集|完结篇/.test(text)) return { rank: 3, episode: 0 };
  const ongoing = text.match(/(?:更新至|更新|连载至?|至)?第?(\d+)集?/);
  if (/更新|连载/.test(text)) return { rank: 2, episode: ongoing ? Number(ongoing[1]) : 0 };
  return { rank: 1, episode: 0 };
}

function mergeProgress(oldValue: string | null, nextValue: string | null): string {
  const oldText = oldValue ?? '';
  const nextText = nextValue ?? '';
  const oldP = parseProgress(oldText);
  const nextP = parseProgress(nextText);
  if (nextP.rank > oldP.rank) return nextText;
  if (nextP.rank < oldP.rank) return oldText;
  if (nextP.rank === 2 && nextP.episode > oldP.episode) return nextText;
  return oldText;
}

function mergeCover(oldValue: string | null, nextValue: string | null, oldHost: string, ctx: MergeContext): string {
  const oldText = oldValue ?? '';
  const nextText = nextValue ?? '';
  if (isBlank(nextText)) return oldText;
  if (isBlank(oldText)) return nextText;
  if (nextText === oldText) return oldText;
  const host = (oldHost || hostOf(oldText)).toLowerCase();
  if (host !== '' && ctx.brokenCoverHosts.has(host)) return nextText;
  if (ctx.trusted) return nextText;
  return oldText;
}

/** 同源更新意味着是源站自己改了数据，静态字段允许非空覆盖 */
function effectiveStrategy(strategy: MergeStrategy, ctx: MergeContext): MergeStrategy {
  if (!ctx.trusted) return strategy;
  if (strategy === 'keep' || strategy === 'progress' || strategy === 'larger' || strategy === 'new') return strategy;
  return 'nonempty';
}

function mergeField(strategy: MergeStrategy, oldValue: string | null, nextValue: string | null): string {
  const oldText = oldValue ?? '';
  const nextText = nextValue ?? '';
  switch (strategy) {
    case 'keep':
      return oldText;
    case 'new':
      return isBlank(nextText) ? oldText : nextText;
    case 'longer':
      return nextText.length > oldText.length ? nextText : oldText;
    case 'more':
      return countPeople(nextText) > countPeople(oldText) ? nextText : oldText;
    case 'nonempty':
    default:
      return isBlank(nextText) ? oldText : nextText;
  }
}

/** 合并的目标字段（不含单独处理的更新进度、集数、封面、上映日期、年份） */
const PLAIN_KEYS = ['subName', 'actor', 'director', 'writer', 'intro', 'content', 'area', 'lang'] as const;
type PlainKey = (typeof PLAIN_KEYS)[number];

/**
 * 计算合并后的字段差异。
 * 只返回真正变化的字段；调用方据此生成 UPDATE，未变化的字段不写。
 */
export function mergeVodContent(
  old: MergeableVod,
  next: MergeableVod,
  config: MergeConfig,
  ctx: MergeContext,
): Partial<MergeableVod> {
  const patch: Partial<MergeableVod> = {};
  const set = <K extends keyof MergeableVod>(key: K, value: MergeableVod[K]): void => {
    if (old[key] === value) return;
    patch[key] = value;
  };

  for (const key of PLAIN_KEYS) {
    const strategy = effectiveStrategy(config.fields[key] ?? 'nonempty', ctx);
    set(key as PlainKey, mergeField(strategy, old[key], next[key]));
  }

  const remarks = config.fields.progress === 'keep' ? (old.remarks ?? '') : mergeProgress(old.remarks, next.remarks);
  set('remarks', remarks);

  const episodeCount =
    config.fields.episodeCount === 'keep' ? old.episodeCount : Math.max(old.episodeCount, next.episodeCount);
  set('episodeCount', episodeCount);

  const coverStrategy = effectiveStrategy(config.fields.cover ?? 'cover', ctx);
  let cover = old.cover ?? '';
  if (coverStrategy === 'nonempty') {
    if (!isBlank(next.cover)) cover = next.cover ?? '';
  } else if (coverStrategy !== 'keep') {
    cover = mergeCover(old.cover, next.cover, old.coverHost ?? '', ctx);
  }
  set('cover', cover);
  // cover_host 是从 cover 派生的业务列，必须跟着一起改，否则后台图片体检会认错域名
  const coverHost = cover === '' ? '' : hostOf(cover);
  if (coverHost !== (old.coverHost ?? '')) set('coverHost', coverHost);

  const dateStrategy = effectiveStrategy(config.fields.releaseDate ?? 'date', ctx);
  if (dateStrategy !== 'keep' && !isBlank(next.releaseDate)) {
    const oldIsDate = parseDate(old.releaseDate) !== null;
    if (!oldIsDate || dateStrategy === 'nonempty') set('releaseDate', next.releaseDate);
  }

  const yearStrategy = config.fields.year ?? 'keep';
  set(
    'year',
    yearStrategy === 'new' ? (next.year > 0 ? next.year : old.year) : old.year > 0 ? old.year : next.year,
  );

  return patch;
}
