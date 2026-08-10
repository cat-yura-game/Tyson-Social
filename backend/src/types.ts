export interface Env {
  DB: D1Database;
  MEDIA: KVNamespace;
  APP_ENV: 'development' | 'production' | 'test';
  ALLOWED_ORIGINS: string;
  SESSION_SECRET?: string;
  EMAIL_PROVIDER_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODERATION_MODEL: string;
  GEMINI_SUMMARY_MODEL: string;
}

export interface AppVariables {
  requestId: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}
