-- lcm_setting 初始数据
-- 取自现有 lcm_video 库的 lcm_setting 表，共 15 行（已去掉 site_theme、site_logo、site_favicon、upload_max_mb）
-- value 为 TEXT，布尔开关以 '1' / '0' 存储；类型校验与默认值由 packages/shared/src/settings.ts 的 SETTINGS 元数据负责。
INSERT INTO lcm_setting (`name`, `value`) VALUES
  ('site_name', '蓝草莓影视'),
  ('site_subtitle', '高清影视在线观看'),
  ('site_disclaimer', '本站所有内容均收集自互联网，仅供学习交流，请勿用于商业用途。'),
  ('site_stats_code', ''),
  ('list_page_size', '24'),
  ('login_expire_days', '7'),
  ('collect_log_keep_days', '30'),
  ('player_autoplay', '1'),
  ('player_autonext', '1'),
  ('player_resume', '1'),
  ('player_screenshot', '0'),
  ('player_webfullscreen', '1'),
  ('player_setting', '0'),
  ('player_fullscreen', '1'),
  ('merge_rules', '{"mode":"merge","fields":{"progress":"progress","episodeCount":"larger","cover":"cover","subName":"nonempty","intro":"longer","content":"longer","actor":"more","director":"more","writer":"more","area":"nonempty","lang":"nonempty","releaseDate":"date"}}');
