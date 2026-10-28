-- 蓝草莓影视 初始化脚本
-- 可重复执行：表用 IF NOT EXISTS，种子数据用 INSERT IGNORE

CREATE TABLE IF NOT EXISTS `lcm_category` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `pid`         BIGINT UNSIGNED NOT NULL DEFAULT 0        COMMENT '父分类ID，0=顶级',
  `name`        VARCHAR(50)    NOT NULL DEFAULT ''        COMMENT '分类名称',
  `alias`       VARCHAR(50)    NOT NULL DEFAULT ''        COMMENT 'URL别名，仅小写字母数字减号，必填',
  `match_names` VARCHAR(255)   NOT NULL DEFAULT ''        COMMENT '采集匹配名，英文逗号分隔',
  `sort`        INT UNSIGNED   NOT NULL DEFAULT 0         COMMENT '排序，越小越前',
  `is_show`     TINYINT UNSIGNED  NOT NULL DEFAULT 1      COMMENT '1显示 0隐藏',
  `created_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_alias` (`alias`),
  KEY `idx_pid_sort` (`pid`,`sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lcm_vod` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id`   BIGINT UNSIGNED NOT NULL DEFAULT 0       COMMENT '分类ID，映射到一级或二级分类',
  `category_pid`  BIGINT UNSIGNED NOT NULL DEFAULT 0       COMMENT '父分类ID，冗余；分类为一级时为 0',
  `name`          VARCHAR(255)   NOT NULL DEFAULT ''       COMMENT '标题，存归一化后的值',
  `name_hash`     CHAR(32)       NOT NULL DEFAULT ''       COMMENT '归一化名称的 MD5，判重用',
  `sub_name`      VARCHAR(500)   NOT NULL DEFAULT ''       COMMENT '副标题',
  `letter`        CHAR(1)        NOT NULL DEFAULT ''       COMMENT '首字母，A-Z 或 0-9，其余存空',
  `cover`         VARCHAR(500)   NOT NULL DEFAULT ''       COMMENT '封面，源站完整 URL',
  `actor`         VARCHAR(1000)   NOT NULL DEFAULT ''       COMMENT '演员',
  `director`      VARCHAR(500)   NOT NULL DEFAULT ''       COMMENT '导演',
  `writer`        VARCHAR(500)   NOT NULL DEFAULT ''       COMMENT '编剧',
  `intro`         VARCHAR(1000)   NOT NULL DEFAULT ''       COMMENT '简介，列表用',
  `content`       TEXT                                    COMMENT '详细介绍',
  `remarks`       VARCHAR(255)   NOT NULL DEFAULT ''       COMMENT '备注，如 更新至20集',
  `release_date`  VARCHAR(50)    NOT NULL DEFAULT ''       COMMENT '上映日期，仅展示',
  `episode_count` INT UNSIGNED   NOT NULL DEFAULT 0        COMMENT '总集数，源站声明',
  `area`          VARCHAR(100)    NOT NULL DEFAULT ''       COMMENT '地区',
  `lang`          VARCHAR(100)    NOT NULL DEFAULT ''       COMMENT '语言',
  `year`          INT UNSIGNED   NOT NULL DEFAULT 0        COMMENT '年份',
  `status`        TINYINT UNSIGNED  NOT NULL DEFAULT 1     COMMENT '1上架 0下架',
  `collected_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后采集时间，取所有线路的最大值',
  `created_at`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_category_status` (`category_id`,`status`),
  KEY `idx_pid_status` (`category_pid`,`status`),
  KEY `idx_letter` (`letter`),
  KEY `idx_name_hash` (`name_hash`),
  KEY `idx_status_collected` (`status`,`collected_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lcm_vod_play` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `vod_id`      BIGINT UNSIGNED NOT NULL                   COMMENT '影片ID',
  `source_id`   BIGINT UNSIGNED NOT NULL DEFAULT 0         COMMENT '采集源ID，0=手工添加',
  `source_from` VARCHAR(50)    NOT NULL DEFAULT ''         COMMENT '源站返回的线路标识，如 lzm3u8；手工线路填自定名称',
  `source_vod_id`     VARCHAR(50)    NOT NULL DEFAULT ''   COMMENT '源站影片ID',
  `source_updated_at` DATETIME       NULL DEFAULT NULL     COMMENT '源站标注的更新时间',
  `collected_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '本线路最后采集时间',
  `play_url`    MEDIUMTEXT     NOT NULL                    COMMENT '整条线路的剧集串，原样存',
  `created_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vod_source_from` (`vod_id`,`source_id`,`source_from`),
  KEY `idx_source` (`source_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lcm_collect_source` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`             VARCHAR(50)    NOT NULL DEFAULT ''       COMMENT '源站名称，前台线路显示用',
  `api_url`          VARCHAR(255)   NOT NULL DEFAULT ''       COMMENT '采集接口地址',
  `api_format`       VARCHAR(10)    NOT NULL DEFAULT 'json'   COMMENT '接口类型 json / xml',
  `api_params`       VARCHAR(500)   NOT NULL DEFAULT ''       COMMENT '接口额外参数，如 t=1；不许写 ac/pg/pagesize/at/h',
  `parse_url`        VARCHAR(255)   NOT NULL DEFAULT ''       COMMENT '解析接口地址，空=直连播放',
  `is_enabled`       TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '1启用 0停用',
  `interval_sec`     INT UNSIGNED   NOT NULL DEFAULT 3        COMMENT '两次请求的间隔秒数',
  `pagesize`         INT UNSIGNED   NOT NULL DEFAULT 100      COMMENT '每页条数，1-100',
  `timeout`          INT UNSIGNED   NOT NULL DEFAULT 30       COMMENT '超时秒数',
  `retry_times`      TINYINT UNSIGNED NOT NULL DEFAULT 2      COMMENT '失败重试次数',
  `last_sync_at`     DATETIME       NULL DEFAULT NULL         COMMENT '最后同步时间',
  `last_sync_status` TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '0未同步 1成功 2失败',
  `last_sync_msg`    VARCHAR(255)   NOT NULL DEFAULT ''       COMMENT '最后同步结果说明',
  `created_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_enabled` (`is_enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lcm_play_line` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `source_from` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '源站线路标识，如 lzm3u8',
  `name` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '前台显示名，空则用采集源名称',
  `sort` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序，小的在前',
  `is_enabled` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1 启用 0 停用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_source_from` (`source_from`),
  KEY `idx_sort` (`sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='全站线路注册表';

CREATE TABLE IF NOT EXISTS `lcm_collect_source_category` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source_id`        BIGINT UNSIGNED NOT NULL DEFAULT 0     COMMENT '采集源ID',
  `source_type_id`   VARCHAR(50)    NOT NULL DEFAULT ''     COMMENT '源站分类ID',
  `source_type_name` VARCHAR(100)   NOT NULL DEFAULT ''     COMMENT '源站分类名称',
  `source_type_pid`  VARCHAR(50)    NOT NULL DEFAULT ''     COMMENT '源站父分类ID，树形展示用',
  `category_id`      BIGINT UNSIGNED NOT NULL DEFAULT 0     COMMENT '本站分类ID，0=未映射',
  `match_type`       TINYINT UNSIGNED NOT NULL DEFAULT 0    COMMENT '映射方式 0=无 1=自动 2=手动',
  `status`           TINYINT UNSIGNED NOT NULL DEFAULT 0    COMMENT '0未映射 1已映射 2已忽略',
  `created_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_source_type` (`source_id`,`source_type_id`),
  KEY `idx_category` (`category_id`),
  KEY `idx_source_status` (`source_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lcm_collect_task` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`            VARCHAR(50)    NOT NULL DEFAULT ''       COMMENT '任务名称',
  `source_id`       BIGINT UNSIGNED NOT NULL DEFAULT 0       COMMENT '采集源ID',
  `range_type`      TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '采集范围 1=本日 2=本周 3=本月 4=全部',
  `cron`            VARCHAR(50)    NOT NULL DEFAULT ''       COMMENT 'cron 表达式，空=仅手动',
  `is_enabled`      TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '1启用 0停用',
  `last_run_at`     DATETIME       NULL DEFAULT NULL         COMMENT '最后执行时间',
  `last_run_status` TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '0未跑 1成功 2失败',
  `last_run_msg`    VARCHAR(255)   NOT NULL DEFAULT ''       COMMENT '最后执行结果说明',
  `created_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_source` (`source_id`),
  KEY `idx_enabled` (`is_enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lcm_collect_log` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_id`     BIGINT UNSIGNED NOT NULL DEFAULT 0       COMMENT '任务ID',
  `source_id`   BIGINT UNSIGNED NOT NULL DEFAULT 0       COMMENT '采集源ID',
  `status`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '0进行中 1成功 2失败 3已取消',
  `total_pages` INT UNSIGNED NOT NULL DEFAULT 0     COMMENT '总页数，取自接口 pagecount，0 表示未知',
  `total`       INT UNSIGNED NOT NULL DEFAULT 0     COMMENT '处理总数',
  `inserted`    INT UNSIGNED NOT NULL DEFAULT 0     COMMENT '新增',
  `updated`     INT UNSIGNED NOT NULL DEFAULT 0     COMMENT '更新',
  `skipped`     INT UNSIGNED NOT NULL DEFAULT 0     COMMENT '未映射跳过',
  `ignored`     INT UNSIGNED NOT NULL DEFAULT 0     COMMENT '已忽略分类跳过',
  `failed`      INT UNSIGNED NOT NULL DEFAULT 0     COMMENT '失败',
  `message`     VARCHAR(500)   NOT NULL DEFAULT ''       COMMENT '结果说明或错误信息',
  `started_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '开始时间',
  `finished_at` DATETIME       NULL DEFAULT NULL         COMMENT '结束时间',
  `created_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_task_started` (`task_id`,`started_at`),
  KEY `idx_started` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lcm_collect_log_detail` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `log_id`      BIGINT UNSIGNED NOT NULL DEFAULT 0       COMMENT '所属采集记录',
  `page`        INT UNSIGNED NOT NULL DEFAULT 0     COMMENT '第几页',
  `total`       INT UNSIGNED NOT NULL DEFAULT 0     COMMENT '本页条数',
  `inserted`    INT UNSIGNED NOT NULL DEFAULT 0     COMMENT '新增',
  `updated`     INT UNSIGNED NOT NULL DEFAULT 0     COMMENT '更新',
  `skipped`     INT UNSIGNED NOT NULL DEFAULT 0     COMMENT '未映射跳过',
  `ignored`     INT UNSIGNED NOT NULL DEFAULT 0     COMMENT '已忽略分类跳过',
  `failed`      INT UNSIGNED NOT NULL DEFAULT 0     COMMENT '失败',
  `fail_detail` JSON           NULL                      COMMENT '本页失败明细',
  `message`     VARCHAR(500)   NOT NULL DEFAULT ''       COMMENT '错误信息',
  `created_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_log_page` (`log_id`,`page`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lcm_admin_user` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`         VARCHAR(50)    NOT NULL DEFAULT ''     COMMENT '登录名',
  `password`         VARCHAR(255)   NOT NULL DEFAULT ''     COMMENT '密码哈希',
  `nickname`         VARCHAR(50)    NOT NULL DEFAULT ''     COMMENT '显示名',
  `is_enabled`       TINYINT UNSIGNED NOT NULL DEFAULT 1    COMMENT '1启用 0禁用',
  `password_version` INT UNSIGNED NOT NULL DEFAULT 0        COMMENT '密码版本，改密时 +1，用于踢下线',
  `last_login_at`    DATETIME       NULL DEFAULT NULL       COMMENT '最后登录时间',
  `last_login_ip`    VARCHAR(45)    NULL DEFAULT NULL       COMMENT '最后登录IP',
  `created_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lcm_setting` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(50)    NOT NULL DEFAULT ''       COMMENT '配置键',
  `value`       TEXT           NULL                      COMMENT '配置值',
  `created_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 初始管理员：admin / admin123
INSERT IGNORE INTO `lcm_admin_user` (`id`,`username`,`password`,`nickname`,`is_enabled`,`password_version`)
VALUES (1, 'admin', 'scrypt$16384$8$1$0dd0716fcb70ae9ebb842cc1e359ff21$79448eff1da0d75503da6ea00f5d19852c63cb126fd54623ab9ffa956b4290bb', '管理员', 1, 0);

-- 默认配置
INSERT IGNORE INTO `lcm_setting` (`name`,`value`) VALUES
  ('site_name', '蓝草莓影视'),
  ('site_subtitle', '高清影视在线观看'),
  ('site_logo', ''),
  ('site_favicon', ''),
  ('site_disclaimer', '本站所有内容均收集自互联网，仅供学习交流，请勿用于商业用途。'),
  ('site_theme', 'default'),
  ('site_stats_code', ''),
  ('list_page_size', '24'),
  ('player_autoplay', '0'),
  ('player_autonext', '1'),
  ('player_resume', '1'),
  ('player_screenshot', '1'),
  ('player_fullscreen', '1'),
  ('player_webfullscreen', '0'),
  ('player_setting', '1'),
  ('login_expire_days', '7'),
  ('collect_log_keep_days', '30'),
  ('upload_max_mb', '2');

-- 初始分类：4 个一级分类 + 30 个二级分类
INSERT IGNORE INTO `lcm_category` (`id`,`pid`,`name`,`alias`,`sort`,`is_show`) VALUES
  -- 一级分类
  (1, 0, '电影', 'dianying', 1, 1),
  (2, 0, '剧集', 'juji', 2, 1),
  (3, 0, '综艺', 'zongyi', 3, 1),
  (4, 0, '动漫', 'dongman', 4, 1),

  -- 电影子类（15）
  (5, 1, '动作片', 'dongzuopian', 1, 1),
  (6, 1, '喜剧片', 'xijupian', 2, 1),
  (7, 1, '爱情片', 'aiqingpian', 3, 1),
  (8, 1, '科幻片', 'kehuanpian', 4, 1),
  (9, 1, '恐怖片', 'kongbupian', 5, 1),
  (10, 1, '剧情片', 'juqingpian', 6, 1),
  (11, 1, '战争片', 'zhanzhengpian', 7, 1),
  (12, 1, '惊悚片', 'jingsongpian', 8, 1),
  (13, 1, '悬疑片', 'xuanyipian', 9, 1),
  (14, 1, '犯罪片', 'fanzuipian', 10, 1),
  (15, 1, '灾难片', 'zainanpian', 11, 1),
  (16, 1, '奇幻片', 'qihuanpian', 12, 1),
  (17, 1, '纪录片', 'jilupian', 13, 1),
  (18, 1, '伦理片', 'lunlipian', 14, 1),
  (19, 1, '动画片', 'donghuapian', 15, 1),

  -- 剧集子类（5）
  (20, 2, '国产剧', 'guochanju', 1, 1),
  (21, 2, '港台剧', 'gangtaiju', 2, 1),
  (22, 2, '日韩剧', 'rihanju', 3, 1),
  (23, 2, '欧美剧', 'oumeiju', 4, 1),
  (24, 2, '海外剧', 'haiwaiju', 5, 1),

  -- 综艺子类（5）
  (25, 3, '大陆综艺', 'daluzongyi', 1, 1),
  (26, 3, '港台综艺', 'gangtaizongyi', 2, 1),
  (27, 3, '日韩综艺', 'rihanzongyi', 3, 1),
  (28, 3, '欧美综艺', 'oumeizongyi', 4, 1),
  (29, 3, '海外综艺', 'haiwaizongyi', 5, 1),

  -- 动漫子类（5）
  (30, 4, '国产动漫', 'guochandongman', 1, 1),
  (31, 4, '港台动漫', 'gangtaidongman', 2, 1),
  (32, 4, '日韩动漫', 'rihandongman', 3, 1),
  (33, 4, '欧美动漫', 'oumeidongman', 4, 1),
  (34, 4, '海外动漫', 'haiwaidongman', 5, 1);
