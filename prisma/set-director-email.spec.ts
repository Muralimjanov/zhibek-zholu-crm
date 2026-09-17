import { parseArgs } from './set-director-email';

describe('set-director-email parseArgs', () => {
  it('parses username, email and the overwrite flag', () => {
    expect(parseArgs(['--username', 'director1', '--email', 'a@example.com'])).toEqual({
      username: 'director1',
      email: 'a@example.com',
      overwrite: false,
    });
    expect(parseArgs(['--username', 'd', '--email', 'a@example.com', '--overwrite']).overwrite).toBe(true);
  });

  it('rejects missing arguments and invalid emails', () => {
    expect(() => parseArgs(['--username', 'director1'])).toThrow();
    expect(() => parseArgs(['--username', 'director1', '--email', 'not-an-email'])).toThrow('Некорректный email.');
  });
});
