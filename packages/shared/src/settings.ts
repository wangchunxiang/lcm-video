export type SettingType = 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'order';

export type SettingGroup = 'base' | 'site' | 'playback' | 'account';

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
}

export const SETTING_GROUPS: { key: SettingGroup; label: string }[] = [
  { key: 'base', label: '基础设置' },
  { key: 'site', label: '站点设置' },
  { key: 'playback', label: '播放设置' },
  { key: 'account', label: '账号设置' },
];

export const SETTINGS: SettingField[] = [
  {
    key: 'list_page_size',
    group: 'base',
    label: '列表每页条数',
    type: 'number',
    default: '24',
    hint: '前台首页与分类页每页显示的影片数量，建议保持 24（三行八列）。',
  },
  {
    key: 'collect_log_keep_days',
    group: 'base',
    label: '采集记录保留天数',
    type: 'number',
    default: '30',
    hint: '调度器每天清理一次超出天数的采集记录。',
  },
  {
    key: 'upload_max_mb',
    group: 'base',
    label: '单文件上传上限（MB）',
    type: 'number',
    default: '2',
  },
  {
    key: 'site_name',
    group: 'site',
    label: '站点名称',
    type: 'text',
    default: '蓝草莓影视',
  },
  {
    key: 'site_subtitle',
    group: 'site',
    label: '站点副标题',
    type: 'text',
    default: '高清影视在线观看',
  },
  {
    key: 'site_logo',
    group: 'site',
    label: '站点 LOGO',
    type: 'text',
    default: '',
    hint: '填写图片地址，或通过上传得到 /uploads/ 开头的路径。',
  },
  {
    key: 'site_favicon',
    group: 'site',
    label: '站点图标',
    type: 'text',
    default: '',
  },
  {
    key: 'site_icp',
    group: 'site',
    label: '备案号',
    type: 'text',
    default: '',
  },
  {
    key: 'site_keywords',
    group: 'site',
    label: 'SEO 关键词',
    type: 'textarea',
    default: '',
  },
  {
    key: 'site_description',
    group: 'site',
    label: 'SEO 描述',
    type: 'textarea',
    default: '蓝草莓影视，提供最新电影、电视剧、综艺、动漫在线观看',
  },
  {
    key: 'site_disclaimer',
    group: 'site',
    label: '免责声明',
    type: 'textarea',
    default: '本站所有内容均收集自互联网，仅供学习交流，请勿用于商业用途。',
    hint: '显示在前台页脚。',
  },
  {
    key: 'site_stats_code',
    group: 'site',
    label: '统计代码',
    type: 'textarea',
    default: '',
    hint: '原样输出到前台页面底部。',
  },
  {
    key: 'site_theme',
    group: 'site',
    label: '当前模板',
    type: 'select',
    default: 'default',
    options: [{ label: '默认模板', value: 'default' }],
  },
  {
    key: 'player_type',
    group: 'playback',
    label: '播放器',
    type: 'select',
    default: 'dplayer',
    options: [
      { label: 'DPlayer', value: 'dplayer' },
      { label: 'ArtPlayer', value: 'artplayer' },
    ],
    hint: '用于直连线路；配置了解析接口的线路仍然用 iframe 播放。',
  },
  {
    key: 'player_autoplay',
    group: 'playback',
    label: '自动播放',
    type: 'switch',
    default: '0',
    hint: '开启后进入播放页自动开始播放，部分浏览器会因静音策略拦截。',
  },
  {
    key: 'login_expire_days',
    group: 'account',
    label: '登录有效期（天）',
    type: 'number',
    default: '7',
  },
];

export const SETTING_KEYS = SETTINGS.map((item) => item.key);

export function settingDefault(key: string): string {
  return SETTINGS.find((item) => item.key === key)?.default ?? '';
}
