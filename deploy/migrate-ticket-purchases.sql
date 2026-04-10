-- ============================================================
-- SVC App — Migration: Ticket Purchases + Event Payment Methods
-- Run in phpMyAdmin on production database
-- ============================================================

CREATE TABLE IF NOT EXISTS `ticket_purchases` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NOT NULL,
  `event_id` INT UNSIGNED NOT NULL,
  `ticket_type_id` INT UNSIGNED NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
  `method` VARCHAR(50) NOT NULL,
  `reference_number` VARCHAR(100) DEFAULT NULL,
  `proof_url` VARCHAR(500) DEFAULT NULL,
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by` INT UNSIGNED DEFAULT NULL,
  `reviewed_at` DATETIME DEFAULT NULL,
  `ticket_id` INT UNSIGNED DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_tp_user` (`user_id`),
  KEY `idx_tp_event` (`event_id`),
  KEY `idx_tp_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add payment_methods JSON column to events table
ALTER TABLE `events` ADD COLUMN IF NOT EXISTS `payment_methods` JSON DEFAULT NULL;
