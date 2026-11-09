import { z } from 'zod';

const username = z
  .string()
  .trim()
  .min(3, '账号至少 3 个字符')
  .max(50, '账号不能超过 50 个字符')
  .regex(/^[a-zA-Z0-9_-]+$/, '账号只能包含字母、数字、下划线和减号');

const password = z.string().min(6, '密码至少 6 位').max(50, '密码不能超过 50 位');

const nickname = z.string().trim().max(50, '昵称不能超过 50 个字符');

/** 可写字段。 */
const writable = {
  nickname,
  isEnabled: z.number().int().min(0).max(1).default(1),
};

export const AdminUserCreateDTO = z.object({
  username,
  password,
  nickname: nickname.default(''),
  isEnabled: writable.isEnabled,
});
export type AdminUserCreateDTO = z.infer<typeof AdminUserCreateDTO>;

/** 修改：任传一字段即可；传 password 会同时把 passwordVersion +1，让旧 token 失效。 */
export const AdminUserUpdateDTO = z.object({
  id: z.number().int().positive('账号不存在'),
  username: username.optional(),
  password: password.optional(),
  nickname: nickname.optional(),
  isEnabled: z.number().int().min(0).max(1).optional(),
});
export type AdminUserUpdateDTO = z.infer<typeof AdminUserUpdateDTO>;

export const AdminUserGetDTO = z.object({
  id: z.number().int().positive().optional(),
  username: z.string().trim().min(1).optional(),
});
export type AdminUserGetDTO = z.infer<typeof AdminUserGetDTO>;

export const AdminUserPageDTO = z.object({
  pageNum: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  keyword: z.string().trim().max(50).optional(),
  isEnabled: z.number().int().min(0).max(1).optional(),
});
export type AdminUserPageDTO = z.infer<typeof AdminUserPageDTO>;

export const AdminUserAllDTO = z.object({
  isEnabled: z.number().int().min(0).max(1).optional(),
});
export type AdminUserAllDTO = z.infer<typeof AdminUserAllDTO>;

export const AdminUserDeleteDTO = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请选择要删除的账号'),
});
export type AdminUserDeleteDTO = z.infer<typeof AdminUserDeleteDTO>;

/** 登录。 */
export const LoginDTO = z.object({
  username: z.string().trim().min(1, '请输入账号'),
  password: z.string().min(1, '请输入密码'),
});
export type LoginDTO = z.infer<typeof LoginDTO>;

/** 修改自己的密码。 */
export const ChangePasswordDTO = z.object({
  oldPassword: z.string().min(1, '请输入原密码'),
  newPassword: password,
});
export type ChangePasswordDTO = z.infer<typeof ChangePasswordDTO>;

/** 修改自己的资料。 */
export const ProfileDTO = z.object({
  nickname: nickname.min(1, '昵称不能为空'),
});
export type ProfileDTO = z.infer<typeof ProfileDTO>;

/** 输出结构：绝不包含 password。 */
export interface AdminUserVO {
  id: number;
  username: string;
  nickname: string;
  isEnabled: number;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginVO {
  token: string;
  /** 过期时间（秒级时间戳），前端可据此提前跳登录 */
  expireAt: number;
  user: AdminUserVO;
}
