CREATE TABLE permanent_task_rewards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, task_key)
);
