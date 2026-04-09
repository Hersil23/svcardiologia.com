-- ============================================================
-- SVC App — Migration: Registration Sessions
-- Run this in phpMyAdmin on production database
-- ============================================================

CREATE TABLE IF NOT EXISTS `registration_sessions` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `token` VARCHAR(64) NOT NULL UNIQUE,
  `ip_address` VARCHAR(45),
  `data` JSON,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_token` (`token`),
  INDEX `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
