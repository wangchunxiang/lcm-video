import { z } from 'zod';

/** 规则类型：1 播放地址 2 图片地址 */
const kind = z.union([z.literal(1), z.literal(2)], { message: '类型只能是播放地址或图片地址' });

const fromUrl = z
  .string()
  .trim()
  .min(1, '请填写原地址')
  .max(255, '原地址不能超过 255 个字符')
  .refine((value) => !/\s/.test(value), '原地址里不能有空格');

const toUrl = z
  .string()
  .trim()
  .max(255, '新地址不能超过 255 个字符')
  .refine((value) => !/\s/.test(value), '新地址里不能有空格');

export const SourceRuleCreateDTO = z
  .object({
    sourceId: z.number().int().positive('请选择采集源'),
    kind,
    /** 空字符串表示「删掉这个前缀」 */
    fromUrl,
    toUrl,
    isEnabled: z.union([z.literal(0), z.literal(1)]).default(1),
    sort: z.number().int().min(0).max(65535).default(0),
  })
  .refine((value) => value.fromUrl !== value.toUrl, {
    message: '原地址与新地址不能相同',
    path: ['toUrl'],
  });
export type SourceRuleCreateDTO = z.infer<typeof SourceRuleCreateDTO>;

export const SourceRuleUpdateDTO = z
  .object({
    id: z.number().int().positive('规则不存在'),
    sourceId: z.number().int().positive('请选择采集源').optional(),
    kind: kind.optional(),
    fromUrl: fromUrl.optional(),
    toUrl: toUrl.optional(),
    isEnabled: z.union([z.literal(0), z.literal(1)]).optional(),
    sort: z.number().int().min(0).max(65535).optional(),
  })
  .refine(
    (value) => value.fromUrl === undefined || value.toUrl === undefined || value.fromUrl !== value.toUrl,
    { message: '原地址与新地址不能相同', path: ['toUrl'] },
  );
export type SourceRuleUpdateDTO = z.infer<typeof SourceRuleUpdateDTO>;

export const SourceRuleGetDTO = z.object({
  id: z.number().int().positive().optional(),
  sourceId: z.number().int().positive().optional(),
  kind: z.number().int().optional(),
  fromUrl: z.string().trim().optional(),
});
export type SourceRuleGetDTO = z.infer<typeof SourceRuleGetDTO>;

export const SourceRulePageDTO = z.object({
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  sourceId: z.number().int().positive().optional(),
  kind: z.number().int().optional(),
  isEnabled: z.number().int().optional(),
  keyword: z.string().trim().max(50).optional(),
});
export type SourceRulePageDTO = z.infer<typeof SourceRulePageDTO>;

export const SourceRuleAllDTO = z.object({
  sourceId: z.number().int().positive().optional(),
  kind: z.number().int().optional(),
  isEnabled: z.number().int().optional(),
});
export type SourceRuleAllDTO = z.infer<typeof SourceRuleAllDTO>;

export const SourceRuleDeleteDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择要删除的规则'),
});
export type SourceRuleDeleteDTO = z.infer<typeof SourceRuleDeleteDTO>;

export const SourceRuleApplyDTO = z.object({
  id: z.number().int().positive('规则不存在'),
  confirm: z.boolean().default(false),
});
export type SourceRuleApplyDTO = z.infer<typeof SourceRuleApplyDTO>;

export interface SourceRuleVO {
  id: number;
  sourceId: number;
  sourceName: string;
  kind: number;
  fromUrl: string;
  toUrl: string;
  isEnabled: number;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface SourceRuleApplyResult {
  needConfirm: boolean;
  total: number;
  affected: number;
}
