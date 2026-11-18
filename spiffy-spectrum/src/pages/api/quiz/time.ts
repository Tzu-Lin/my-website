import type { APIRoute } from 'astro';
import { json } from '../../../lib/quiz-game';

// 讓手機校正和伺服器之間的時間差，倒數才會準（不碰資料庫）
export const prerender = false;

export const GET: APIRoute = async () => json({ now: Date.now() });
