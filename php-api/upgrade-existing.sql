-- Run only if the existing prototype tables already exist.
-- Check each column first in phpMyAdmin > Structure.
-- If a column already exists, skip that ALTER statement.

ALTER TABLE users
    ADD COLUMN birth_calendar ENUM('solar_hijri', 'gregorian') NULL AFTER birth_year;

ALTER TABLE conversations
    ADD COLUMN description VARCHAR(280) NULL AFTER title;

ALTER TABLE conversations
    ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE messages
    ADD COLUMN edited_at TIMESTAMP NULL AFTER created_at;

ALTER TABLE messages
    ADD COLUMN deleted_at TIMESTAMP NULL AFTER edited_at;

-- This index is optional if a similar index already exists.
CREATE INDEX idx_api_tokens_expiry ON api_tokens (expires_at);
