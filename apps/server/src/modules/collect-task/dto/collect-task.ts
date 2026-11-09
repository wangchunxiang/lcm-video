import { isValidCron } from '@lcm/shared';
import { z } from 'zod';

/** 采集范围：1 最近 24 小时 2 最近 7 天 3 最近 30 天 4 全部 */
const rangeType = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)], {
  message: '采集范围只能是 1-4',
});

/** 5 段式 cron，空串表示不按时间跑，只能手动触发 */
const cronText = z
  .string()
  .trim()
  .max(50, 'cron 表达式不能超过 50 个字符')
  .refine((value) => value === '' || isValidCron(value) === null, {
    message: 'cron 表达式不合法（分 时 日 月 周，5 段）',
  });

const enabledFlag = z.union([z.literal(0), z.literal(1)]);

export const CollectTaskCreateDTO = z.object({
  name: z.string().trim().min(1, '任务名称不能为空').max(50, '任务名称不能超过 50 个字符'),
  sourceId: z.number().int().positive('请选择采集源'),
  rangeType: rangeType.default(1),
  cron: cronText.default(''),
  isEnabled: enabledFlag.default(1),
});
export type CollectTaskCreateDTO = z.infer<typeof CollectTaskCreateDTO>;

export const CollectTaskUpdateDTO = z.object({
  id: z.number().int().positive('任务不存在'),
  name: z.string().trim().min(1, '任务名称不能为空').max(50, '任务名称不能超过 50 个字符').optional(),
  sourceId: z.number().int().positive('请选择采集源').optional(),
  rangeType: rangeType.optional(),
  cron: cronText.optional(),
  isEnabled: enabledFlag.optional(),
});
export type CollectTaskUpdateDTO = z.infer<typeof CollectTaskUpdateDTO>;

export const CollectTaskGetDTO = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().optional(),
  sourceId: z.number().int().positive().optional(),
});
export type CollectTaskGetDTO = z.infer<typeof CollectTaskGetDTO>;

export const CollectTaskPageDTO = z.object({
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
  keyword: z.string().trim().max(50).optional(),
  sourceId: z.number().int().positive().optional(),
  isEnabled: z.number().int().optional(),
});
export type CollectTaskPageDTO = z.infer<typeof CollectTaskPageDTO>;

export const CollectTaskAllDTO = z.object({
  sourceId: z.number().int().positive().optional(),
  isEnabled: z.number().int().optional(),
});
export type CollectTaskAllDTO = z.infer<typeof CollectTaskAllDTO>;

export const CollectTaskDeleteDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择要删除的任务'),
});
export type CollectTaskDeleteDTO = z.infer<typeof CollectTaskDeleteDTO>;

export const CollectTaskBatchDTO = z.object({
  action: z.union([z.literal('enable'), z.literal('disable'), z.literal('delete')], {
    message: '不支持的操作',
  }),
  ids: z.array(z.number().int().positive()).min(1, '请先选择任务'),
});
export type CollectTaskBatchDTO = z.infer<typeof CollectTaskBatchDTO>;

export interface CollectTaskVO {
  id: number;
  name: string;
  sourceId: number;
  sourceName: string;
  rangeType: number;
  cron: string;
  isEnabled: number;
  lastRunAt: string | null;
  lastRunStatus: number;
  lastRunMsg: string;
  /** 当前正在执行的采集记录 id，没有则为 null */
  runningLogId: number | null;
  /** 按 cron 算出的下次执行时间，停用或没有 cron 时为 null */
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}
