import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

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

/** 批量保存里的一条。 */
export class SettingEntryDTO {
  @IsString({ message: '配置键必须是字符串' })
  @MaxLength(50, { message: '配置键最长 50 个字符' })
  key!: string;

  @IsString({ message: '配置值必须是字符串' })
  value!: string;
}

/**
 * 批量保存配置（`POST save-many`）。
 *
 * 写成 DTO 而不是内联类型，是为了让全局 `AppValidationPipe` 生效：
 * 少传 `entries` 或传了非数组时回 400「entries: ...」而不是 500。
 */
export class SaveSettingsDTO {
  @IsArray({ message: 'entries 必须是数组' })
  @ArrayMaxSize(100, { message: '一次最多保存 100 项' })
  @ValidateNested({ each: true })
  @Type(() => SettingEntryDTO)
  entries!: SettingEntryDTO[];
}
