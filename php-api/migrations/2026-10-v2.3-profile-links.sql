-- V2.3 profile links migration for an existing MariaDB database.
-- Run once in phpMyAdmin against the VATANMSG database.
-- If a column already exists, skip that individual ALTER statement.

ALTER TABLE users ADD COLUMN website_url VARCHAR(255) NULL AFTER birth_calendar;
ALTER TABLE users ADD COLUMN instagram_url VARCHAR(255) NULL AFTER website_url;
ALTER TABLE users ADD COLUMN telegram_url VARCHAR(255) NULL AFTER instagram_url;
ALTER TABLE users ADD COLUMN youtube_url VARCHAR(255) NULL AFTER telegram_url;
