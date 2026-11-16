import type { onRequestAsyncHookHandler } from 'fastify';
import { Mutex } from 'async-mutex';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod/v4';
import type { BasicAuthConfig } from '../../util/basicAuth.ts';
import { validateBasicAuth } from '../../util/basicAuth.ts';

const scrypt = promisify(crypto.scrypt);
export const UserInput = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[^:\s]+$/u),
  password: z.string().min(12).max(256),
  installation: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export const LicenseInput = z.object({
  customer: z.string().trim().min(1).max(120),
  installation: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.iso.datetime(),
  validation: z.enum(['online', 'offline']).optional(),
});
const License = LicenseInput.extend({
  id: z.uuid(),
  issuedAt: z.iso.datetime(),
});
const User = z.object({
  username: UserInput.shape.username,
  installation: UserInput.shape.installation,
  salt: z.string(),
  hash: z.string(),
  enabled: z.boolean(),
});
const State = z.object({
  version: z.literal(1),
  installationId: z.uuid(),
  users: z.array(User),
  licenses: z.array(z.object({ payload: License, enabled: z.boolean() })),
  activation: z.string().optional(),
});
type StateData = z.infer<typeof State>;
export type LicenseData = z.infer<typeof License>;
export interface AccessOptions {
  directory: string;
  owner?: BasicAuthConfig;
  issuer?: boolean;
  publicKeyFile?: string;
  licenseServer?: string;
}

/** Private keys live only on the owner's issuer installation, never in a build. */
export class AccessControl {
  private readonly mutex = new Mutex();
  private state: StateData;
  private privateKey?: string;
  private publicKey?: string;
  private validUntil = 0;
  private licenseCheck?: Promise<boolean>;
  private authActive = 0;
  private readonly authCache = new Map<string, number>();
  private readonly remoteAuthCache = new Map<string, number>();
  private readonly remoteAuthPending = new Map<string, Promise<boolean>>();
  private readonly authPending = new Map<string, Promise<boolean>>();
  private constructor(
    readonly options: AccessOptions,
    state: StateData,
    readonly installation: string,
  ) {
    this.state = state;
  }

  static async open(options: AccessOptions) {
    const dir = path.join(options.directory, 'access');
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    let state: StateData;
    try {
      state = State.parse(
        JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8')),
      );
    } catch (e) {
      if (!(e instanceof Error) || !('code' in e) || e.code !== 'ENOENT')
        throw e;
      state = {
        version: 1,
        installationId: crypto.randomUUID(),
        users: [],
        licenses: [],
      };
    }
    let machine = os.hostname();
    try {
      machine += await fs.readFile('/etc/machine-id', 'utf8');
    } catch {
      /* Windows: hostname plus installation ID. */
    }
    const instance = new AccessControl(
      options,
      state,
      crypto
        .createHash('sha256')
        .update(`${state.installationId}:${machine}`)
        .digest('hex'),
    );
    if (options.issuer) {
      if (!options.owner)
        throw new Error('License issuer requires owner login credentials');
      const keyFile = path.join(dir, 'issuer.private.pem');
      try {
        instance.privateKey = await fs.readFile(keyFile, 'utf8');
      } catch (e) {
        if (!(e instanceof Error) || !('code' in e) || e.code !== 'ENOENT')
          throw e;
        const keys = crypto.generateKeyPairSync('ed25519');
        instance.privateKey = keys.privateKey
          .export({ type: 'pkcs8', format: 'pem' })
          .toString();
        await fs.writeFile(keyFile, instance.privateKey, {
          flag: 'wx',
          mode: 0o600,
        });
      }
      instance.publicKey = crypto
        .createPublicKey(instance.privateKey)
        .export({ type: 'spki', format: 'pem' })
        .toString();
    } else if (options.publicKeyFile) {
      instance.publicKey = await fs.readFile(options.publicKeyFile, 'utf8');
      const url = options.licenseServer
        ? new URL(options.licenseServer)
        : undefined;
      if (
        url &&
        url.protocol !== 'https:' &&
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ) {
        throw new Error('License server must use HTTPS');
      }
    }
    await instance.persist(state);
    return instance;
  }
  private async persist(next: StateData) {
    const file = path.join(this.options.directory, 'access', 'state.json');
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, JSON.stringify(next), { mode: 0o600 });
      await fs.rename(temp, file);
      this.state = next;
      this.authCache.clear();
      this.remoteAuthCache.clear();
    } finally {
      await fs.rm(temp, { force: true });
    }
  }
  isOwner(header?: string) {
    const owner = this.options.owner;
    return !!owner && validateBasicAuth(header, owner.username, owner.password);
  }
  async authenticate(
    header?: string,
    installation = this.installation,
  ): Promise<boolean> {
    if (installation === this.installation && this.isOwner(header)) return true;
    if (
      !this.options.owner ||
      !header?.startsWith('Basic ') ||
      header.length > 2048
    )
      return false;
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon < 0) return false;
    const user = this.state.users.find(
      (u) =>
        u.username === decoded.slice(0, colon) &&
        u.enabled &&
        (u.installation ?? this.installation) === installation,
    );
    if (!user)
      return installation === this.installation
        ? this.remoteAuthenticate(header)
        : false;
    const key = crypto
      .createHash('sha256')
      .update(`${installation}:${header}`)
      .digest('hex');
    if ((this.authCache.get(key) ?? 0) > Date.now()) return true;
    const pending = this.authPending.get(key);
    if (pending) return pending;
    if (this.authActive >= 8) return false;
    const work = async () => {
      this.authActive++;
      try {
        const hash = (await scrypt(
          decoded.slice(colon + 1),
          user.salt,
          64,
        )) as Buffer;
        const expected = Buffer.from(user.hash, 'hex');
        const ok =
          expected.length === hash.length &&
          crypto.timingSafeEqual(hash, expected);
        if (
          !ok ||
          !this.state.users.some(
            (u) =>
              u.username === user.username && u.enabled && u.hash === user.hash,
          )
        )
          return false;
        if (this.authCache.size >= 256) this.authCache.clear();
        this.authCache.set(key, Date.now() + 30_000);
        return true;
      } finally {
        this.authActive--;
      }
    };
    const result = work().finally(() => {
      this.authPending.delete(key);
    });
    this.authPending.set(key, result);
    return result;
  }
  users() {
    return this.state.users.map(({ username, enabled, installation }) => ({
      username,
      enabled,
      ...(installation ? { installation } : {}),
    }));
  }
  async addUser(input: z.infer<typeof UserInput>) {
    const { username, password, installation } = UserInput.parse(input);
    if (installation && !this.options.issuer)
      throw new Error('Remote users must be created on the issuer');
    return this.mutex.runExclusive(async () => {
      if (
        username === this.options.owner?.username ||
        this.state.users.some((u) => u.username === username)
      )
        throw new Error('Username already exists');
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = ((await scrypt(password, salt, 64)) as Buffer).toString(
        'hex',
      );
      await this.persist({
        ...this.state,
        users: [
          ...this.state.users,
          {
            username,
            salt,
            hash,
            enabled: true,
            ...(installation ? { installation } : {}),
          },
        ],
      });
    });
  }
  async changeUser(username: string, enabled?: boolean) {
    return this.mutex.runExclusive(async () => {
      if (!this.state.users.some((u) => u.username === username))
        throw new Error('User not found');
      const users =
        enabled === undefined
          ? this.state.users.filter((u) => u.username !== username)
          : this.state.users.map((u) =>
              u.username === username ? { ...u, enabled } : u,
            );
      await this.persist({ ...this.state, users });
    });
  }
  licenses() {
    return this.state.licenses;
  }
  issuerPublicKey() {
    return this.options.issuer ? this.publicKey : undefined;
  }
  async issue(input: z.infer<typeof LicenseInput>) {
    const parsed = LicenseInput.parse(input);
    if (!this.privateKey || Date.parse(parsed.expiresAt) <= Date.now())
      throw new Error('Issuer unavailable or expiry must be in the future');
    const payload = {
      ...parsed,
      id: crypto.randomUUID(),
      issuedAt: new Date().toISOString(),
    };
    await this.mutex.runExclusive(() =>
      this.persist({
        ...this.state,
        licenses: [...this.state.licenses, { payload, enabled: true }],
      }),
    );
    return { payload, token: this.sign(payload) };
  }
  private sign(payload: LicenseData) {
    if (!this.privateKey) throw new Error('Issuer unavailable');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${crypto.sign(null, Buffer.from(body), this.privateKey).toString('base64url')}`;
  }
  async changeLicense(id: string, enabled: boolean, expiresAt?: string) {
    return this.mutex.runExclusive(async () => {
      const entry = this.state.licenses.find((l) => l.payload.id === id);
      if (!entry || !this.privateKey) throw new Error('License not found');
      if (
        expiresAt &&
        Date.parse(z.iso.datetime().parse(expiresAt)) <= Date.now()
      )
        throw new Error('Expiry must be in the future');
      const payload = expiresAt
        ? { ...entry.payload, expiresAt }
        : entry.payload;
      await this.persist({
        ...this.state,
        licenses: this.state.licenses.map((l) =>
          l.payload.id === id ? { payload, enabled } : l,
        ),
      });
      return { payload, token: this.sign(payload) };
    });
  }
  decode(token: string): LicenseData {
    const [body, signature, extra] = token.split('.');
    if (
      !body ||
      !signature ||
      extra ||
      token.length > 8192 ||
      !this.publicKey ||
      !crypto.verify(
        null,
        Buffer.from(body),
        this.publicKey,
        Buffer.from(signature, 'base64url'),
      )
    )
      throw new Error('Invalid license signature');
    const payload = License.parse(
      JSON.parse(Buffer.from(body, 'base64url').toString('utf8')),
    );
    if (Date.parse(payload.expiresAt) <= Date.now())
      throw new Error('License expired');
    return payload;
  }
  verifyIssued(token: string) {
    try {
      if (!this.options.issuer) return false;
      const payload = this.decode(token);
      return this.state.licenses.some(
        (l) =>
          l.payload.id === payload.id &&
          l.enabled &&
          JSON.stringify(l.payload) === JSON.stringify(payload),
      );
    } catch {
      return false;
    }
  }
  private async remoteValid(token: string) {
    if (!this.options.licenseServer) return false;
    try {
      const response = await fetch(
        new URL('/api/access/verify', this.options.licenseServer),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          signal: AbortSignal.timeout(5000),
          redirect: 'error',
        },
      );
      return (
        response.ok &&
        ((await response.json()) as { valid?: boolean }).valid === true
      );
    } catch {
      return false;
    }
  }
  private async remoteAuthenticate(header: string): Promise<boolean> {
    const token = this.state.activation;
    if (!this.options.publicKeyFile || !this.options.licenseServer || !token)
      return false;
    try {
      const payload = this.decode(token);
      if (
        payload.installation !== this.installation ||
        payload.validation === 'offline'
      )
        return false;
    } catch {
      return false;
    }
    const key = crypto
      .createHash('sha256')
      .update(`${token}:${header}`)
      .digest('hex');
    if ((this.remoteAuthCache.get(key) ?? 0) > Date.now()) return true;
    const pending = this.remoteAuthPending.get(key);
    if (pending) return pending;
    if (this.remoteAuthPending.size >= 8) return false;
    const work = async () => {
      try {
        const response = await fetch(
          new URL('/api/access/login', this.options.licenseServer),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, authorization: header }),
            signal: AbortSignal.timeout(5000),
            redirect: 'error',
          },
        );
        const valid =
          response.ok &&
          ((await response.json()) as { valid?: boolean }).valid === true;
        if (valid && this.state.activation === token) {
          if (this.remoteAuthCache.size >= 256) this.remoteAuthCache.clear();
          this.remoteAuthCache.set(key, Date.now() + 30_000);
          return true;
        }
      } catch {
        /* Fail closed when the owner issuer is unreachable. */
      }
      return false;
    };
    const result = work().finally(() => {
      this.remoteAuthPending.delete(key);
    });
    this.remoteAuthPending.set(key, result);
    return result;
  }
  async verifyCustomerLogin(token: string, authorization: string) {
    if (!this.verifyIssued(token)) return false;
    const payload = this.decode(token);
    if (payload.validation === 'offline') return false;
    // A customer-bound account cannot log in to the owner's issuer installation.
    return this.authenticate(authorization, payload.installation);
  }
  async activate(token: string) {
    const payload = this.decode(token);
    if (
      payload.installation !== this.installation ||
      (payload.validation !== 'offline' && !(await this.remoteValid(token)))
    )
      throw new Error(
        'License does not match this installation, is disabled, or issuer is unreachable',
      );
    await this.mutex.runExclusive(() =>
      this.persist({ ...this.state, activation: token }),
    );
    this.validUntil = 0;
  }
  async licensed() {
    if (!this.options.publicKeyFile || this.options.issuer) return true;
    const token = this.state.activation;
    if (!token) return false;
    try {
      const payload = this.decode(token);
      if (payload.installation !== this.installation) return false;
      if (payload.validation === 'offline') return true;
      if (Date.now() < this.validUntil) return true;
      if (!this.licenseCheck) {
        this.licenseCheck = this.remoteValid(token)
          .then((valid) => {
            // Activation may change while an old check is still in flight.
            if (valid && this.state.activation === token)
              this.validUntil = Date.now() + 60_000;
            return valid && this.state.activation === token;
          })
          .finally(() => {
            this.licenseCheck = undefined;
          });
      }
      return await this.licenseCheck;
    } catch {
      return false;
    }
  }
  status() {
    let license: LicenseData | undefined;
    try {
      if (this.state.activation) license = this.decode(this.state.activation);
    } catch {
      /* Display inactive/expired. */
    }
    return {
      installation: this.installation,
      required: !!this.options.publicKeyFile,
      issuer: !!this.options.issuer,
      configured: !!this.options.owner,
      license,
    };
  }
}

/** Leave the activation UI reachable while protecting actual APIs and streams. */
export function createLicenseHook(
  access: AccessControl,
): onRequestAsyncHookHandler {
  return async (req, reply) => {
    const route = req.routeOptions.url ?? '';
    if (
      route.startsWith('/api/access/') ||
      route.startsWith('/auth/') ||
      route.startsWith('/web') ||
      route === '/' ||
      route.startsWith('/favicon')
    )
      return;
    if (!(await access.licensed()))
      return reply.code(402).send({
        error:
          'License inactive. Open /web/settings/access to activate this server.',
      });
  };
}
