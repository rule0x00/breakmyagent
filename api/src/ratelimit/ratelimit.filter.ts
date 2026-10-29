import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { RateLimitedException } from './ratelimit.service';

/** Adds the Retry-After header that clients and proxies understand. */
@Catch(RateLimitedException)
export class RateLimitFilter implements ExceptionFilter {
  catch(exception: RateLimitedException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.setHeader('Retry-After', String(exception.retryAfterSeconds));
    res.status(exception.getStatus()).json(exception.getResponse());
  }
}
