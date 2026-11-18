// 用 Upstash Redis 的 REST API 存遊戲狀態（不需要安裝任何套件）
// Vercel 連接 Upstash 後會自動提供 KV_REST_API_URL / KV_REST_API_TOKEN
// （也相容 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN）

const URL_ =
  import.meta.env.KV_REST_API_URL ??
  import.meta.env.UPSTASH_REDIS_REST_URL ??
  process.env.KV_REST_API_URL ??
  process.env.UPSTASH_REDIS_REST_URL;

const TOKEN =
  import.meta.env.KV_REST_API_TOKEN ??
  import.meta.env.UPSTASH_REDIS_REST_TOKEN ??
  process.env.KV_REST_API_TOKEN ??
  process.env.UPSTASH_REDIS_REST_TOKEN;

type Arg = string | number;

export async function pipe(cmds: Arg[][]): Promise<any[]> {
  if (!URL_ || !TOKEN) throw new Error('redis not configured');
  const res = await fetch(URL_ + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!res.ok) throw new Error('redis http ' + res.status);
  const out = await res.json();
  return out.map((r: any) => {
    if (r.error) throw new Error(r.error);
    return r.result;
  });
}

export async function cmd(...args: Arg[]): Promise<any> {
  return (await pipe([args]))[0];
}

// HGETALL 回傳 [field, value, field, value...]，轉成物件
export function toObj(arr: string[] | null | undefined): Record<string, string> {
  const o: Record<string, string> = {};
  if (!arr) return o;
  for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
  return o;
}
