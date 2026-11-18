// 婚禮問答遊戲的核心邏輯（狀態、計分、排名）。
// 資料都存在 Upstash Redis（見 quiz-redis.ts），題目在 quiz-questions.ts。
import { cmd, pipe, toObj } from './quiz-redis';
import { QUESTIONS, DEFAULT_DURATION } from './quiz-questions';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';

// ---- Redis keys ----
export const K = {
  state: 'quiz:state',                      // 目前進度（hash）
  players: 'quiz:players',                  // pid -> 暱稱
  scores: 'quiz:scores',                    // pid -> 總分
  times: 'quiz:times',                      // pid -> 得分題目的累計作答毫秒（同分時，越快越前面）
  answers: (i: number) => `quiz:answers:${i}`, // pid -> "選項:作答毫秒"
};

export type RawPhase = 'lobby' | 'question' | 'reveal' | 'final';
// 對外看到的階段：question 依時間再分成 open（作答中）/ closed（時間到、看統計）
export type Phase = 'lobby' | 'open' | 'closed' | 'reveal' | 'final';

export type RawState = {
  phase: RawPhase;
  q: number;
  startedAt: number;
  endsAt: number;
  gid: string;
  scored: number;
};

export const durationOf = (q: number) => QUESTIONS[q]?.duration ?? DEFAULT_DURATION;
export const newGid = () => randomUUID().slice(0, 8);

export function parseState(o: Record<string, string>): RawState {
  const phase = (['lobby', 'question', 'reveal', 'final'] as const).find((p) => p === o.phase) ?? 'lobby';
  return {
    phase,
    q: o.q !== undefined ? Number(o.q) : -1,
    startedAt: Number(o.startedAt ?? 0),
    endsAt: Number(o.endsAt ?? 0),
    gid: o.gid || '0',
    scored: o.scored !== undefined ? Number(o.scored) : -1,
  };
}

export async function readState(): Promise<RawState> {
  return parseState(toObj(await cmd('HGETALL', K.state)));
}

export function effectivePhase(s: RawState, now = Date.now()): Phase {
  if (s.phase === 'question') return now < s.endsAt ? 'open' : 'closed';
  return s.phase;
}

export function parseAnswer(v: string | undefined): { option: number; ms: number } | null {
  if (!v) return null;
  const [o, ms] = v.split(':');
  const option = Number(o);
  if (!Number.isInteger(option)) return null;
  return { option, ms: Number(ms) || 0 };
}

// ---- 排名：分數高 → 累計作答時間短 → 同分同時間就同名次 ----
export type Row = { pid: string; name: string; score: number; ms: number; rank: number };

export function buildRanking(players: string[], scores: string[], times: string[]): Row[] {
  const P = toObj(players);
  const S = toObj(scores);
  const T = toObj(times);
  const rows: Row[] = Object.keys(P).map((pid) => ({
    pid,
    name: P[pid],
    score: Number(S[pid] ?? 0),
    ms: Number(T[pid] ?? 0),
    rank: 0,
  }));
  rows.sort(
    (a, b) => b.score - a.score || a.ms - b.ms || a.name.localeCompare(b.name, 'zh-Hant'),
  );
  let rank = 0;
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.score !== r.score || prev.ms !== r.ms) rank = i + 1;
    r.rank = rank;
  });
  return rows;
}

const publicRow = (r: Row) => ({ name: r.name, score: r.score, rank: r.rank });

// ---- 給所有人看的公開狀態（不含任何人的 pid、也不會提前洩漏答案）----
export async function buildPublicState(forHost = false) {
  const now = Date.now();
  const [stateArr, playerCount] = await pipe([['HGETALL', K.state], ['HLEN', K.players]]);
  const s = parseState(toObj(stateArr));
  const phase = effectivePhase(s, now);

  const out: Record<string, unknown> = {
    gid: s.gid,
    phase,
    total: QUESTIONS.length,
    playerCount: Number(playerCount),
  };
  if (forHost) out.now = now;

  const inQuestion = phase === 'open' || phase === 'closed' || phase === 'reveal';
  if (inQuestion && QUESTIONS[s.q]) {
    const q = QUESTIONS[s.q];
    out.q = s.q;
    out.startedAt = s.startedAt;
    out.endsAt = s.endsAt;
    out.question = {
      text: q.text,
      options: q.options,
      practice: !!q.practice,
      duration: durationOf(s.q),
    };

    if (phase === 'open') {
      out.answered = Number(await cmd('HLEN', K.answers(s.q)));
    } else {
      const cmds: (string | number)[][] = [['HGETALL', K.answers(s.q)]];
      if (phase === 'reveal') cmds.push(['HGETALL', K.players], ['HGETALL', K.scores], ['HGETALL', K.times]);
      const res = await pipe(cmds);
      const ans = toObj(res[0]);
      const counts = q.options.map(() => 0);
      let answered = 0;
      for (const v of Object.values(ans)) {
        const a = parseAnswer(v);
        if (a && counts[a.option] !== undefined) { counts[a.option]++; answered++; }
      }
      out.counts = counts;
      out.answered = answered;
      if (phase === 'reveal') {
        out.points = q.points;
        out.top = q.practice ? [] : buildRanking(res[1], res[2], res[3]).slice(0, 5).map(publicRow);
      }
    }
  }

  if (phase === 'final') {
    const [p, sc, t] = await pipe([['HGETALL', K.players], ['HGETALL', K.scores], ['HGETALL', K.times]]);
    out.top = buildRanking(p, sc, t).slice(0, 10).map(publicRow);
  }
  return out;
}

// ---- 共用小工具 ----
export function json(data: unknown, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cache },
  });
}

export function failure(error: unknown, tag: string) {
  const message = error instanceof Error ? error.message : 'error';
  console.error(`[${tag}]`, message);
  return json({ error: message }, message === 'redis not configured' ? 503 : 500);
}

export const PID_RE = /^[A-Za-z0-9-]{8,64}$/;

export function cleanName(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 12);
}

const readEnv = (key: string): string | undefined =>
  (import.meta.env as Record<string, string | undefined>)[key] ?? process.env[key];
const sha = (s: string) => createHash('sha256').update(s).digest();

// 主持人密碼：用跟相簿管理相同的 ADMIN_PASSWORD
export function isAdminReq(request: Request): boolean {
  const expected = readEnv('ADMIN_PASSWORD');
  const given = request.headers.get('x-admin-password') ?? '';
  if (!expected || !given) return false;
  return timingSafeEqual(sha(given), sha(expected));
}
