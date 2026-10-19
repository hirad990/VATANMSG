-- VATANMSG 2.1.0 channel identifiers.
-- Back up the database before running this migration in phpMyAdmin.
-- Channel IDs are optional, unique, and can be changed by channel owners/admins.
ALTER TABLE conversations
  ADD COLUMN channel_id VARCHAR(32) NULL,
  ADD UNIQUE KEY uq_conversations_channel_id (channel_id);
