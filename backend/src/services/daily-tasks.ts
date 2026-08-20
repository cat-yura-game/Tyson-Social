import type { Env } from '../types';

export const DAILY_TASKS = ['post', 'story', 'comment'] as const;
export type DailyTaskKey = typeof DAILY_TASKS[number];

export function utcTaskDay(now = new Date()): string { return now.toISOString().slice(0, 10); }

export async function completeDailyTask(env: Env, userId: string, taskKey: DailyTaskKey): Promise<void> {
  await env.DB.prepare(`INSERT OR IGNORE INTO daily_task_completions (user_id, task_key, task_day, completed_at) VALUES (?, ?, ?, ?)`)
    .bind(userId, taskKey, utcTaskDay(), new Date().toISOString()).run();
}
