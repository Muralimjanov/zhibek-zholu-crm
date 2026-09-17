import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  it('bypasses authentication for routes marked @Public()', () => {
    const reflector = { getAllAndOverride: jest.fn(() => true) } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('delegates to the passport JWT strategy for non-public routes', () => {
    const reflector = { getAllAndOverride: jest.fn(() => false) } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const superSpy = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue(true);

    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(superSpy).toHaveBeenCalled();
    superSpy.mockRestore();
  });
});
