import { parseArgs } from './ops-delete-users';

describe('ops-delete-users arguments', () => {
  it('defaults to every non-director role and dry-run', () => {
    expect(parseArgs([])).toEqual({ apply: false, roles: ['head_of_sales', 'sales_manager', 'accountant', 'investor'], usernames: [] });
  });

  it('refuses to target directors', () => {
    expect(() => parseArgs(['--roles', 'director'])).toThrow('директор не удаляется никогда');
    expect(() => parseArgs(['--roles', 'sales_manager,director'])).toThrow();
  });

  it('accepts a role and username filter plus --apply', () => {
    expect(parseArgs(['--apply', '--roles', 'head_of_sales', '--usernames', 'a, b'])).toEqual({
      apply: true,
      roles: ['head_of_sales'],
      usernames: ['a', 'b'],
    });
  });
});
