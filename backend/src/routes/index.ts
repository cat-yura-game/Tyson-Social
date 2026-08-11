import { Hono } from 'hono';
import type { AppVariables, Env } from '../types';
import { healthRoutes } from './health';
import { authRoutes } from './auth';
import { userRoutes } from './users';

export const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();

api.route('/health', healthRoutes);
api.route('/auth', authRoutes);
api.route('/users', userRoutes);
