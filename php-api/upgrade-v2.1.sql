-- VATANMSG 2.1.0 security and privacy migration.
-- Back up the database first, then run once in phpMyAdmin.
-- Adds metadata for active sessions and per-account privacy preferences.

ALTER TABLE api_tokens
  ADD COLUMN ip_address VARCHAR(45) NULL,
  ADD COLUMN user_agent VARCHAR(255) NULL,
  ADD COLUMN last_seen_at DATETIME NULL;

ALTER TABLE conversation_settings
  ADD COLUMN show_signatures TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS user_privacy_settings (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  phone_visibility ENUM('everyone','contacts','nobody') NOT NULL DEFAULT 'nobody',
  profile_visibility ENUM('everyone','contacts','nobody') NOT NULL DEFAULT 'everyone',
  last_seen_visibility ENUM('everyone','contacts','nobody') NOT NULL DEFAULT 'contacts',
  group_invite_visibility ENUM('everyone','contacts','nobody') NOT NULL DEFAULT 'contacts',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_privacy_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
