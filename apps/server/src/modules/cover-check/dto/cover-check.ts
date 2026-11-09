import { z } from 'zod';

/** 0 未检查 1 正常 2 失效 3 无法验证 */
const statusField = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)], {
  message: '状态只能是 0-3',
});

/** 封面域名：不含协议与路径 */
const hostField = z
  .string()
  .trim()
  .min(1, '域名不能为空')
  .max(255, '域名不能超过 255 个字符');

export const CoverCheckCreateDTO = z.object({
  host: hostField,
  vodCount: z.number().int().min(0).default(0),
  status: statusField.default(0),
  sampleOk: z.number().int().min(0).default(0),
  sampleFail: z.number().int().min(0).default(0),
  message: z.string().trim().max(255).default(''),
  checkedAt: z.coerce.date().nullable().optional(),
});
export type CoverCheckCreateDTO = z.infer<typeof CoverCheckCreateDTO>;

export const CoverCheckUpdateDTO = z.object({
  id: z.number().int().positive('记录不存在'),
  vodCount: z.number().int().min(0).optional(),
  status: statusField.optional(),
  sampleOk: z.number().int().min(0).optional(),
  sampleFail: z.number().int().min(0).optional(),
  message: z.string().trim().max(255).optional(),
  checkedAt: z.coerce.date().nullable().optional(),
});
export type CoverCheckUpdateDTO = z.infer<typeof CoverCheckUpdateDTO>;

export const CoverCheckGetDTO = z.object({
  id: z.number().int().positive().optional(),
  host: hostField.optional(),
});
export type CoverCheckGetDTO = z.infer<typeof CoverCheckGetDTO>;

export const CoverCheckPageDTO = z.object({
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
  host: z.string().trim().max(255).optional(),
  status: statusField.optional(),
});
export type CoverCheckPageDTO = z.infer<typeof CoverCheckPageDTO>;

export const CoverCheckAllDTO = z.object({
  status: statusField.optional(),
});
export type CoverCheckAllDTO = z.infer<typeof CoverCheckAllDTO>;

export const CoverCheckDeleteDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择要删除的记录'),
});
export type CoverCheckDeleteDTO = z.infer<typeof CoverCheckDeleteDTO>;

/** 按域名分页看该域名下的影片 */
export const CoverCheckHostVodsDTO = z.object({
  host: hostField,
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
});
export type CoverCheckHostVodsDTO = z.infer<typeof CoverCheckHostVodsDTO>;

export interface CoverCheckVO {
  id: number;
  host: string;
  vodCount: number;
  status: number;
  sampleOk: number;
  sampleFail: number;
  message: string;
  checkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 域名行：影片数是实时统计，检查结果是上次快照（没有检查过就是 0） */
export interface CoverCheckHostVO {
  host: string;
  vodCount: number;
  status: number;
  sampleOk: number;
  sampleFail: number;
  message: string;
  checkedAt: string | null;
}

export interface CoverCheckSummaryVO {
  hosts: number;
  ok: number;
  bad: number;
  unverified: number;
  unchecked: number;
}
