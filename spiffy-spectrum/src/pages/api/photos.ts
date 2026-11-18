import type { APIRoute } from 'astro';
import { list } from '@vercel/blob';

// 列出所有賓客上傳的照片（新的在前面）
export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const photos: { url: string; downloadUrl: string; uploadedAt: string }[] = [];
    let cursor: string | undefined;
    const token = import.meta.env.BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;

    do {
      const page = await list({ prefix: 'guest-photos/', limit: 1000, cursor, token });
      for (const blob of page.blobs) {
        photos.push({
          url: blob.url,
          downloadUrl: blob.downloadUrl,
          uploadedAt: new Date(blob.uploadedAt).toISOString(),
        });
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    photos.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

    return new Response(JSON.stringify({ photos }), {
      headers: {
        'Content-Type': 'application/json',
        // 讓 CDN 快取 20 秒，避免大家狂刷新時用掉 Blob 的讀取額度
        'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=60',
      },
    });
  } catch {
    return Response.json({ photos: [], error: 'Unable to load photos' }, { status: 500 });
  }
};
