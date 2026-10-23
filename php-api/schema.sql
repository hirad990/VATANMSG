-- VATANMSG single-schema repair/bootstrap for cPanel MariaDB.
-- BACK UP the database before running this file.
-- Select the existing VATANMSG database in phpMyAdmin, then run/import this file.
-- Idempotent: CREATE TABLE IF NOT EXISTS plus ADD COLUMN IF NOT EXISTS.
-- This keeps existing user/message data; it does not DROP tables or erase records.
-- Target: MariaDB (cPanel default) with InnoDB and utf8mb4.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone_e164 VARCHAR(20) NULL,
  username VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255) NULL,
  display_name VARCHAR(60) NOT NULL,
  avatar_url VARCHAR(2048) NULL,
  birth_year SMALLINT UNSIGNED NULL,
  birth_calendar ENUM('solar_hijri','gregorian') NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_users_username (username), UNIQUE KEY uq_users_phone (phone_e164),
  KEY idx_users_display_name (display_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  last_seen_at DATETIME NULL,
  PRIMARY KEY (id), UNIQUE KEY uq_api_tokens_hash (token_hash),
  KEY idx_api_tokens_user_expiry (user_id, expires_at), KEY idx_api_tokens_expiry (expires_at),
  CONSTRAINT fk_api_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(100) NULL,
  description VARCHAR(280) NULL,
  type ENUM('private','group','channel') NOT NULL DEFAULT 'group',
  created_by BIGINT UNSIGNED NOT NULL,
  channel_id VARCHAR(32) NULL,
  avatar_url VARCHAR(2048) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_conversations_channel_id (channel_id),
  KEY idx_conversations_updated (updated_at), KEY idx_conversations_creator (created_by),
  CONSTRAINT fk_conversations_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('owner','admin','member','subscriber') NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id), KEY idx_members_user (user_id),
  CONSTRAINT fk_members_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_settings (
  conversation_id BIGINT UNSIGNED NOT NULL,
  theme_key VARCHAR(32) NOT NULL DEFAULT 'default',
  theme_mode ENUM('light','dark','system') NOT NULL DEFAULT 'system',
  member_can_send TINYINT(1) NOT NULL DEFAULT 1,
  member_can_invite TINYINT(1) NOT NULL DEFAULT 1,
  member_can_pin TINYINT(1) NOT NULL DEFAULT 1,
  slow_mode_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  show_signatures TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id),
  CONSTRAINT fk_conversation_settings_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  reply_to_id BIGINT UNSIGNED NULL,
  client_message_id VARCHAR(80) NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_at DATETIME NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id), KEY idx_messages_conversation_created (conversation_id, id),
  KEY idx_messages_sender (sender_id), KEY idx_messages_reply (reply_to_id),
  UNIQUE KEY uq_message_client_id (conversation_id, sender_id, client_message_id),
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id),
  CONSTRAINT fk_messages_reply FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id BIGINT UNSIGNED NOT NULL,
  uploader_id BIGINT UNSIGNED NOT NULL,
  storage_path VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(127) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY idx_attachments_message (message_id), KEY idx_attachments_uploader (uploader_id),
  CONSTRAINT fk_attachments_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_attachments_uploader FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  reaction VARCHAR(32) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id, reaction), KEY idx_reactions_user (user_id),
  CONSTRAINT fk_reactions_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_reactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_receipts (
  message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  delivered_at DATETIME NULL,
  read_at DATETIME NULL,
  PRIMARY KEY (message_id, user_id), KEY idx_receipts_user (user_id),
  CONSTRAINT fk_receipts_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_receipts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username_key VARCHAR(64) NOT NULL,
  ip_key VARCHAR(64) NOT NULL,
  was_successful TINYINT(1) NOT NULL DEFAULT 0,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY idx_login_attempts_lookup (username_key, ip_key, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_devices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  platform ENUM('ios','android','web') NOT NULL,
  push_token VARCHAR(512) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_push_token (push_token), KEY idx_push_devices_user (user_id),
  CONSTRAINT fk_push_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_privacy_settings (
  user_id BIGINT UNSIGNED NOT NULL,
  phone_visibility ENUM('everyone','contacts','nobody') NOT NULL DEFAULT 'nobody',
  profile_visibility ENUM('everyone','contacts','nobody') NOT NULL DEFAULT 'everyone',
  last_seen_visibility ENUM('everyone','contacts','nobody') NOT NULL DEFAULT 'contacts',
  group_invite_visibility ENUM('everyone','contacts','nobody') NOT NULL DEFAULT 'contacts',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_privacy_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Repair missing columns on older installs. Nullable/defaulted definitions preserve existing rows.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_e164 VARCHAR(20) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(32) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(60) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(2048) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_year SMALLINT UNSIGNED NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_calendar ENUM('solar_hijri','gregorian') NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS user_id BIGINT UNSIGNED NULL;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS token_hash CHAR(64) NULL;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS expires_at DATETIME NULL;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45) NULL;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS user_agent VARCHAR(255) NULL;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS last_seen_at DATETIME NULL;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS title VARCHAR(100) NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS description VARCHAR(280) NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS type ENUM('private','group','channel') NOT NULL DEFAULT 'group';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by BIGINT UNSIGNED NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel_id VARCHAR(32) NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(2048) NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS conversation_id BIGINT UNSIGNED NULL;
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS user_id BIGINT UNSIGNED NULL;
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS role ENUM('owner','admin','member','subscriber') NOT NULL DEFAULT 'member';
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE conversation_settings ADD COLUMN IF NOT EXISTS theme_key VARCHAR(32) NOT NULL DEFAULT 'default';
ALTER TABLE conversation_settings ADD COLUMN IF NOT EXISTS theme_mode ENUM('light','dark','system') NOT NULL DEFAULT 'system';
ALTER TABLE conversation_settings ADD COLUMN IF NOT EXISTS member_can_send TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE conversation_settings ADD COLUMN IF NOT EXISTS member_can_invite TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE conversation_settings ADD COLUMN IF NOT EXISTS member_can_pin TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE conversation_settings ADD COLUMN IF NOT EXISTS slow_mode_seconds INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE conversation_settings ADD COLUMN IF NOT EXISTS show_signatures TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE conversation_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id BIGINT UNSIGNED NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_id BIGINT UNSIGNED NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id BIGINT UNSIGNED NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_message_id VARCHAR(80) NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS body TEXT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at DATETIME NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS message_id BIGINT UNSIGNED NULL;
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS uploader_id BIGINT UNSIGNED NULL;
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS storage_path VARCHAR(255) NULL;
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS original_name VARCHAR(255) NULL;
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS mime_type VARCHAR(127) NULL;
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE message_reactions ADD COLUMN IF NOT EXISTS message_id BIGINT UNSIGNED NULL;
ALTER TABLE message_reactions ADD COLUMN IF NOT EXISTS user_id BIGINT UNSIGNED NULL;
ALTER TABLE message_reactions ADD COLUMN IF NOT EXISTS reaction VARCHAR(32) NULL;
ALTER TABLE message_reactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE message_receipts ADD COLUMN IF NOT EXISTS message_id BIGINT UNSIGNED NULL;
ALTER TABLE message_receipts ADD COLUMN IF NOT EXISTS user_id BIGINT UNSIGNED NULL;
ALTER TABLE message_receipts ADD COLUMN IF NOT EXISTS delivered_at DATETIME NULL;
ALTER TABLE message_receipts ADD COLUMN IF NOT EXISTS read_at DATETIME NULL;

ALTER TABLE auth_login_attempts ADD COLUMN IF NOT EXISTS username_key VARCHAR(64) NULL;
ALTER TABLE auth_login_attempts ADD COLUMN IF NOT EXISTS ip_key VARCHAR(64) NULL;
ALTER TABLE auth_login_attempts ADD COLUMN IF NOT EXISTS was_successful TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE auth_login_attempts ADD COLUMN IF NOT EXISTS attempted_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE push_devices ADD COLUMN IF NOT EXISTS user_id BIGINT UNSIGNED NULL;
ALTER TABLE push_devices ADD COLUMN IF NOT EXISTS platform ENUM('ios','android','web') NOT NULL DEFAULT 'android';
ALTER TABLE push_devices ADD COLUMN IF NOT EXISTS push_token VARCHAR(512) NULL;
ALTER TABLE push_devices ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE push_devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE user_privacy_settings ADD COLUMN IF NOT EXISTS phone_visibility ENUM('everyone','contacts','nobody') NOT NULL DEFAULT 'nobody';
ALTER TABLE user_privacy_settings ADD COLUMN IF NOT EXISTS profile_visibility ENUM('everyone','contacts','nobody') NOT NULL DEFAULT 'everyone';
ALTER TABLE user_privacy_settings ADD COLUMN IF NOT EXISTS last_seen_visibility ENUM('everyone','contacts','nobody') NOT NULL DEFAULT 'contacts';
ALTER TABLE user_privacy_settings ADD COLUMN IF NOT EXISTS group_invite_visibility ENUM('everyone','contacts','nobody') NOT NULL DEFAULT 'contacts';
ALTER TABLE user_privacy_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Fill harmless defaults for rows whose newly-added fields are empty.
UPDATE users SET username = CONCAT('user_', id) WHERE username IS NULL OR TRIM(username) = '';
UPDATE users SET display_name = COALESCE(NULLIF(TRIM(display_name), ''), username, CONCAT('User ', id)) WHERE display_name IS NULL OR TRIM(display_name) = '';
UPDATE conversations SET type = 'group' WHERE type IS NULL OR type NOT IN ('private','group','channel');
UPDATE messages SET body = '' WHERE body IS NULL;
INSERT IGNORE INTO conversation_settings (conversation_id) SELECT id FROM conversations;
INSERT IGNORE INTO user_privacy_settings (user_id) SELECT id FROM users;

SET FOREIGN_KEY_CHECKS = 1;
