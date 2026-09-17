import { readSeedInput, shouldSeed } from './seed';

describe('shouldSeed (guard for first-Director bootstrap script)', () => {
  it('allows seeding when the User table is completely empty', () => {
    expect(shouldSeed(0)).toBe(true);
  });

  it('refuses to seed when at least one user already exists', () => {
    expect(shouldSeed(1)).toBe(false);
    expect(shouldSeed(42)).toBe(false);
  });
});

describe('readSeedInput', () => {
  const full = {
    SEED_DIRECTOR_USERNAME: 'director',
    SEED_DIRECTOR_PASSWORD: 'a-long-password-123',
    SEED_DIRECTOR_FULL_NAME: 'Директор',
    SEED_DIRECTOR_EMAIL: ' Boss@Example.com ',
  };

  it('returns null when no SEED_DIRECTOR_* variable is set (container start without bootstrap)', () => {
    expect(readSeedInput({})).toBeNull();
  });

  it('requires every variable, including the email that receives login codes', () => {
    const { SEED_DIRECTOR_EMAIL: _omit, ...withoutEmail } = full;
    expect(() => readSeedInput(withoutEmail)).toThrow('SEED_DIRECTOR_EMAIL');
  });

  it('rejects a short password and an invalid email; normalizes the email', () => {
    expect(() => readSeedInput({ ...full, SEED_DIRECTOR_PASSWORD: 'short' })).toThrow('12');
    expect(() => readSeedInput({ ...full, SEED_DIRECTOR_EMAIL: 'not-an-email' })).toThrow('адресом почты');
    expect(readSeedInput(full)?.email).toBe('boss@example.com');
  });
});
