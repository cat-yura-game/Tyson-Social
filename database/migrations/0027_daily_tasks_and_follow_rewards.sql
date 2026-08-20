CREATE TABLE daily_task_completions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL,
  task_day TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, task_key, task_day)
);

CREATE TABLE daily_task_rewards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL,
  task_day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, task_key, task_day)
);

CREATE TABLE follow_reward_claims (
  follower_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rewarded_at TEXT NOT NULL,
  PRIMARY KEY (follower_user_id, followed_user_id)
);

CREATE INDEX idx_daily_task_completions_user_day ON daily_task_completions(user_id, task_day);
