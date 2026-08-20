import { Hono } from 'hono';
import type { AppVariables, Env } from '../types';
import { healthRoutes } from './health';
import { authRoutes } from './auth';
import { userRoutes } from './users';
import { contentRoutes } from './content';
import { mediaRoutes } from './media';
import { messageRoutes } from './messages';
import { telegramAuthRoutes } from './telegram-auth';
import { storyRoutes } from './stories';
import { aiChatRoutes } from './ai-chat';
import { adminRoutes } from './admin';
import { giftRoutes } from './gifts';

export const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();

api.route('/health', healthRoutes);
api.route('/auth/telegram', telegramAuthRoutes);
api.route('/auth', authRoutes);
api.route('/users', userRoutes);
api.route('/', contentRoutes);
api.route('/media', mediaRoutes);
api.route('/messages', messageRoutes);
api.route('/stories', storyRoutes);
api.route('/ai', aiChatRoutes);
api.route('/admin', adminRoutes);
api.route('/', giftRoutes);
