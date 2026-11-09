-- lcm_admin_user 初始数据
-- 取自现有 lcm_video 库的 lcm_admin_user 表（1 个账号）
-- password 为 `scrypt$N$r$p$salt$hash` 格式的哈希，不是明文；上线后请立即修改密码。
-- last_login_at / last_login_ip 不导出，留空。
INSERT INTO lcm_admin_user (id, username, password, nickname, is_enabled, password_version) VALUES
  (1, 'admin', 'scrypt$16384$8$1$0dd0716fcb70ae9ebb842cc1e359ff21$79448eff1da0d75503da6ea00f5d19852c63cb126fd54623ab9ffa956b4290bb', '管理员', 1, 0);
