import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { K, PID_RE, cleanName, failure, json } from '../../../lib/quiz-game';
import { cmd } from '../../../lib/quiz-redis';

// 賓客輸入暱稱加入遊戲。pid 是這支手機的私密代號，之後作答、查名次都靠它。
export const prerender = false;

const MAX_PLAYERS = 500;

export const POST: APIRoute = async ({ request }) => {
  let body: { name?: string; pid?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const name = cleanName(body.name);
  if (!name) return json({ error: '請輸入暱稱' }, 400);
  const pid = body.pid && PID_RE.test(body.pid) ? body.pid : randomUUID();

  try {
    const exists = await cmd('HEXISTS', K.players, pid);
    if (!Number(exists) && Number(await cmd('HLEN', K.players)) >= MAX_PLAYERS) {
      return json({ error: '人數已滿' }, 429);
    }
    await cmd('HSET', K.players, pid, name);
    return json({ ok: true, pid, name });
  } catch (error) {
    return failure(error, 'quiz/join');
  }
};
