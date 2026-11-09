-- CreateTable
CREATE TABLE `lcm_category` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `pid` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `name` VARCHAR(50) NOT NULL DEFAULT '',
    `alias` VARCHAR(50) NOT NULL DEFAULT '',
    `match_names` VARCHAR(255) NOT NULL DEFAULT '',
    `sort` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `is_show` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_alias`(`alias`),
    INDEX `idx_pid_sort`(`pid`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lcm_vod` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `category_id` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `category_pid` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `name` VARCHAR(255) NOT NULL DEFAULT '',
    `name_hash` CHAR(32) NOT NULL DEFAULT '',
    `name_hash_loose` CHAR(32) NOT NULL DEFAULT '',
    `sub_name` VARCHAR(500) NOT NULL DEFAULT '',
    `cover` VARCHAR(1000) NOT NULL DEFAULT '',
    `cover_host` VARCHAR(255) NOT NULL DEFAULT '',
    `actor` VARCHAR(1000) NOT NULL DEFAULT '',
    `director` VARCHAR(500) NOT NULL DEFAULT '',
    `writer` VARCHAR(500) NOT NULL DEFAULT '',
    `intro` VARCHAR(1000) NOT NULL DEFAULT '',
    `content` TEXT NULL,
    `remarks` VARCHAR(255) NOT NULL DEFAULT '',
    `release_date` VARCHAR(20) NOT NULL DEFAULT '',
    `episode_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `area` VARCHAR(100) NOT NULL DEFAULT '',
    `lang` VARCHAR(100) NOT NULL DEFAULT '',
    `year` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `collected_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_category_status`(`category_id`, `status`),
    INDEX `idx_pid_status`(`category_pid`, `status`),
    INDEX `idx_category_status_year`(`category_id`, `status`, `year`),
    INDEX `idx_pid_status_year`(`category_pid`, `status`, `year`),
    INDEX `idx_name_hash`(`name_hash`),
    INDEX `idx_name_hash_loose`(`name_hash_loose`),
    INDEX `idx_status_collected`(`status`, `collected_at`),
    INDEX `idx_cover_host`(`cover_host`),
    INDEX `idx_search`(`status`, `name`, `year`, `collected_at`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lcm_vod_play` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `vod_id` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `source_id` INTEGER UNSIGNED NULL,
    `source_from` VARCHAR(50) NOT NULL DEFAULT '',
    `source_vod_id` VARCHAR(50) NOT NULL DEFAULT '',
    `source_updated_at` DATETIME(0) NULL,
    `collected_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `play_url` MEDIUMTEXT NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_source`(`source_id`),
    INDEX `idx_source_vod_vod`(`source_id`, `source_vod_id`, `vod_id`),
    UNIQUE INDEX `uk_vod_source_from`(`vod_id`, `source_id`, `source_from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lcm_collect_source` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL DEFAULT '',
    `api_url` VARCHAR(255) NOT NULL DEFAULT '',
    `api_params` VARCHAR(500) NOT NULL DEFAULT '',
    `parse_url` VARCHAR(255) NOT NULL DEFAULT '',
    `is_enabled` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `interval_sec` INTEGER UNSIGNED NOT NULL DEFAULT 3,
    `pagesize` INTEGER UNSIGNED NOT NULL DEFAULT 100,
    `timeout` INTEGER UNSIGNED NOT NULL DEFAULT 30,
    `retry_times` TINYINT UNSIGNED NOT NULL DEFAULT 2,
    `last_sync_at` DATETIME(0) NULL,
    `last_sync_status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `last_sync_msg` VARCHAR(255) NOT NULL DEFAULT '',
    `play_from` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_enabled`(`is_enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lcm_play_line` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `source_from` VARCHAR(50) NOT NULL DEFAULT '',
    `name` VARCHAR(50) NOT NULL DEFAULT '',
    `sort` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `is_enabled` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_source_from`(`source_from`),
    INDEX `idx_sort`(`sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lcm_collect_source_category` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `source_id` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `source_type_id` VARCHAR(50) NOT NULL DEFAULT '',
    `source_type_name` VARCHAR(100) NOT NULL DEFAULT '',
    `source_type_pid` VARCHAR(50) NOT NULL DEFAULT '',
    `category_id` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `match_type` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_category`(`category_id`),
    INDEX `idx_source_status`(`source_id`, `status`),
    UNIQUE INDEX `uk_source_type`(`source_id`, `source_type_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lcm_collect_task` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL DEFAULT '',
    `source_id` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `range_type` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `cron` VARCHAR(50) NOT NULL DEFAULT '',
    `is_enabled` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `last_run_at` DATETIME(0) NULL,
    `last_run_status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `last_run_msg` VARCHAR(255) NOT NULL DEFAULT '',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_source`(`source_id`),
    INDEX `idx_enabled`(`is_enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lcm_collect_task_log` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `task_id` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `source_id` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `task_name` VARCHAR(50) NOT NULL DEFAULT '',
    `range_type` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `total_pages` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `last_page` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `resume_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `interrupted_ms` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `total` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `inserted` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `updated` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `skipped` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `ignored` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `failed` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `message` VARCHAR(500) NOT NULL DEFAULT '',
    `started_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `finished_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_task_started`(`task_id`, `started_at`),
    INDEX `idx_started`(`started_at`),
    INDEX `idx_source_started`(`source_id`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lcm_collect_task_log_detail` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `log_id` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `page` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `total` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `inserted` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `updated` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `skipped` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `ignored` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `failed` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `fail_detail` JSON NULL,
    `message` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_log_page`(`log_id`, `page`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lcm_admin_user` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL DEFAULT '',
    `password` VARCHAR(255) NOT NULL DEFAULT '',
    `nickname` VARCHAR(50) NOT NULL DEFAULT '',
    `is_enabled` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `password_version` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `last_login_at` DATETIME(0) NULL,
    `last_login_ip` VARCHAR(45) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_username`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lcm_ad_feature` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `source_id` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `kind` TINYINT UNSIGNED NOT NULL DEFAULT 2,
    `durations` VARCHAR(255) NOT NULL,
    `total_ms` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `hit_vods` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `sample` JSON NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_source`(`source_id`),
    UNIQUE INDEX `uk_source_durations`(`source_id`, `durations`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lcm_vod_merge_ignore` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `merge_key` VARCHAR(64) NOT NULL,
    `kind` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_merge_key`(`merge_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lcm_source_rule` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `source_id` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `kind` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `from_url` VARCHAR(255) NOT NULL DEFAULT '',
    `to_url` VARCHAR(255) NOT NULL DEFAULT '',
    `is_enabled` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `sort` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_source_kind`(`source_id`, `kind`),
    UNIQUE INDEX `uk_source_kind_from`(`source_id`, `kind`, `from_url`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lcm_cover_check` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `host` VARCHAR(255) NOT NULL DEFAULT '',
    `vod_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `sample_ok` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `sample_fail` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `message` VARCHAR(255) NOT NULL DEFAULT '',
    `checked_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_host`(`host`),
    INDEX `idx_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lcm_setting` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL DEFAULT '',
    `value` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 手工追加：Prisma schema 不支持 CHECK 约束。
-- 把「已映射」与「有目标分类」绑在一起：status = 1 当且仅当 category_id > 0。
ALTER TABLE `lcm_collect_source_category`
    ADD CONSTRAINT `ck_status_mapped` CHECK ((`status` = 1) = (`category_id` > 0));
