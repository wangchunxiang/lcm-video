import { z } from 'zod';

/** 按 name 取一条配置。 */
export const SettingDTO = z.object({
  name: z.string().min(1, '配置键不能为空').max(50, '配置键最长 50 个字符'),
});
export type SettingDTO = z.infer<typeof SettingDTO>;

/** 保存一条配置（不存在则新建）。 */
export const SettingUpdateDTO = z.object({
  name: z.string().min(1, '配置键不能为空').max(50, '配置键最长 50 个字符'),
  value: z.string().max(65535, '配置值过长'),
});
export type SettingUpdateDTO = z.infer<typeof SettingUpdateDTO>;

export interface SettingVO {
  name: string;
  value: string;
}
