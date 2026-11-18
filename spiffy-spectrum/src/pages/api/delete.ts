import type { APIRoute } from 'astro';
import { del, list } from '@vercel/blob';
import { createHash } from 'node:crypto';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  // 本機開發（.env）用 import.meta.env，部署到 Vercel 用 process.env
  const adminPw = import.meta.env.ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
  const token = import.meta.env.BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;
  const isAdmin = !!adminPw && body.adminPassword === adminPw;

  // 檢查管理密碼
  if (body.mode === 'check') return json({ admin: isAdmin });

  // 刪除全部（只有管理員）
  if (body.mode === 'all') {
    if (!isAdmin) return json({ error: 'forbidden' }, 403);
    let cursor: string | undefined;
    do {
      const r = await list({ prefix: 'guest-photos/', cursor, limit: 1000, token });
      if (r.blobs.length) await del(r.blobs.map((b) => b.url), { token });
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    return json({ ok: true });
  }

  // 刪除單張（管理員 或 照片擁有者）
  if (body.mode === 'one') {
    let pathname = '';
    try {
      const u = new URL(String(body.url));
      if (!u.hostname.endsWith('.blob.vercel-storage.com')) throw new Error('bad host');
      pathname = decodeURIComponent(u.pathname.replace(/^\//, ''));
    } catch {
      return json({ error: 'bad url' }, 400);
    }
    if (!pathname.startsWith('guest-photos/')) return json({ error: 'bad path' }, 400);

    if (!isAdmin) {
      const secret = String(body.secret || '');
      if (secret.length < 16) return json({ error: 'forbidden' }, 403);
      const owner = createHash('sha256').update(secret).digest('hex').slice(0, 16);
      if (!pathname.startsWith('guest-photos/' + owner + '/')) {
        return json({ error: 'forbidden' }, 403);
      }
    }

    await del(String(body.url), { token });
    return json({ ok: true });
  }

  // 批次刪除（勾選）：管理員可刪任何照片；一般賓客只能刪自己的
  if (body.mode === 'many') {
    const urls: string[] = Array.isArray(body.urls) ? body.urls.slice(0, 100).map(String) : [];
    if (!urls.length) return json({ error: 'bad request' }, 400);

    let owner = '';
    if (!isAdmin) {
      const secret = String(body.secret || '');
      if (secret.length < 16) return json({ error: 'forbidden' }, 403);
      owner = createHash('sha256').update(secret).digest('hex').slice(0, 16);
    }

    for (const url of urls) {
      let pathname = '';
      try {
        const u = new URL(url);
        if (!u.hostname.endsWith('.blob.vercel-storage.com')) throw new Error('bad host');
        pathname = decodeURIComponent(u.pathname.replace(/^\//, ''));
      } catch {
        return json({ error: 'bad url' }, 400);
      }
      if (!pathname.startsWith('guest-photos/')) return json({ error: 'bad path' }, 400);
      if (!isAdmin && !pathname.startsWith('guest-photos/' + owner + '/')) {
        return json({ error: 'forbidden' }, 403);
      }
    }

    await del(urls, { token });
    return json({ ok: true, deleted: urls.length });
  }

  return json({ error: 'bad request' }, 400);
};