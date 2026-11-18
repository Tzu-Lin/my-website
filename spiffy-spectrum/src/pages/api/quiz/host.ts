import type { APIRoute } from 'astro';
import {
  K, durationOf, effectivePhase, failure, isAdminReq, json, newGid, parseAnswer, parseState,
} from '../../../lib/quiz-game';
import { QUESTIONS } from '../../../lib/quiz-questions';
import { cmd, pipe, toObj } from '../../../lib/quiz-redis';

// 主持人控制：需要 ADMIN_PASSWORD。
//   verify   確認密碼
//   start    開始第 1 題
//   closeNow 提前結束作答
//   reveal   公布答案（同時結算這題的分數）
//   next     下一題（最後一題之後進入排行榜）
//   reset    清空所有人、分數，回到等待加入
export const prerender = false;

const openQuestion = (q: number, now: number): (string | number)[] => [
  'HSET', K.state,
  'phase', 'question',
  'q', q,
  'startedAt', now,
  'endsAt', now + durationOf(q) * 1000,
];

export const POST: APIRoute = async ({ request }) => {
  if (!isAdminReq(request)) return json({ error: 'Unauthorized' }, 401);

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  try {
    const action = body.action;
    if (action === 'verify') return json({ ok: true });

    const now = Date.now();

    if (action === 'reset') {
      const keys = [K.state, K.players, K.scores, K.times, ...QUESTIONS.map((_, i) => K.answers(i))];
      await pipe([
        ['DEL', ...keys],
        ['HSET', K.state, 'phase', 'lobby', 'q', -1, 'startedAt', 0, 'endsAt', 0, 'scored', -1, 'gid', newGid()],
      ]);
      return json({ ok: true });
    }

    const s = parseState(toObj(await cmd('HGETALL', K.state)));
    const phase = effectivePhase(s, now);

    if (action === 'start') {
      if (phase !== 'lobby') return json({ error: '遊戲已經開始了' }, 409);
      await pipe([
        openQuestion(0, now),
        ['HSET', K.state, 'scored', -1],
        ['HSETNX', K.state, 'gid', newGid()],
      ]);
      return json({ ok: true });
    }

    if (action === 'closeNow') {
      if (phase !== 'open') return json({ error: '現在不在作答中' }, 409);
      await cmd('HSET', K.state, 'endsAt', now);
      return json({ ok: true });
    }

    if (action === 'reveal') {
      if (phase !== 'open' && phase !== 'closed') return json({ error: '現在不能公布答案' }, 409);
      const question = QUESTIONS[s.q];
      const cmds: (string | number)[][] = [];

      if (!question.practice && s.scored !== s.q) {
        const answers = toObj(await cmd('HGETALL', K.answers(s.q)));
        for (const [pid, raw] of Object.entries(answers)) {
          const a = parseAnswer(raw);
          if (!a) continue;
          const pts = question.points[a.option] ?? 0;
          cmds.push(['HINCRBYFLOAT', K.scores, pid, pts]);
          if (pts > 0) cmds.push(['HINCRBY', K.times, pid, a.ms]);
        }
      }
      cmds.push(['HSET', K.state, 'phase', 'reveal', 'scored', s.q, 'endsAt', Math.min(s.endsAt, now)]);
      await pipe(cmds);
      return json({ ok: true });
    }

    if (action === 'next') {
      if (phase !== 'reveal') return json({ error: '請先公布答案' }, 409);
      if (s.q + 1 < QUESTIONS.length) await cmd(...openQuestion(s.q + 1, now));
      else await cmd('HSET', K.state, 'phase', 'final');
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    return failure(error, 'quiz/host');
  }
};
