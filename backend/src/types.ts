export interface Env {
  DB: D1Database;
  MEDIA: KVNamespace;
  APP_ENV: 'development' | 'production' | 'test';
  ALLOWED_ORIGINS: string;
  SESSION_SECRET?: string;
  EMAIL_PROVIDER_API_KEY?: string;
  EMAIL_DELIVERY_MODE: 'disabled' | 'provider';
  MODERATION_MODE: 'gemini' | 'bypass';
  GEMINI_API_KEY?: string;
  GEMINI_MODERATION_MODEL: string;
  GEMINI_SUMMARY_MODEL: string;
}

export interface AppVariables {
  requestId: string;
  authUser: AuthUser | null;
  sessionId: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  bio: string;
  role: 'user' | 'moderator' | 'admin';
  status: 'pending_email' | 'active' | 'limited' | 'suspended' | 'deleted';
  emailVerified: boolean;
  verified: boolean;
  createdAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}
