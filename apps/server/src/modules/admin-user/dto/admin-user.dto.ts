import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** 新建账号。 */
export class CreateAdminUserDTO {
  @IsString({ message: '账号必须是字符串' })
  @MinLength(3, { message: '账号至少 3 个字符' })
  @MaxLength(50, { message: '账号最长 50 个字符' })
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: '账号只能包含字母、数字、下划线和减号' })
  username!: string;

  @IsString({ message: '密码必须是字符串' })
  @MinLength(6, { message: '密码至少 6 个字符' })
  @MaxLength(50, { message: '密码最长 50 个字符' })
  password!: string;

  @IsOptional()
  @IsString({ message: '昵称必须是字符串' })
  @MaxLength(50, { message: '昵称最长 50 个字符' })
  nickname?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '启用状态只能是 0 或 1' })
  isEnabled?: number;
}

/** 修改账号。密码留空表示不改。 */
export class UpdateAdminUserDTO {
  @IsOptional()
  @IsString({ message: '昵称必须是字符串' })
  @MaxLength(50, { message: '昵称最长 50 个字符' })
  nickname?: string;

  @IsOptional()
  @IsString({ message: '密码必须是字符串' })
  @MinLength(6, { message: '密码至少 6 个字符' })
  @MaxLength(50, { message: '密码最长 50 个字符' })
  password?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '启用状态只能是 0 或 1' })
  isEnabled?: number;
}

/** 登录。 */
export class LoginDTO {
  @IsString({ message: '账号必须是字符串' })
  @MinLength(1, { message: '请输入账号' })
  @MaxLength(50, { message: '账号最长 50 个字符' })
  username!: string;

  @IsString({ message: '密码必须是字符串' })
  @MinLength(1, { message: '请输入密码' })
  @MaxLength(50, { message: '密码最长 50 个字符' })
  password!: string;

  /**
   * 验证码令牌：`GET /auth/captcha` 返回的 id，一次性。
   * 这里只做「是不是字符串」的类型校验，真伪交给 `verifyCaptcha()`——
   * 每个字段挂多个装饰器会让同一个字段回一串重复的错误文案。
   */
  @IsString({ message: '验证码已失效，请刷新后重试' })
  captchaId!: string;

  @IsString({ message: '请输入验证码' })
  captchaCode!: string;
}

/** 改自己的密码。 */
export class ChangePasswordDTO {
  @IsString({ message: '原密码必须是字符串' })
  @MinLength(1, { message: '请输入原密码' })
  oldPassword!: string;

  @IsString({ message: '新密码必须是字符串' })
  @MinLength(6, { message: '新密码至少 6 个字符' })
  @MaxLength(50, { message: '新密码最长 50 个字符' })
  newPassword!: string;
}

/** 改自己的昵称。 */
export class UpdateProfileDTO {
  @IsString({ message: '昵称必须是字符串' })
  @MinLength(1, { message: '昵称不能为空' })
  @MaxLength(50, { message: '昵称最长 50 个字符' })
  nickname!: string;
}

/** 登录成功后返回给前端的数据。 */
export interface LoginVO {
  token: string;
  expireAt: string;
  user: { id: string; username: string; nickname: string };
}
