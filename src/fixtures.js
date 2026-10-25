import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

/** Every URL is mapped only to its path under root. Never falls back to the network. */
export function fixtureFetch(root) {
  const base = resolve(root);
  return async input => {
    let target;
    try {
      const path = decodeURIComponent(new URL(String(input)).pathname);
      target = resolve(base, `.${path}`);
      if (target !== base && !target.startsWith(base + sep)) return new Response('', {status:404});
      const bytes = await readFile(target);
      return new Response(bytes, {status:200,headers:{'content-type':'application/json'}});
    } catch { return new Response('', {status:404}); }
  };
}
