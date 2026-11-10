import { z } from 'zod';

/** 分组键：32 位哈希（可带 ~年份），或 `源站id-源站影片id` */
const keyField = z.string().trim().min(1, '缺少分组标识').max(80);
const kindField = z.union([z.literal('auto'), z.literal('suspect'), z.literal('same')], {
  message: '分组类型只能是 auto / suspect / same',
});

export const VodMergeGroupDTO = z.object({
  key: keyField,
  kind: kindField.default('auto'),
});
export type VodMergeGroupDTO = z.infer<typeof VodMergeGroupDTO>;

export const VodMergeMergeDTO = z.object({
  ids: z.array(z.number().int().positive()).min(2, '请至少选择两条影片'),
  keepId: z.number().int().positive().optional(),
});
export type VodMergeMergeDTO = z.infer<typeof VodMergeMergeDTO>;

export const VodMergeIgnoreDTO = z.object({
  key: keyField,
  kind: kindField.default('auto'),
  ignored: z.boolean().default(true),
});
export type VodMergeIgnoreDTO = z.infer<typeof VodMergeIgnoreDTO>;

export const VodMergeBatchDTO = z.object({
  confirm: z.boolean().default(false),
});
export type VodMergeBatchDTO = z.infer<typeof VodMergeBatchDTO>;

export const VodMergeBatchKeysDTO = z.object({
  keys: z
    .array(z.object({ key: keyField, kind: kindField.default('auto') }))
    .min(1, '请先选择分组')
    .max(500, '一次最多处理 500 组'),
  action: z.union([z.literal('merge'), z.literal('ignore')], { message: '动作只能是 merge 或 ignore' }).default('merge'),
  confirm: z.boolean().default(false),
});
export type VodMergeBatchKeysDTO = z.infer<typeof VodMergeBatchKeysDTO>;
