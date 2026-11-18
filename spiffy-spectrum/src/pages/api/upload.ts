import type { APIRoute } from 'astro';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

// 這支程式在伺服器上執行，只負責「發上傳通行證」，
// 照片本身由賓客的手機直接傳到 Vercel Blob（不受 4.5MB 函式限制）。
export const prerender = false;

const MAX_SIZE = 25 * 1024 * 1024; // 單張上限 25MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
];

export const POST: APIRoute = async ({ request }) => {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      // 本機開發讀 import.meta.env（.env 檔），上線後讀 process.env
      token: import.meta.env.BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('guest-photos/')) {
          throw new Error('Invalid upload path');
        }
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_SIZE,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return Response.json({ error: message }, { status: 400 });
  }
};
