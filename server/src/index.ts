import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import mysql, { type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { Server } from 'socket.io';
import { z } from 'zod';

const env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:8081'),
  MYSQL_HOST: z.string().default('127.0.0.1'),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_DATABASE: z.string().default('vatanmsg'),
  MYSQL_USER: z.string().default('vatanmsg_app'),
  MYSQL_PASSWORD: z.string(),
  JWT_SECRET: z.string().min(32),
  DEMO_LOGIN_ENABLED: z.enum(['true', 'false']).default('true')
}).parse(process.env);

if (env.NODE_ENV === 'production' && env.DEMO_LOGIN_ENABLED === 'true') {
  throw new Error('DEMO_LOGIN_ENABLED must be false in production.');
}

const pool = mysql.createPool({
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT,
  database: env.MYSQL_DATABASE,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 50,
  charset: 'utf8mb4'
});

type UserRow = RowDataPacket & {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  birth_year: number | null;
  birth_calendar: 'solar_hijri' | 'gregorian' | null;
};
type AuthRequest = Request & { userId?: string };

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: env.CLIENT_ORIGIN.split(',').map(value => value.trim()), methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e6,
  connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 }
});

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN.split(',').map(value => value.trim()) }));
app.use(express.json({ limit: '16kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));

const fail = (res: Response, status: number, message: string) => res.status(status).json({ error: message });
const tokenFor = (userId: string) => jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: '7d', issuer: 'vatanmsg-api', audience: 'vatanmsg-app' });

function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const value = req.header('authorization');
  if (!value?.startsWith('Bearer ')) return fail(res, 401, 'Authentication required.');
  try {
    const payload = jwt.verify(value.slice(7), env.JWT_SECRET, { issuer: 'vatanmsg-api', audience: 'vatanmsg-app' }) as JwtPayload;
    if (typeof payload.sub !== 'string') return fail(res, 401, 'Invalid session.');
    req.userId = payload.sub;
    next();
  } catch {
    return fail(res, 401, 'Invalid or expired session.');
  }
}

async function requireMembership(userId: string, conversationId: string) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT role FROM conversation_members WHERE user_id = ? AND conversation_id = ? LIMIT 1',
    [userId, conversationId]
  );
  return rows[0] as { role: string } | undefined;
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'vatanmsg-api', mode: env.NODE_ENV }));

app.post('/api/auth/demo', async (req, res, next) => {
  try {
    if (env.NODE_ENV === 'production' || env.DEMO_LOGIN_ENABLED !== 'true') {
      return fail(res, 404, 'Demo sign-in is disabled.');
    }
    const parsed = z.object({
      username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/).optional(),
      displayName: z.string().trim().min(1).max(60).optional()
    }).safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Invalid demo profile.');
    const username = parsed.data.username ?? `demo_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
    const displayName = parsed.data.displayName ?? 'Vatan Demo';
    // Demo login must never turn a chosen username into an account-takeover shortcut.
    const [existing] = await pool.execute<UserRow[]>('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
    if (existing.length > 0) return fail(res, 409, 'Username is already taken. Choose a different demo username.');
    const id = randomUUID();
    await pool.execute<ResultSetHeader>(
      'INSERT INTO users (id, username, display_name) VALUES (?, ?, ?)',
      [id, username, displayName]
    );
    const [created] = await pool.execute<UserRow[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    const user = created[0];
    if (!user) return fail(res, 500, 'Could not create demo user.');
    return res.status(200).json({
      token: tokenFor(user.id),
      user: { id: user.id, username: user.username, displayName: user.display_name, avatarUrl: user.avatar_url }
    });
  } catch (error) { next(error); }
});

app.get('/api/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const [rows] = await pool.execute<UserRow[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [req.userId]);
    const user = rows[0];
    if (!user) return fail(res, 404, 'User not found.');
    return res.json({
      id: user.id, username: user.username, displayName: user.display_name,
      avatarUrl: user.avatar_url, birthYear: user.birth_year, birthCalendar: user.birth_calendar
    });
  } catch (error) { next(error); }
});

app.patch('/api/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const parsed = z.object({
      displayName: z.string().trim().min(1).max(60).optional(),
      username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/).optional(),
      birthYear: z.number().int().min(1300).max(2200).nullable().optional(),
      birthCalendar: z.enum(['solar_hijri', 'gregorian']).nullable().optional(),
      avatarUrl: z.string().url().max(2048).nullable().optional()
    }).strict().safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return fail(res, 400, 'Invalid profile update.');
    const data = parsed.data;
    const updates: string[] = [];
    const values: unknown[] = [];
    if (data.displayName !== undefined) { updates.push('display_name = ?'); values.push(data.displayName); }
    if (data.username !== undefined) { updates.push('username = ?'); values.push(data.username); }
    if (data.birthYear !== undefined) { updates.push('birth_year = ?'); values.push(data.birthYear); }
    if (data.birthCalendar !== undefined) { updates.push('birth_calendar = ?'); values.push(data.birthCalendar); }
    if (data.avatarUrl !== undefined) { updates.push('avatar_url = ?'); values.push(data.avatarUrl); }
    values.push(req.userId);
    await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.execute<UserRow[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [req.userId]);
    const user = rows[0];
    return res.json({ id: user.id, username: user.username, displayName: user.display_name, avatarUrl: user.avatar_url, birthYear: user.birth_year, birthCalendar: user.birth_calendar });
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') return fail(res, 409, 'Username is already taken.');
    next(error);
  }
});

const roomInput = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(280).optional()
}).strict();

async function createConversation(userId: string, kind: 'group' | 'channel', title: string, description?: string) {
  const connection = await pool.getConnection();
  const id = randomUUID();
  try {
    await connection.beginTransaction();
    await connection.execute('INSERT INTO conversations (id, kind, title, description, created_by) VALUES (?, ?, ?, ?, ?)', [id, kind, title, description ?? null, userId]);
    await connection.execute('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)', [id, userId, kind === 'channel' ? 'owner' : 'owner']);
    await connection.commit();
    return { id, kind, title, description: description ?? null };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

app.get('/api/conversations', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT c.id, c.kind, c.title, c.description, c.created_at, cm.role
       FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id
       WHERE cm.user_id = ? ORDER BY c.updated_at DESC LIMIT 100`, [req.userId]
    );
    return res.json({ conversations: rows });
  } catch (error) { next(error); }
});

app.post('/api/groups', authenticate, async (req: AuthRequest, res, next) => {
  const parsed = roomInput.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'Invalid group details.');
  try { return res.status(201).json({ conversation: await createConversation(req.userId!, 'group', parsed.data.title, parsed.data.description) }); }
  catch (error) { next(error); }
});

app.post('/api/channels', authenticate, async (req: AuthRequest, res, next) => {
  const parsed = roomInput.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'Invalid channel details.');
  try { return res.status(201).json({ conversation: await createConversation(req.userId!, 'channel', parsed.data.title, parsed.data.description) }); }
  catch (error) { next(error); }
});

app.get('/api/conversations/:id/messages', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const membership = await requireMembership(req.userId!, req.params.id);
    if (!membership) return fail(res, 403, 'You are not a member of this conversation.');
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT m.id, m.conversation_id AS conversationId, m.sender_id AS senderId,
              m.body, m.created_at AS createdAt, u.username, u.display_name AS displayName
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ? AND m.deleted_at IS NULL
       ORDER BY m.created_at DESC LIMIT 50`, [req.params.id]
    );
    return res.json({ messages: rows.reverse() });
  } catch (error) { next(error); }
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string') return next(new Error('Authentication required.'));
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'vatanmsg-api', audience: 'vatanmsg-app' }) as JwtPayload;
    if (typeof payload.sub !== 'string') return next(new Error('Invalid session.'));
    socket.data.userId = payload.sub;
    next();
  } catch { next(new Error('Invalid or expired session.')); }
});

io.on('connection', socket => {
  const userId = socket.data.userId as string;
  socket.on('conversation:join', async (input: unknown, callback?: (result: object) => void) => {
    try {
      const parsed = z.object({ conversationId: z.string().uuid() }).safeParse(input);
      if (!parsed.success) return callback?.({ ok: false, error: 'Invalid conversation id.' });
      const member = await requireMembership(userId, parsed.data.conversationId);
      if (!member) return callback?.({ ok: false, error: 'Membership required.' });
      await socket.join(`conversation:${parsed.data.conversationId}`);
      callback?.({ ok: true });
    } catch { callback?.({ ok: false, error: 'Could not join conversation.' }); }
  });

  socket.on('message:send', async (input: unknown, callback?: (result: object) => void) => {
    try {
      const parsed = z.object({
        conversationId: z.string().uuid(),
        body: z.string().trim().min(1).max(4000)
      }).safeParse(input);
      if (!parsed.success) return callback?.({ ok: false, error: 'Message is invalid.' });
      const membership = await requireMembership(userId, parsed.data.conversationId);
      if (!membership) return callback?.({ ok: false, error: 'Membership required.' });
      const [conversationRows] = await pool.execute<RowDataPacket[]>('SELECT kind FROM conversations WHERE id = ? LIMIT 1', [parsed.data.conversationId]);
      if (conversationRows[0]?.kind === 'channel' && !['owner', 'admin'].includes(membership.role)) {
        return callback?.({ ok: false, error: 'Only channel administrators can publish messages.' });
      }
      const messageId = randomUUID();
      await pool.execute('INSERT INTO messages (id, conversation_id, sender_id, body) VALUES (?, ?, ?, ?)', [messageId, parsed.data.conversationId, userId, parsed.data.body]);
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT m.id, m.conversation_id AS conversationId, m.sender_id AS senderId,
                m.body, m.created_at AS createdAt, u.username, u.display_name AS displayName
         FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ? LIMIT 1`, [messageId]
      );
      const message = rows[0];
      io.to(`conversation:${parsed.data.conversationId}`).emit('message:new', message);
      callback?.({ ok: true, message });
    } catch { callback?.({ ok: false, error: 'Message could not be sent.' }); }
  });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Keep internal DB/stack details out of public responses.
  console.error('[vatan-api]', error instanceof Error ? error.message : 'Unknown error');
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
});

async function start() {
  await pool.query('SELECT 1');
  httpServer.listen(env.PORT, '0.0.0.0', () => {
    console.log(`Vatan API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });
}

start().catch(error => {
  console.error('Could not start Vatan API. Check database configuration and schema.', error instanceof Error ? error.message : '');
  process.exit(1);
});

process.on('SIGTERM', async () => {
  io.close();
  await pool.end();
  process.exit(0);
});
