import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod/v4';
import type { RouterPluginAsyncCallback } from '../../types/serverType.js';
import type { AccessControl } from './AccessControl.ts';
const cookieName = 'xbest_session';
const cookieId = (request: FastifyRequest) =>
  request.headers.cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);

/** Process-local, opaque browser sessions. Passwords are never written to disk;
 * every authenticated request still checks current account validity. */
export class StudioWebLogin {
  private readonly sessions = new Map<
    string,
    { header: string; expires: number }
  >();
  private readonly attempts = new Map<
    string,
    { count: number; expires: number }
  >();
  constructor(private readonly access: AccessControl) {}
  restore(request: FastifyRequest) {
    if (request.headers.authorization) return;
    const id = cookieId(request);
    if (!id) return;
    if (request.headers['sec-fetch-site'] === 'cross-site') return;
    if (request.headers.origin) {
      try {
        if (new URL(request.headers.origin).host !== request.headers.host)
          return;
      } catch {
        return;
      }
    }
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.expires <= Date.now()) {
      this.sessions.delete(id);
      return;
    }
    request.headers.authorization = session.header;
  }
  unauthorized(request: FastifyRequest, reply: FastifyReply) {
    const route = request.routeOptions.url ?? '';
    if (
      (route.startsWith('/web') || route === '/') &&
      request.headers.accept?.includes('text/html')
    ) {
      const nonce = crypto.randomBytes(18).toString('base64');
      reply.header('Cache-Control', 'no-store');
      reply.header(
        'Content-Security-Policy',
        `default-src 'none'; img-src 'self'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
      );
      return reply
        .code(401)
        .type('text/html')
        .send(loginHtml(nonce, request.query));
    }
    if (cookieId(request))
      return reply
        .code(401)
        .send({ error: 'Login required', loginUrl: '/web/' });
    return reply
      .header('WWW-Authenticate', 'Basic realm="XBEST", charset="UTF-8"')
      .code(401)
      .send('Authentication required');
  }
  readonly router: RouterPluginAsyncCallback = (app) => {
    const sameOrigin = (req: FastifyRequest) => {
      if (req.headers['sec-fetch-site'] === 'cross-site') return false;
      if (!req.headers.origin) return true;
      try {
        return new URL(req.headers.origin).host === req.headers.host;
      } catch {
        return false;
      }
    };
    app.post(
      '/auth/session',
      {
        config: { authRequired: false },
        bodyLimit: 2048,
        schema: {
          body: z.object({
            username: z.string().min(1).max(80),
            password: z.string().min(1).max(256),
          }),
        },
      },
      async (req, reply) => {
        reply.header('Cache-Control', 'no-store');
        if (!sameOrigin(req)) return reply.code(403).send({ ok: false });
        const previous = this.attempts.get(req.ip),
          now = Date.now();
        if (previous && previous.expires > now && previous.count >= 10)
          return reply.code(429).send({ ok: false });
        const header = `Basic ${Buffer.from(`${req.body.username}:${req.body.password}`).toString('base64')}`;
        if (!(await this.access.authenticate(header))) {
          if (this.attempts.size >= 1000) this.attempts.clear();
          this.attempts.set(
            req.ip,
            previous && previous.expires > now
              ? { ...previous, count: previous.count + 1 }
              : { count: 1, expires: now + 60_000 },
          );
          return reply.code(401).send({ ok: false });
        }
        this.attempts.delete(req.ip);
        const old = cookieId(req);
        if (old) this.sessions.delete(old);
        if (this.sessions.size >= 1000) {
          const oldest = this.sessions.keys().next().value;
          if (oldest) this.sessions.delete(oldest);
        }
        const id = crypto.randomBytes(32).toString('hex');
        this.sessions.set(id, { header, expires: now + 8 * 60 * 60_000 });
        reply.header(
          'Set-Cookie',
          `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${req.protocol === 'https' ? '; Secure' : ''}`,
        );
        return { ok: true };
      },
    );
    app.post(
      '/auth/logout',
      { config: { authRequired: false } },
      async (req, reply) => {
        if (!sameOrigin(req)) return reply.code(403).send({ ok: false });
        const id = cookieId(req);
        if (id) this.sessions.delete(id);
        reply.header(
          'Set-Cookie',
          `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${req.protocol === 'https' ? '; Secure' : ''}`,
        );
        return reply.send({ ok: true });
      },
    );
    return Promise.resolve();
  };
}
function loginHtml(nonce: string, query: unknown) {
  const ar = !(
    query &&
    typeof query === 'object' &&
    'lang' in query &&
    query.lang === 'en'
  );
  const text = (a: string, b: string) => (ar ? a : b);
  return `<!doctype html><html lang="${ar ? 'ar' : 'en'}" dir="${ar ? 'rtl' : 'ltr'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>XBEST</title><style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0c0d12;color:#eef1f4;font-family:system-ui,Arial,sans-serif;padding:24px}main{display:grid;grid-template-columns:1fr 1fr;width:min(100%,1040px);border:1px solid #252936;border-radius:24px;overflow:hidden;background:#12141c}.identity{padding:64px 48px;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(135deg,#1a1d28,#25151e);border-inline-end:1px solid #252936}.mark{object-fit:contain;width:64px;height:64px;border-radius:16px;display:grid;place-items:center;font-size:42px;font-weight:900;}h1{font-size:38px;margin:36px 0 16px;line-height:1.45}p{line-height:1.9;color:#9aa3ae}.brand{letter-spacing:3px;font-size:12px;font-weight:800;color:#f02c45}.form{padding:64px 48px}h2{font-size:25px;margin:0 0 12px}label{display:block;font-size:13px;margin:24px 0 8px}input{width:100%;border:1px solid #303646;background:#0c0d12;border-radius:10px;padding:14px;color:white;font:inherit;outline:none}input:focus{border-color:#f02c45;box-shadow:0 0 0 3px #f02c4520}button{width:100%;padding:14px;background:#f02c45;color:#fff;border:0;border-radius:10px;font:inherit;font-weight:700;margin-top:28px;cursor:pointer}button:disabled{opacity:.6;cursor:wait}#error{color:#ff9b8f;font-size:13px;min-height:24px;margin-top:16px}a{color:#9aa3ae;font-size:12px}footer{margin-top:40px;font-size:10px;color:#6b7280}@media(max-width:700px){main{grid-template-columns:1fr}.identity{padding:28px;gap:12px;border-inline-end:0;border-bottom:1px solid #252936}.identity p{display:none}h1{font-size:25px;margin:16px 0 0}.mark{width:42px;height:42px;font-size:28px}.form{padding:28px}footer{margin-top:24px}}
</style><main><section class="identity"><div><img class="mark" src="/favicon.svg" alt="XBEST"><h1>${text('مساحتك الخاصة<br>لصناعة البث.', 'Your own space.<br>Your broadcast.')}</h1><p>${text('تحكّم في قنواتك ومحتواك من استوديو صُممت واجهته لإكس بيست.', 'Manage channels and content from your XBEST studio workspace.')}</p></div><div class="brand" dir="ltr">XBEST CHANNELS STUDIO</div></section><section class="form"><h2>${text('أهلًا بعودتك', 'Welcome back')}</h2><p>${text('سجّل دخولك لفتح الاستوديو', 'Sign in to open your studio')}</p><form id="login"><label for="username">${text('اسم المستخدم', 'Username')}</label><input id="username" name="username" autocomplete="username" required maxlength="80"><label for="password">${text('كلمة السر', 'Password')}</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button id="submit">${text('دخول الاستوديو', 'Open studio')}</button><div id="error" role="alert" aria-live="polite"></div></form><a href="?lang=${ar ? 'en' : 'ar'}">${ar ? 'English' : 'العربية'}</a><footer>XBEST / PRIVATE STUDIO ACCESS</footer></section></main><script nonce="${nonce}">document.getElementById('login').addEventListener('submit',async e=>{e.preventDefault();const button=document.getElementById('submit'),error=document.getElementById('error');button.disabled=true;error.textContent='';try{const result=await fetch('/auth/session',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({username:document.getElementById('username').value,password:document.getElementById('password').value})});if(result.ok){location.reload();return;}error.textContent=${JSON.stringify(text('تعذر الدخول. راجع البيانات والاتصال، أو انتظر دقيقة لو كررت المحاولة.', 'Sign-in failed. Check credentials and connectivity, or wait a minute after repeated attempts.'))};}catch{error.textContent=${JSON.stringify(text('تعذر الاتصال بالسيرفر.', 'Could not reach the server.'))};}finally{button.disabled=false;}});</script></html>`;
}
