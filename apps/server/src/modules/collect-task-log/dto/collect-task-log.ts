import { z } from 'zod';

/** 记录状态：1 运行中 2 成功 3 失败 4 已取消 */
const statusField = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)], {
  message: '状态只能是 1-4',
});

/** 失败明细里的单条 */
export const FailItemDTO = z.object({
  vodId: z.number().int().optional(),
  name: z.string().optional(),
  reason: z.string().optional(),
});
export type FailItemDTO = z.infer<typeof FailItemDTO>;

const counters = {
  total: z.number().int().min(0).default(0),
  inserted: z.number().int().min(0).default(0),
  updated: z.number().int().min(0).default(0),
  skipped: z.number().int().min(0).default(0),
  ignored: z.number().int().min(0).default(0),
  failed: z.number().int().min(0).default(0),
};

export const CollectTaskLogCreateDTO = z.object({
  /** 0 表示手动采集 */
  taskId: z.number().int().min(0).default(0),
  sourceId: z.number().int().positive('请选择采集源'),
  taskName: z.string().trim().max(50).default(''),
  rangeType: z.number().int().min(1).max(4).default(1),
  status: statusField.default(1),
  totalPages: z.number().int().min(0).default(0),
  lastPage: z.number().int().min(0).default(0),
  message: z.string().trim().max(500).default(''),
  ...counters,
});
export type CollectTaskLogCreateDTO = z.infer<typeof CollectTaskLogCreateDTO>;

export const CollectTaskLogUpdateDTO = z.object({
  id: z.number().int().positive('记录不存在'),
  status: statusField.optional(),
  totalPages: z.number().int().min(0).optional(),
  lastPage: z.number().int().min(0).optional(),
  resumeCount: z.number().int().min(0).optional(),
  interruptedMs: z.number().int().min(0).optional(),
  total: z.number().int().min(0).optional(),
  inserted: z.number().int().min(0).optional(),
  updated: z.number().int().min(0).optional(),
  skipped: z.number().int().min(0).optional(),
  ignored: z.number().int().min(0).optional(),
  failed: z.number().int().min(0).optional(),
  message: z.string().trim().max(500).optional(),
  finishedAt: z.coerce.date().optional(),
});
export type CollectTaskLogUpdateDTO = z.infer<typeof CollectTaskLogUpdateDTO>;

export const CollectTaskLogGetDTO = z.object({
  id: z.number().int().positive().optional(),
  taskId: z.number().int().min(0).optional(),
  sourceId: z.number().int().positive().optional(),
  /** 顺带返回该记录的明细分页 */
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
});
export type CollectTaskLogGetDTO = z.infer<typeof CollectTaskLogGetDTO>;

export const CollectTaskLogPageDTO = z.object({
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
  taskId: z.number().int().min(0).optional(),
  sourceId: z.number().int().positive().optional(),
  status: z.number().int().optional(),
  keyword: z.string().trim().max(50).optional(),
});
export type CollectTaskLogPageDTO = z.infer<typeof CollectTaskLogPageDTO>;

export const CollectTaskLogAllDTO = z.object({
  taskId: z.number().int().min(0).optional(),
  sourceId: z.number().int().positive().optional(),
  status: z.number().int().optional(),
});
export type CollectTaskLogAllDTO = z.infer<typeof CollectTaskLogAllDTO>;

export const CollectTaskLogDeleteDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择要删除的记录'),
});
export type CollectTaskLogDeleteDTO = z.infer<typeof CollectTaskLogDeleteDTO>;

export interface CollectTaskLogVO {
  id: number;
  taskId: number;
  taskName: string;
  sourceId: number;
  sourceName: string;
  rangeType: number;
  status: number;
  /** taskId 为 0 即手动采集，不建任务行 */
  manual: boolean;
  totalPages: number;
  lastPage: number;
  resumeCount: number;
  interruptedMs: number;
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  ignored: number;
  failed: number;
  message: string;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
