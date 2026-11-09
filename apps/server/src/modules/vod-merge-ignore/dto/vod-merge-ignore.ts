import { z } from 'zod';

/** 1 严格重复 2 疑似重复 */
const kindField = z.union([z.literal(1), z.literal(2)], { message: '类型只能是 1（严格）或 2（疑似）' });

/** 形如 auto:<md5> / suspect:<md5>~<year> / same:<id>-<name>，与合并工具生成的键一致 */
const mergeKeyField = z
  .string()
  .trim()
  .min(1, '分组标识不能为空')
  .max(64, '分组标识不能超过 64 个字符');

export const VodMergeIgnoreCreateDTO = z.object({
  mergeKey: mergeKeyField,
  kind: kindField.default(1),
});
export type VodMergeIgnoreCreateDTO = z.infer<typeof VodMergeIgnoreCreateDTO>;

export const VodMergeIgnoreUpdateDTO = z.object({
  id: z.number().int().positive('记录不存在'),
  mergeKey: mergeKeyField.optional(),
  kind: kindField.optional(),
});
export type VodMergeIgnoreUpdateDTO = z.infer<typeof VodMergeIgnoreUpdateDTO>;

export const VodMergeIgnoreGetDTO = z.object({
  id: z.number().int().positive().optional(),
  mergeKey: mergeKeyField.optional(),
});
export type VodMergeIgnoreGetDTO = z.infer<typeof VodMergeIgnoreGetDTO>;

export const VodMergeIgnorePageDTO = z.object({
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
  keyword: z.string().trim().max(64).optional(),
  kind: kindField.optional(),
});
export type VodMergeIgnorePageDTO = z.infer<typeof VodMergeIgnorePageDTO>;

export const VodMergeIgnoreAllDTO = z.object({
  kind: kindField.optional(),
});
export type VodMergeIgnoreAllDTO = z.infer<typeof VodMergeIgnoreAllDTO>;

export const VodMergeIgnoreDeleteDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择要删除的记录'),
});
export type VodMergeIgnoreDeleteDTO = z.infer<typeof VodMergeIgnoreDeleteDTO>;

/** 忽略 / 恢复一个重复分组：按 mergeKey 幂等写入或删除 */
export const VodMergeIgnoreToggleDTO = z.object({
  mergeKey: mergeKeyField,
  kind: kindField.default(1),
  ignored: z.boolean().default(true),
});
export type VodMergeIgnoreToggleDTO = z.infer<typeof VodMergeIgnoreToggleDTO>;

/** 批量查一批分组里哪些被忽略了，合并工具据此过滤 */
export const VodMergeIgnoreByKeysDTO = z.object({
  keys: z.array(mergeKeyField).min(1, '请先选择分组').max(1000),
});
export type VodMergeIgnoreByKeysDTO = z.infer<typeof VodMergeIgnoreByKeysDTO>;

export interface VodMergeIgnoreVO {
  id: number;
  mergeKey: string;
  kind: number;
  createdAt: string;
  updatedAt: string;
}
