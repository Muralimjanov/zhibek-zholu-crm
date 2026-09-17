import { demoSeedAllowed } from './seed-demo';

describe('seed-demo guard', () => {
  const password = 'long-enough-password';
  it('never runs in production', () => {
    expect(demoSeedAllowed({ NODE_ENV: 'production', DEMO_SEED: 'true', DEMO_SEED_PASSWORD: password }).ok).toBe(false);
  });
  it('requires an explicit opt-in and a strong password', () => {
    expect(demoSeedAllowed({ NODE_ENV: 'staging', DEMO_SEED_PASSWORD: password }).ok).toBe(false);
    expect(demoSeedAllowed({ NODE_ENV: 'staging', DEMO_SEED: 'true', DEMO_SEED_PASSWORD: 'short' }).ok).toBe(false);
    expect(demoSeedAllowed({ NODE_ENV: 'staging', DEMO_SEED: 'true', DEMO_SEED_PASSWORD: password })).toEqual({ ok: true, password });
  });
});
