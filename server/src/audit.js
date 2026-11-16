import { prisma } from './db.js';

// Append-only activity history. There is deliberately no update or delete route for it.
export async function logActivity(req, action, { entity, entityId, before, after, userId } = {}) {
  try {
    await prisma.activityLog.create({
      data: { userId: userId ?? req?.user?.id ?? null, action, entity, entityId, before, after, ip: req?.ip },
    });
  } catch (e) { console.error('Activity log failed', e); }
}
