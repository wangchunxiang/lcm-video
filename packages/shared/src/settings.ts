import type { SettingField } from './types/setting.ts';

export const SETTINGS: SettingField[] = [
  {
    key: 'list_page_size',
    section: '列表',
    group: 'site',
    label: '列表每页条数',
    type: 'number',
    default: '24',
    hint: '前台首页与分类页每页显示的影片数量，建议保持 24（三行八列）。',
  },
  {
    key: 'collect_log_keep_days',
    section: '列表',
    group: 'site',
    label: '采集记录保留天数',
    type: 'number',
    default: '30',
    hint: '调度器每天清理一次超出天数的采集记录。',
  },
  {
    key: 'site_name',
    section: '站点信息',
    group: 'site',
    label: '站点名称',
    type: 'text',
    default: '蓝草莓影视',
  },
  {
    key: 'site_subtitle',
    section: '站点信息',
    group: 'site',
    label: '站点副标题',
    type: 'text',
    default: '高清影视在线观看',
  },
  {
    key: 'site_disclaimer',
    section: '页脚',
    group: 'site',
    label: '免责声明',
    type: 'textarea',
    default: '本站所有内容均收集自互联网，仅供学习交流，请勿用于商业用途。',
    hint: '显示在前台页脚。',
  },
  {
    key: 'site_stats_code',
    section: '页脚',
    group: 'site',
    label: '统计代码',
    type: 'textarea',
    default: '',
    hint: '原样输出到前台页面底部。',
  },
  {
    key: 'player_autoplay',
    section: '播放行为',
    group: 'playback',
    label: '自动播放',
    type: 'switch',
    default: '1',
    hint: '进入播放页自动开始',
  },
  {
    key: 'player_autonext',
    section: '播放行为',
    group: 'playback',
    label: '自动连播',
    type: 'switch',
    default: '1',
    hint: '播完自动跳下一集',
  },
  {
    key: 'player_resume',
    section: '播放行为',
    group: 'playback',
    label: '进度记忆',
    type: 'switch',
    default: '1',
    hint: '记住上次看到的位置',
  },
  {
    key: 'player_screenshot',
    section: '控制栏按钮',
    group: 'playback',
    label: '截图按钮',
    type: 'switch',
    default: '0',
    hint: '一键保存当前画面',
  },
  {
    key: 'player_fullscreen',
    section: '控制栏按钮',
    group: 'playback',
    label: '全屏',
    type: 'switch',
    default: '1',
    hint: '全屏播放',
  },
  {
    key: 'player_webfullscreen',
    section: '控制栏按钮',
    group: 'playback',
    label: '网页全屏',
    type: 'switch',
    default: '1',
    hint: '撑满窗口，不隐藏标签栏',
  },
  {
    key: 'player_setting',
    section: '控制栏按钮',
    group: 'playback',
    label: '设置面板',
    type: 'switch',
    default: '0',
    hint: '齿轮按钮，展开下面三项',
  },
  {
    key: 'login_expire_days',
    group: 'account',
    label: '登录有效期（天）',
    type: 'number',
    default: '7',
  },
];

/**
 * 配置键的默认值。**默认值只这一份**：新库的种子数据（`seeds/lcm_setting.sql`）、
 * 服务端「库里缺这一行」时的回退（`portal.service.ts` 的 `siteConfig`）、后台表单初值
 * 都从这里取；`apps/server/src/database/settings-seed.test.ts` 守着三者不漂移。
 */
export function settingDefault(key: string): string | undefined {
  return SETTINGS.find((field) => field.key === key)?.default;
}

/** 布尔开关的默认值，判定与 `SettingService.flag` 一致：`'1'` 为真，其余为假。 */
export function settingDefaultFlag(key: string): boolean {
  return settingDefault(key) === '1';
}
