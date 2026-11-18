import type { APIRoute } from 'astro';
import { K, PID_RE, failure, json, parseState } from '../../../lib/quiz-game';
import { QUESTIONS } from '../../../lib/quiz-questions';
import { cmd, pipe, toObj } from '../../../lib/quiz-redis';

// 作答：每個人每題只能選一次（第一次點的就算數），伺服器用自己的時間判斷有沒有超時。
export const prerender = false;

const GRACE_MS = 1500; // 給網路延遲一點寬限

export const POST: APIRoute = async ({ request }) => {
  let body: { pid?: string; q?: number; option?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const pid = String(body.pid ?? '');
  const q = Number(body.q);
  const option = Number(body.option);
  if (!PID_RE.test(pid) || !Number.isInteger(q) || !Number.isInteger(option)) {
    return json({ error: 'Invalid request' }, 400);
  }

  try {
    const now = Date.now();
    const [stateArr, isPlayer] = await pipe([['HGETALL', K.state], ['HEXISTS', K.players, pid]]);
    const s = parseState(toObj(stateArr));

    if (!Number(isPlayer)) return json({ error: 'not joined' }, 404);
    if (s.phase !== 'question' || s.q !== q || now > s.endsAt + GRACE_MS) {
      return json({ error: 'closed' }, 409);
    }
    const question = QUESTIONS[q];
    if (!question || option < 0 || option >= question.options.length) {
      return json({ error: 'Invalid option' }, 400);
    }

    const elapsed = Math.max(0, now - s.startedAt);
    const first = await cmd('HSETNX', K.answers(q), pid, `${option}:${elapsed}`);
    if (Number(first) === 1) return json({ ok: true, option });

    // 已經答過了：回傳他原本選的
    const prev = String((await cmd('HGET', K.answers(q), pid)) ?? '').split(':')[0];
    return json({ ok: false, already: true, option: Number(prev) });
  } catch (error) {
    return failure(error, 'quiz/answer');
  }
};
