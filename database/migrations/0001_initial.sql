PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  username TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_key TEXT,
  bio TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending_email' CHECK (status IN ('pending_email', 'active', 'limited', 'suspended', 'deleted')),
  email_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_status_created ON users(status, created_at DESC);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip_hash TEXT,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked_at TEXT
);
CREATE INDEX idx_sessions_user_active ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE email_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  consumed_at TEXT
);
CREATE INDEX idx_email_verifications_user ON email_verifications(user_id, expires_at);

CREATE TABLE password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  consumed_at TEXT
);
CREATE INDEX idx_password_resets_user ON password_resets(user_id, expires_at);

CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  locale TEXT NOT NULL DEFAULT 'ru',
  email_notifications INTEGER NOT NULL DEFAULT 1 CHECK (email_notifications IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  avatar_key TEXT,
  website_url TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected', 'revoked')),
  verified_at TEXT,
  verified_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX idx_companies_slug ON companies(slug);
CREATE INDEX idx_companies_owner ON companies(owner_user_id);
CREATE INDEX idx_companies_verification ON companies(verification_status, created_at);

CREATE TABLE company_requests (
  id TEXT PRIMARY KEY,
  applicant_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  requested_name TEXT NOT NULL,
  evidence TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note TEXT,
  reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_company_requests_status ON company_requests(status, created_at);
CREATE INDEX idx_company_requests_applicant ON company_requests(applicant_user_id, created_at DESC);
CREATE UNIQUE INDEX idx_company_requests_one_pending ON company_requests(applicant_user_id) WHERE status = 'pending';

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  author_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  author_company_id TEXT REFERENCES companies(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'review', 'published', 'blocked', 'deleted')),
  like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  comment_count INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((author_user_id IS NOT NULL) != (author_company_id IS NOT NULL))
);
CREATE INDEX idx_posts_feed ON posts(status, published_at DESC);
CREATE INDEX idx_posts_user ON posts(author_user_id, created_at DESC);
CREATE INDEX idx_posts_company ON posts(author_company_id, created_at DESC);

CREATE TABLE post_media (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image')),
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  width INTEGER CHECK (width > 0),
  height INTEGER CHECK (height > 0),
  alt_text TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(post_id, sort_order)
);
CREATE INDEX idx_post_media_post ON post_media(post_id, sort_order);

CREATE TABLE post_reactions (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX idx_post_reactions_user_signal ON post_reactions(user_id, reaction, updated_at DESC);
CREATE INDEX idx_post_reactions_post_likes ON post_reactions(post_id) WHERE reaction = 'like';

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  parent_comment_id TEXT REFERENCES comments(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('review', 'published', 'blocked', 'deleted')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_comments_post ON comments(post_id, status, created_at);
CREATE INDEX idx_comments_author ON comments(author_user_id, created_at DESC);
CREATE INDEX idx_comments_parent ON comments(parent_comment_id, created_at);

CREATE TABLE moderation_results (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('post', 'comment', 'post_media', 'profile')),
  subject_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'review', 'block')),
  risk_score REAL NOT NULL CHECK (risk_score >= 0 AND risk_score <= 1),
  categories_json TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_moderation_subject ON moderation_results(subject_type, subject_id, created_at DESC);
CREATE INDEX idx_moderation_review ON moderation_results(decision, created_at) WHERE decision = 'review';

CREATE TABLE security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  action TEXT NOT NULL CHECK (action IN ('observe', 'challenge', 'limit', 'review', 'block_request')),
  risk_score REAL CHECK (risk_score >= 0 AND risk_score <= 1),
  ip_hash TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  resolved_at TEXT,
  resolved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_security_events_queue ON security_events(resolved_at, severity, created_at DESC);
CREATE INDEX idx_security_events_user ON security_events(user_id, created_at DESC);

CREATE TABLE ai_summaries (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  summary TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(post_id, content_hash)
);
CREATE INDEX idx_ai_summaries_post ON ai_summaries(post_id, created_at DESC);

CREATE TABLE recommendation_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'open', 'like', 'dislike', 'comment')),
  dwell_ms INTEGER CHECK (dwell_ms IS NULL OR dwell_ms >= 0),
  context_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_recommendation_user_events ON recommendation_events(user_id, created_at DESC);
CREATE INDEX idx_recommendation_post_events ON recommendation_events(post_id, event_type, created_at DESC);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct', 'group')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  left_at TEXT,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_conversation_members_user ON conversation_members(user_id, left_at, joined_at DESC);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  identity_public_key TEXT NOT NULL,
  key_algorithm TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_devices_user_active ON devices(user_id, revoked_at, last_seen_at DESC);

CREATE TABLE public_keys (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  key_type TEXT NOT NULL CHECK (key_type IN ('signed_prekey', 'one_time_prekey')),
  public_key TEXT NOT NULL,
  signature TEXT,
  key_version INTEGER NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(device_id, key_type, key_version)
);
CREATE INDEX idx_public_keys_available ON public_keys(device_id, key_type, consumed_at);

CREATE TABLE encrypted_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  sender_device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  recipient_device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  ciphertext TEXT NOT NULL,
  envelope_version INTEGER NOT NULL,
  client_message_id TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  received_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(sender_device_id, client_message_id)
);
CREATE INDEX idx_encrypted_messages_delivery ON encrypted_messages(recipient_device_id, received_at, created_at);
CREATE INDEX idx_encrypted_messages_conversation ON encrypted_messages(conversation_id, created_at);

PRAGMA optimize;
