-- VATANMSG v2 feature migration for an existing MariaDB database.
-- BACK UP the database first. Select the Vatan database in phpMyAdmin.
-- Run once. Check existing columns/tables and skip any that already exist.
-- This migration preserves existing users, conversations, and messages.

ALTER TABLE conversations
  ADD COLUMN avatar_url VARCHAR(2048) NULL AFTER description;

ALTER TABLE messages
  ADD COLUMN reply_to_id BIGINT UNSIGNED NULL AFTER sender_id,
  ADD COLUMN client_message_id VARCHAR(64) NULL AFTER reply_to_id;

-- Idempotency key: clients reuse the same client_message_id when retrying a send.
CREATE UNIQUE INDEX uq_messages_client_send
  ON messages (conversation_id, sender_id, client_message_id);

CREATE TABLE conversation_settings (
  conversation_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  theme_key VARCHAR(32) NOT NULL DEFAULT 'violet',
  theme_mode ENUM('light','dark','system') NOT NULL DEFAULT 'system',
  member_can_send TINYINT(1) NOT NULL DEFAULT 1,
  member_can_invite TINYINT(1) NOT NULL DEFAULT 0,
  member_can_pin TINYINT(1) NOT NULL DEFAULT 0,
  slow_mode_seconds SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_conversation_settings_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE message_reactions (
  message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  reaction VARCHAR(16) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id, reaction),
  CONSTRAINT fk_reactions_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_reactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_reactions_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE message_receipts (
  message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  delivered_at DATETIME NULL,
  read_at DATETIME NULL,
  PRIMARY KEY (message_id, user_id),
  CONSTRAINT fk_receipts_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_receipts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_receipts_user_read (user_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE message_attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  message_id BIGINT UNSIGNED NOT NULL,
  uploader_id BIGINT UNSIGNED NOT NULL,
  storage_path VARCHAR(512) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(127) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attachments_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_attachments_user FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_attachments_message (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE push_devices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  platform ENUM('ios','android','web') NOT NULL,
  push_token VARCHAR(512) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_token (push_token(191)),
  CONSTRAINT fk_push_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_push_devices_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username_key VARCHAR(64) NOT NULL,
  ip_key CHAR(64) NOT NULL,
  attempted_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  was_successful TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_login_attempts_window (username_key, ip_key, attempted_at),
  INDEX idx_login_attempts_cleanup (attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Keep existing api_tokens: each device/session has its own revocable bearer token.
-- For ownership transfer, update conversations.created_by and swap member roles
-- in one transaction via the new ownership-transfer API; never delete the old owner
-- before the new owner is assigned.
