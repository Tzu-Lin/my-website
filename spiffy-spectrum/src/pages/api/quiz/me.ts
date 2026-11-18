import type { APIRoute } from 'astro';
import { K, PID_RE, buildRanking, failure, json, parseAnswer, parseState } from '../../../lib/quiz-game';
import { pipe, toObj } from '../../../lib/quiz-redis';

// 查「我自己」的資料：是否已加入、這題選了什麼、目前總分和名次。
// 賓客只在剛打開頁面、或公布答案/結束時才會來問一次。
export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const pid = url.searchParams.get('pid') ?? '';
  if (!PID_RE.test(pid)) return json({ joined: false });

  try {
    const [name, stateArr] = await pipe([['HGET', K.players, pid], ['HGETALL', K.state]]);
    if (!name) return json({ joined: false });
    const s = parseState(toObj(stateArr));

    const cmds: (string | number)[][] = [
      ['HGETALL', K.players],
      ['HGETALL', K.scores],
      ['HGETALL', K.times],
    ];
    if (s.q >= 0) cmds.push(['HGET', K.answers(s.q), pid]);
    const res = await pipe(cmds);

    const rows = buildRanking(res[0], res[1], res[2]);
    const mine = rows.find((r) => r.pid === pid);
    const answer = s.q >= 0 ? parseAnswer(res[3] ?? undefined) : null;

    return json({
      joined: true,
      name,
      gid: s.gid,
      score: mine?.score ?? 0,
      rank: mine?.rank ?? rows.length,
      playerCount: rows.length,
      q: s.q,
      answer: answer ? answer.option : null,
    });
  } catch (error) {
    return failure(error, 'quiz/me');
  }
};
