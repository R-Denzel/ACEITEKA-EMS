import jwt from 'jsonwebtoken';
import { prisma } from './db.js';

export const COOKIE = 'ebmis_session';
const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be set (32+ characters).');
  return s;
};

export const signToken = (userId) => jwt.sign({ sub: userId }, secret(), { expiresIn: '8h' });

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 8 * 60 * 60 * 1000,
  path: '/',
});

export class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

// Loads the user, roles and permissions fresh from the database on every request,
// so deactivated accounts and permission changes take effect immediately.
export async function authenticate(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) throw new HttpError(401, 'Please sign in to continue.');
    let payload;
    try { payload = jwt.verify(token, secret()); } catch { throw new HttpError(401, 'Your session has ended. Please sign in again.'); }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    if (!user || !user.isActive) throw new HttpError(401, 'This account is not active.');
    req.user = {
      id: user.id, email: user.email, fullName: user.fullName, userType: user.userType,
      schoolId: user.schoolId, mustChangePassword: user.mustChangePassword,
      roles: user.roles.map((r) => r.role.key),
      permissions: new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key))),
    };
    next();
  } catch (e) { next(e); }
}

export const requirePermission = (...keys) => (req, _res, next) => {
  if (!req.user || !keys.every((k) => req.user.permissions.has(k))) return next(new HttpError(403, 'You do not have permission to do this.'));
  next();
};

// Staff-only and school-only gates. School routes take the school from the session, never the request.
export const staffOnly = (req, _res, next) =>
  req.user?.userType === 'STAFF' ? next() : next(new HttpError(403, 'This area is for ACEITEKA staff only.'));
export const schoolOnly = (req, _res, next) =>
  req.user?.userType === 'SCHOOL' && req.user.schoolId && req.user.permissions.has('school.portal')
    ? next() : next(new HttpError(403, 'This area is for school accounts only.'));

export function errorHandler(err, _req, res, _next) {
  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Please check the highlighted fields.',
      fields: Object.fromEntries(err.issues.map((i) => [i.path.join('.'), i.message])) });
  }
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : err.message });
}
