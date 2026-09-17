import { ArgumentsHost, ForbiddenException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function run(exception: unknown) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

describe('AllExceptionsFilter', () => {
  it('keeps application HttpExceptions', () => {
    expect(run(new ForbiddenException('AUTH_FORBIDDEN'))).toMatchObject({ status: 403 });
  });

  it('maps exposed middleware client errors (e.g. body too large) to their status with a stable code', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), { status: 413, expose: true, type: 'entity.too.large' });
    expect(run(tooLarge)).toEqual({ status: 413, body: { statusCode: 413, message: 'PAYLOAD_TOO_LARGE' } });
  });

  it('hides everything else behind a generic 500 without internals', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const prismaLike = Object.assign(new Error('Invalid `prisma.user.create()` invocation: secret details'), { code: 'P2002' });
    const out = run(prismaLike);
    expect(out).toEqual({ status: 500, body: { statusCode: 500, message: 'INTERNAL_ERROR' } });
    // Unexposed errors with a status (server-side problems) are not surfaced either.
    expect(run(Object.assign(new Error('x'), { status: 400, expose: false })).status).toBe(500);
  });
});
