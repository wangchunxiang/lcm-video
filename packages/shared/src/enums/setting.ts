/**
 * 设置项的枚举。用 `as const` 对象而不是 `enum`：
 * 编译后就是普通对象，值仍是字符串字面量，前后端 JSON 直接对得上，也没有 `enum` 的反向映射。
 */

/** 设置项的输入控件类型，后台表单按它选组件。 */
export const SettingType = {
  Text: 'text',
  Textarea: 'textarea',
  Number: 'number',
  Switch: 'switch',
  Select: 'select',
  Order: 'order',
} as const;
export type SettingType = (typeof SettingType)[keyof typeof SettingType];

/** 设置项的分组，对应后台「站点 / 播放 / 广告 / 账号」四个页签。 */
export const SettingGroup = {
  Site: 'site',
  Playback: 'playback',
  Ads: 'ads',
  Account: 'account',
} as const;
export type SettingGroup = (typeof SettingGroup)[keyof typeof SettingGroup];
