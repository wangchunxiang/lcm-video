import { z } from 'zod';

const counters = {
  total: z.number().int().min(0).default(0),
  inserted: z.number().int().min(0).default(0),
  updated: z.number().int().min(0).default(0),
  skipped: z.number().int().min(0).default(0),
  ignored: z.number().int().min(0).default(0),
  failed: z.number().int().min(0).default(0),
};

/** 失败明细：[{vodId,name,reason}]，与旧库 JSON 结构保持一致 */
const failDetail = z
  .array(
    z.object({
      vodId: z.number().int().optional(),
      name: z.string().optional(),
      reason: z.string().optional(),
    }),
  )
  .nullable()
  .optional();

export const CollectTaskLogDetailCreateDTO = z.object({
  logId: z.number().int().positive('采集记录不存在'),
  page: z.number().int().min(0).default(0),
  message: z.string().trim().max(500).default(''),
  failDetail,
  ...counters,
});
export type CollectTaskLogDetailCreateDTO = z.infer<typeof CollectTaskLogDetailCreateDTO>;

export const CollectTaskLogDetailUpdateDTO = z.object({
  id: z.number().int().positive('明细不存在'),
  page: z.number().int().min(0).optional(),
  message: z.string().trim().max(500).optional(),
  failDetail,
  total: z.number().int().min(0).optional(),
  inserted: z.number().int().min(0).optional(),
  updated: z.number().int().min(0).optional(),
  skipped: z.number().int().min(0).optional(),
  ignored: z.number().int().min(0).optional(),
  failed: z.number().int().min(0).optional(),
});
export type CollectTaskLogDetailUpdateDTO = z.infer<typeof CollectTaskLogDetailUpdateDTO>;

export const CollectTaskLogDetailGetDTO = z.object({
  id: z.number().int().positive().optional(),
  logId: z.number().int().positive().optional(),
  page: z.number().int().min(0).optional(),
});
export type CollectTaskLogDetailGetDTO = z.infer<typeof CollectTaskLogDetailGetDTO>;

export const CollectTaskLogDetailPageDTO = z.object({
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
  logId: z.number().int().positive('采集记录不存在'),
});
export type CollectTaskLogDetailPageDTO = z.infer<typeof CollectTaskLogDetailPageDTO>;

export const CollectTaskLogDetailAllDTO = z.object({
  logId: z.number().int().positive('采集记录不存在'),
});
export type CollectTaskLogDetailAllDTO = z.infer<typeof CollectTaskLogDetailAllDTO>;

export const CollectTaskLogDetailDeleteDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择要删除的明细'),
});
export type CollectTaskLogDetailDeleteDTO = z.infer<typeof CollectTaskLogDetailDeleteDTO>;

export interface CollectTaskLogDetailVO {
  id: number;
  logId: number;
  page: number;
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  ignored: number;
  failed: number;
  failDetail: unknown;
  message: string;
  createdAt: string;
  updatedAt: string;
}
