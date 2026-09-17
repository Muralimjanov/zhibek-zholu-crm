import { refreshSession, setSession } from '@/api/client';

describe('session refresh', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shares one in-flight refresh between concurrent callers (single-use refresh tokens)', async () => {
    setSession(null, 'csrf-1');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ accessToken: 'a2', csrfToken: 'csrf-2' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(results).toEqual([true, true, true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('uzz-csrf')).toBe('csrf-2');
  });

  it('uses the latest CSRF token when another tab rotated it meanwhile, and keeps it on failure', async () => {
    setSession(null, 'old');
    localStorage.setItem('uzz-csrf', 'rotated-by-other-tab');
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('rotated-by-other-tab');
      localStorage.setItem('uzz-csrf', 'rotated-again');
      return new Response('{}', { status: 401 });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await refreshSession()).toBe(false);
    expect(localStorage.getItem('uzz-csrf')).toBe('rotated-again');
  });

  it('does nothing without a stored session', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await refreshSession()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
