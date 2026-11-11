import type { SettingGroup, SettingType } from '../enums/setting.ts';

/** 一个设置项的声明：后台表单与前台读取共用同一份，值存在 lcm_setting 里。 */
export interface SettingField {
  /** 存储键，对应 lcm_setting.name */
  key: string;
  group: SettingGroup;
  label: string;
  type: SettingType;
  default: string;
  /** 说明文字，展示在表单项下方 */
  hint?: string;
  /** type = select 时的选项 */
  options?: { label: string; value: string }[];
  /** 小节标题，同一小节内的字段连续展示 */
  section?: string;
}
