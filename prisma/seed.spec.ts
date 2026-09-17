import { shouldSeed } from './seed';

describe('shouldSeed (guard for first-Director bootstrap script)', () => {
  it('allows seeding when the User table is completely empty', () => {
    expect(shouldSeed(0)).toBe(true);
  });

  it('refuses to seed when at least one user already exists', () => {
    expect(shouldSeed(1)).toBe(false);
    expect(shouldSeed(42)).toBe(false);
  });
});
