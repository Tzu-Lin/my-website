import type { APIRoute } from 'astro';
import { buildPublicState, failure, json } from '../../../lib/quiz-game';

// 所有賓客每 1~2 秒會來問一次目前進度。
// 內容對每個人都一樣，所以讓 CDN 快取 1 秒：就算 100 人同時問，資料庫一秒也只會被查一次。
// 主持人頁會帶 ?t=時間 來略過快取，才能即時看到自己按下的結果。
export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const bypass = url.searchParams.has('t');
    const state = await buildPublicState(bypass);
    return json(state, 200, bypass ? 'no-store' : 'public, s-maxage=1');
  } catch (error) {
    return failure(error, 'quiz/state');
  }
};
