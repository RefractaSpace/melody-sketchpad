// 파일 저장소(Vercel Blob) 얇은 포장 — 테스트 때는 globalThis.__MSK_STORE(메모리)로 바꿔 끼움
import { put, list, del } from '@vercel/blob';
const T = () => globalThis.__MSK_STORE;
export async function putFile(path, body, type = 'application/octet-stream') { if (T()) return T().put(path, body); return (await put(path, body, {access:'public', addRandomSuffix:true, contentType:type})).url; }
export async function listFiles(prefix) { if (T()) return T().list(prefix); const out = []; let cursor; do { const r = await list({prefix, cursor, limit:1000}); out.push(...r.blobs.map(b => ({pathname:b.pathname, url:b.url, size:b.size}))); cursor = r.hasMore ? r.cursor : null; } while (cursor); return out; }
export async function readFile(url) { if (T()) return T().read(url); const r = await fetch(url, {cache:'no-store'}); if (!r.ok) throw new Error('HTTP ' + r.status); return Buffer.from(await r.arrayBuffer()); }
export async function delFiles(urls) { if (!urls.length) return; if (T()) return T().del(urls); await del(urls); }
