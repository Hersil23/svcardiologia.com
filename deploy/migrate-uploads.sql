-- ============================================================
-- SVC App — Migration: File Uploads + Member Document URLs
-- Run this in phpMyAdmin on production database
-- ============================================================

CREATE TABLE IF NOT EXISTS `file_uploads` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `member_id` INT UNSIGNED NULL,
  `upload_type` VARCHAR(50) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `remote_path` VARCHAR(500) NOT NULL,
  `cdn_url` VARCHAR(500) NOT NULL,
  `thumbnail_url` VARCHAR(500) NULL,
  `file_size` INT UNSIGNED NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_uploads_user` (`user_id`),
  KEY `idx_uploads_member` (`member_id`),
  KEY `idx_uploads_type` (`upload_type`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add document URL columns to members table
ALTER TABLE `members` ADD COLUMN IF NOT EXISTS `foto_url` VARCHAR(500) NULL;
ALTER TABLE `members` ADD COLUMN IF NOT EXISTS `cedula_url` VARCHAR(500) NULL;
ALTER TABLE `members` ADD COLUMN IF NOT EXISTS `titulo_medico_url` VARCHAR(500) NULL;
ALTER TABLE `members` ADD COLUMN IF NOT EXISTS `titulo_especialidad_url` VARCHAR(500) NULL;
ALTER TABLE `members` ADD COLUMN IF NOT EXISTS `cv_url` VARCHAR(500) NULL;
