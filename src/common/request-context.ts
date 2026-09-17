import { Request } from 'express';
import { RequestContext } from '../users/users.service';

export function ctxOf(req: Request): RequestContext {
  const ua = req.headers['user-agent'];
  return { ip: req.ip, userAgent: typeof ua === 'string' ? ua.slice(0, 512) : undefined };
}
