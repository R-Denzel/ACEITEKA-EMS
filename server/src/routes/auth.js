import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db.js';
import { authenticate, signToken, cookieOptions, COOKIE, HttpError } from '../middleware.js';
import { logActivity } from '../audit.js';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: process.env.NODE_ENV === 'test' ? 1000 : 20,
  message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' } });

const passwordRule = z.string().min(10, 'Use at least 10 characters.')
  .regex(/[A-Za-z]/, 'Include at least one letter.').regex(/[0-9]/, 'Include at least one number.');

export const publicUser = (u) => ({
  id: u.id, email: u.email, fullName: u.fullName, userType: u.userType, schoolId: u.schoolId,
  roles: u.roles, permissions: [...u.permissions], mustChangePassword: u.mustChangePassword,
});

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = z.object({ email: z.string().email('Enter a valid email address.'), password: z.string().min(1, 'Enter your password.') }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const fail = async () => { await logActivity(req, 'login.failed', { entity: 'User', entityId: user?.id, userId: user?.id }); throw new HttpError(401, 'Email or password is not correct.'); };
    if (!user) { await bcrypt.compare(password, '$2a$10$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234'); return await fail(); }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new HttpError(429, 'This account is temporarily locked. Please try again in 15 minutes.');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const failed = user.failedLogins + 1;
      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: failed, lockedUntil: failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null } });
      return await fail();
    }
    if (!user.isActive) throw new HttpError(403, 'This account has been switched off. Please contact ACEITEKA.');
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const token = signToken(user.id);
    res.cookie(COOKIE, token, cookieOptions());
    await logActivity(req, 'login.success', { entity: 'User', entityId: user.id, userId: user.id });
    req.cookies = { [COOKIE]: token };
    authenticate(req, res, (e) => (e ? next(e) : res.json({ user: publicUser(req.user) })));
  } catch (e) { next(e); }
});

authRouter.post('/logout', authenticate, async (req, res) => {
  await logActivity(req, 'logout', { entity: 'User', entityId: req.user.id });
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

authRouter.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const body = z.object({ currentPassword: z.string().min(1, 'Enter your current password.'), newPassword: passwordRule }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) throw new HttpError(400, 'Your current password is not correct.');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 12), mustChangePassword: false } });
    await logActivity(req, 'password.changed', { entity: 'User', entityId: user.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Password reset. In development the link is printed to the server log; production sends it by email (see DEPLOYMENT_GUIDE).
authRouter.post('/forgot-password', loginLimiter, async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email('Enter a valid email address.') }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user && user.isActive) {
      const token = crypto.randomBytes(32).toString('hex');
      await prisma.passwordReset.create({ data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
      if (process.env.NODE_ENV !== 'production') console.log(`[dev] Password reset link: ${process.env.CLIENT_URL}/reset-password?token=${token}`);
      await logActivity(req, 'password.reset_requested', { entity: 'User', entityId: user.id, userId: user.id });
    }
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (e) { next(e); }
});

authRouter.post('/reset-password', loginLimiter, async (req, res, next) => {
  try {
    const { token, newPassword } = z.object({ token: z.string().min(10), newPassword: passwordRule }).parse(req.body);
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const rec = await prisma.passwordReset.findUnique({ where: { tokenHash: hash } });
    if (!rec || rec.usedAt || rec.expiresAt < new Date()) throw new HttpError(400, 'This reset link is not valid or has expired. Please ask for a new one.');
    await prisma.$transaction([
      prisma.user.update({ where: { id: rec.userId }, data: { passwordHash: await bcrypt.hash(newPassword, 12), failedLogins: 0, lockedUntil: null } }),
      prisma.passwordReset.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    ]);
    await logActivity(req, 'password.reset_completed', { entity: 'User', entityId: rec.userId, userId: rec.userId });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
