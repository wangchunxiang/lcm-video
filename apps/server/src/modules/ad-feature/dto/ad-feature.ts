import { z } from 'zod';

/** 广告位置：1 片头 2 片中 3 片尾 */
const kindField = z.union([z.literal(1), z.literal(2), z.literal(3)], {
  message: '广告位置只能是 1-3',
});

/** 分片时长指纹：逗号分隔的数字，字符串才能建唯一索引 */
const durationsField = z
  .string()
  .trim()
  .min(1, '缺少时长序列')
  .max(255, '时长序列不能超过 255 个字符')
  .refine((value) => value.split(',').every((part) => part.trim() !== '' && !Number.isNaN(Number(part))), {
    message: '时长序列只能是逗号分隔的数字',
  });

const sampleItem = z.object({
  vod_id: z.number().int().optional(),
  vod_name: z.string().optional(),
  start: z.number().optional(),
  start_sec: z.number().optional(),
  url: z.string().optional(),
});

const sampleField = z.array(sampleItem).nullable().optional();

export const AdFeatureCreateDTO = z.object({
  sourceId: z.number().int().positive('请选择采集源'),
  kind: kindField.optional(),
  durations: durationsField,
  totalMs: z.number().int().min(0).optional(),
  hitVods: z.number().int().min(0).optional(),
  sample: sampleField,
});
export type AdFeatureCreateDTO = z.infer<typeof AdFeatureCreateDTO>;

export const AdFeatureUpdateDTO = z.object({
  id: z.number().int().positive('特征不存在'),
  kind: kindField.optional(),
  durations: durationsField.optional(),
  totalMs: z.number().int().min(0).optional(),
  hitVods: z.number().int().min(0).optional(),
  sample: sampleField,
});
export type AdFeatureUpdateDTO = z.infer<typeof AdFeatureUpdateDTO>;

export const AdFeatureGetDTO = z.object({
  id: z.number().int().positive().optional(),
  sourceId: z.number().int().positive().optional(),
  durations: z.string().trim().optional(),
});
export type AdFeatureGetDTO = z.infer<typeof AdFeatureGetDTO>;

export const AdFeaturePageDTO = z.object({
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
  sourceId: z.number().int().positive().optional(),
  kind: z.number().int().min(1).max(3).optional(),
});
export type AdFeaturePageDTO = z.infer<typeof AdFeaturePageDTO>;

export const AdFeatureAllDTO = z.object({
  sourceId: z.number().int().positive().optional(),
  kind: z.number().int().min(1).max(3).optional(),
});
export type AdFeatureAllDTO = z.infer<typeof AdFeatureAllDTO>;

export const AdFeatureBySourceDTO = z.object({
  sourceId: z.number().int().positive('请选择采集源'),
});
export type AdFeatureBySourceDTO = z.infer<typeof AdFeatureBySourceDTO>;

export const AdFeatureDeleteDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择要删除的特征'),
});
export type AdFeatureDeleteDTO = z.infer<typeof AdFeatureDeleteDTO>;

export interface AdFeatureVO {
  id: number;
  sourceId: number;
  sourceName: string;
  kind: number;
  durations: string;
  totalMs: number;
  hitVods: number;
  sample: unknown;
  createdAt: string;
  updatedAt: string;
}

/** 抽取样本 / 执行分析：只按采集源 */
export const AdFeatureAnalyzeDTO = z.object({
  sourceId: z.number().int().positive('请选择采集源'),
});
export type AdFeatureAnalyzeDTO = z.infer<typeof AdFeatureAnalyzeDTO>;
