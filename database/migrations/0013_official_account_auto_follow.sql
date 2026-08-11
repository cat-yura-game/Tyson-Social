-- Tyson's official account. Keep the immutable user ID here so username changes
-- cannot redirect automatic follows to another account.
INSERT INTO user_follows (follower_user_id, followed_user_id, created_at)
SELECT u.id, official.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM users u
JOIN users official ON official.id = '53cdbbfd-f1c3-491a-8f39-12c1e918a039'
WHERE u.id != official.id
ON CONFLICT(follower_user_id, followed_user_id) DO NOTHING;

CREATE TRIGGER auto_follow_tyson_official_account
AFTER INSERT ON users
FOR EACH ROW
BEGIN
  INSERT INTO user_follows (follower_user_id, followed_user_id, created_at)
  SELECT NEW.id, official.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM users official
  WHERE official.id = '53cdbbfd-f1c3-491a-8f39-12c1e918a039'
    AND NEW.id != official.id
  ON CONFLICT(follower_user_id, followed_user_id) DO NOTHING;
END;

PRAGMA optimize;
