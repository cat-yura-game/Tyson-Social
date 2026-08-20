ALTER TABLE user_settings ADD COLUMN power_saving_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (power_saving_enabled IN (0, 1));
ALTER TABLE user_settings ADD COLUMN block_images_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (block_images_enabled IN (0, 1));
