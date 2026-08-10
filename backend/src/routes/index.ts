import { Hono } from 'hono';
import type { AppVariables, Env } from '../types';
import { healthRoutes } from './health';

export const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();

api.route('/health', healthRoutes);
