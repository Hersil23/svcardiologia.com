-- ============================================================
-- Sociedad Venezolana de Cardiologia - Database Schema
-- Version: 1.0.0
-- ============================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "-04:00";

CREATE DATABASE IF NOT EXISTS `svc_app`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `svc_app`;

-- ============================================================
-- USERS (authentication)
-- ============================================================
CREATE TABLE `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('member','admin','superadmin') NOT NULL DEFAULT 'member',
  `status` ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  `last_login_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_users_email` (`email`),
  KEY `idx_users_role` (`role`),
  KEY `idx_users_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- MEMBERS (profile data)
-- ============================================================
CREATE TABLE `members` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `cedula` VARCHAR(20) DEFAULT NULL,
  `phone` VARCHAR(30) DEFAULT NULL,
  `specialty` VARCHAR(150) DEFAULT NULL,
  `institution` VARCHAR(255) DEFAULT NULL,
  `city` VARCHAR(100) DEFAULT NULL,
  `state` VARCHAR(100) DEFAULT NULL,
  `country` VARCHAR(100) NOT NULL DEFAULT 'Venezuela',
  `avatar_url` VARCHAR(500) DEFAULT NULL,
  `membership_number` VARCHAR(30) DEFAULT NULL,
  `membership_status` ENUM('pending','active','expired','suspended') NOT NULL DEFAULT 'pending',
  `membership_expires_at` DATE DEFAULT NULL,
  `bio` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_members_user` (`user_id`),
  UNIQUE KEY `idx_members_cedula` (`cedula`),
  UNIQUE KEY `idx_members_membership_number` (`membership_number`),
  KEY `idx_members_status` (`membership_status`),
  KEY `idx_members_name` (`last_name`, `first_name`),
  CONSTRAINT `fk_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PAYMENT TYPES
-- ============================================================
CREATE TABLE `payment_types` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_payment_types_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE `payments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `payment_type_id` INT UNSIGNED NOT NULL,
  `reference_number` VARCHAR(100) DEFAULT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
  `method` ENUM('transfer','mobile_payment','zelle','cash','other') NOT NULL DEFAULT 'transfer',
  `status` ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `proof_url` VARCHAR(500) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `reviewed_by` INT UNSIGNED DEFAULT NULL,
  `reviewed_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_payments_user` (`user_id`),
  KEY `idx_payments_status` (`status`),
  KEY `idx_payments_type` (`payment_type_id`),
  KEY `idx_payments_created` (`created_at`),
  CONSTRAINT `fk_payments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_payments_type` FOREIGN KEY (`payment_type_id`) REFERENCES `payment_types` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_payments_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- EVENTS
-- ============================================================
CREATE TABLE `events` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `location` VARCHAR(255) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `cover_image_url` VARCHAR(500) DEFAULT NULL,
  `starts_at` DATETIME NOT NULL,
  `ends_at` DATETIME DEFAULT NULL,
  `registration_opens_at` DATETIME DEFAULT NULL,
  `registration_closes_at` DATETIME DEFAULT NULL,
  `max_attendees` INT UNSIGNED DEFAULT NULL,
  `is_published` TINYINT(1) NOT NULL DEFAULT 0,
  `is_featured` TINYINT(1) NOT NULL DEFAULT 0,
  `created_by` INT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_events_slug` (`slug`),
  KEY `idx_events_starts` (`starts_at`),
  KEY `idx_events_published` (`is_published`),
  KEY `idx_events_featured` (`is_featured`),
  CONSTRAINT `fk_events_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- EVENT TICKET TYPES
-- ============================================================
CREATE TABLE `event_ticket_types` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
  `quantity_available` INT UNSIGNED DEFAULT NULL,
  `quantity_sold` INT UNSIGNED NOT NULL DEFAULT 0,
  `sale_starts_at` DATETIME DEFAULT NULL,
  `sale_ends_at` DATETIME DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ticket_types_event` (`event_id`),
  KEY `idx_ticket_types_active` (`is_active`),
  CONSTRAINT `fk_ticket_types_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TICKETS (issued to users)
-- ============================================================
CREATE TABLE `tickets` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uid` VARCHAR(64) NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `event_id` INT UNSIGNED NOT NULL,
  `ticket_type_id` INT UNSIGNED NOT NULL,
  `payment_id` INT UNSIGNED DEFAULT NULL,
  `qr_token` VARCHAR(128) NOT NULL,
  `status` ENUM('active','used','cancelled','expired') NOT NULL DEFAULT 'active',
  `checked_in_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_tickets_uid` (`uid`),
  UNIQUE KEY `idx_tickets_qr` (`qr_token`),
  KEY `idx_tickets_user` (`user_id`),
  KEY `idx_tickets_event` (`event_id`),
  KEY `idx_tickets_status` (`status`),
  CONSTRAINT `fk_tickets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_tickets_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_tickets_type` FOREIGN KEY (`ticket_type_id`) REFERENCES `event_ticket_types` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_tickets_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- QR SCAN LOG
-- ============================================================
CREATE TABLE `qr_scan_log` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ticket_id` INT UNSIGNED NOT NULL,
  `scanned_by` INT UNSIGNED NOT NULL,
  `scan_result` ENUM('valid','already_used','invalid','expired') NOT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `user_agent` VARCHAR(500) DEFAULT NULL,
  `scanned_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_scans_ticket` (`ticket_id`),
  KEY `idx_scans_scanned_by` (`scanned_by`),
  KEY `idx_scans_time` (`scanned_at`),
  CONSTRAINT `fk_scans_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_scans_scanner` FOREIGN KEY (`scanned_by`) REFERENCES `users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================
CREATE TABLE `announcements` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `image_url` VARCHAR(500) DEFAULT NULL,
  `link_url` VARCHAR(500) DEFAULT NULL,
  `priority` ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  `is_published` TINYINT(1) NOT NULL DEFAULT 0,
  `published_at` DATETIME DEFAULT NULL,
  `expires_at` DATETIME DEFAULT NULL,
  `created_by` INT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_announcements_published` (`is_published`, `published_at`),
  KEY `idx_announcements_priority` (`priority`),
  KEY `idx_announcements_expires` (`expires_at`),
  CONSTRAINT `fk_announcements_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- AUTH TOKENS (JWT refresh / revocation)
-- ============================================================
CREATE TABLE `auth_tokens` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `token_hash` VARCHAR(128) NOT NULL,
  `type` ENUM('access','refresh','password_reset') NOT NULL DEFAULT 'refresh',
  `device_info` VARCHAR(255) DEFAULT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `expires_at` DATETIME NOT NULL,
  `revoked_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_tokens_hash` (`token_hash`),
  KEY `idx_tokens_user` (`user_id`),
  KEY `idx_tokens_expires` (`expires_at`),
  KEY `idx_tokens_type` (`type`),
  CONSTRAINT `fk_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SECURITY: security_log
-- ============================================================
CREATE TABLE `security_log` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_type` VARCHAR(50) NOT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `user_id` INT UNSIGNED DEFAULT NULL,
  `user_agent` VARCHAR(500) DEFAULT NULL,
  `details` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_seclog_type` (`event_type`),
  KEY `idx_seclog_ip` (`ip_address`),
  KEY `idx_seclog_time` (`created_at`),
  KEY `idx_seclog_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SECURITY: login_attempts
-- ============================================================
CREATE TABLE `login_attempts` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ip_address` VARCHAR(45) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `attempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `locked_until` DATETIME DEFAULT NULL,
  `last_attempt_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_login_ip_email` (`ip_address`, `email`),
  KEY `idx_login_locked` (`locked_until`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SECURITY: rate_limits
-- ============================================================
CREATE TABLE `rate_limits` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ip_address` VARCHAR(45) NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rl_ip_action` (`ip_address`, `action`),
  KEY `idx_rl_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SECURITY: blocked_ips
-- ============================================================
CREATE TABLE `blocked_ips` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ip_address` VARCHAR(45) NOT NULL,
  `reason` VARCHAR(500) DEFAULT NULL,
  `expires_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_blocked_ip` (`ip_address`),
  KEY `idx_blocked_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SECURITY: csrf_tokens
-- ============================================================
CREATE TABLE `csrf_tokens` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `token_hash` VARCHAR(128) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_csrf_hash` (`token_hash`),
  KEY `idx_csrf_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-increment ticket quantity_sold when a ticket is created
DELIMITER //
CREATE TRIGGER `trg_ticket_after_insert` AFTER INSERT ON `tickets`
FOR EACH ROW
BEGIN
  UPDATE `event_ticket_types`
  SET `quantity_sold` = `quantity_sold` + 1
  WHERE `id` = NEW.`ticket_type_id`;
END//

-- Decrement quantity_sold when a ticket is cancelled
CREATE TRIGGER `trg_ticket_after_update` AFTER UPDATE ON `tickets`
FOR EACH ROW
BEGIN
  IF OLD.`status` != 'cancelled' AND NEW.`status` = 'cancelled' THEN
    UPDATE `event_ticket_types`
    SET `quantity_sold` = GREATEST(`quantity_sold` - 1, 0)
    WHERE `id` = NEW.`ticket_type_id`;
  END IF;
END//

-- Auto-set published_at when announcement is published
CREATE TRIGGER `trg_announcement_before_update` BEFORE UPDATE ON `announcements`
FOR EACH ROW
BEGIN
  IF OLD.`is_published` = 0 AND NEW.`is_published` = 1 AND NEW.`published_at` IS NULL THEN
    SET NEW.`published_at` = NOW();
  END IF;
END//

DELIMITER ;

-- ============================================================
-- SEED DATA
-- ============================================================

-- ============================================================
-- FILE UPLOADS
-- ============================================================
CREATE TABLE `file_uploads` (
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

-- Default payment types
INSERT INTO `payment_types` (`name`, `description`, `amount`, `currency`) VALUES
('Inscripcion Anual', 'Cuota de inscripcion anual como miembro de la SVC', 50.00, 'USD'),
('Renovacion Anual', 'Renovacion de membresia anual', 30.00, 'USD'),
('Inscripcion Congreso', 'Inscripcion general para congresos de la SVC', 100.00, 'USD'),
('Inscripcion Taller', 'Inscripcion para talleres y cursos', 40.00, 'USD');

-- Default superadmin (password: SVC2024Admin! — change immediately)
INSERT INTO `users` (`email`, `password_hash`, `role`, `status`) VALUES
('admin@svcardiologia.com', '$2y$12$LJ3m4ys4Fp.HxVMHoF1PYuYBqKCfGLDBqMZ0aWMxnEBGsDJsFCyie', 'superadmin', 'active');

INSERT INTO `members` (`user_id`, `first_name`, `last_name`, `membership_status`) VALUES
(1, 'Admin', 'SVC', 'active');

COMMIT;
