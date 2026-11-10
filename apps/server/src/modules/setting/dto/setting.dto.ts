import { IsOptional, IsString, MaxLength } from 'class-validator';

/** 新建配置项。`key` 是库里 `name` 列，业务侧统一叫 key。 */
export class CreateSettingDTO {
  @IsString({ message: '配置键必须是字符串' })
  @MaxLength(50, { message: '配置键最长 50 个字符' })
  key!: string;

  @IsOptional()
  @IsString({ message: '配置值必须是字符串' })
  value?: string;
}

/** 修改配置值。`key` 与 `value` 都可选，只改传入的。 */
export class UpdateSettingDTO {
  @IsOptional()
  @IsString({ message: '配置键必须是字符串' })
  @MaxLength(50, { message: '配置键最长 50 个字符' })
  key?: string;

  @IsOptional()
  @IsString({ message: '配置值必须是字符串' })
  value?: string;
}
