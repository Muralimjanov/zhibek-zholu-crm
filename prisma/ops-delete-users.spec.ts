import { databaseName, parseArgs } from './ops-delete-users';

describe('ops-delete-users arguments', () => {
  it('defaults to every non-director role and dry-run', () => {
    expect(parseArgs([])).toMatchObject({ apply: false, roles: ['head_of_sales', 'sales_manager', 'accountant', 'investor'], usernames: [] });
  });

  it('requires the database name to be confirmed before deleting', () => {
    expect(() => parseArgs(['--apply'])).toThrow('--db');
    expect(parseArgs(['--apply', '--db', 'uzz_crm_u7hn'])).toMatchObject({ apply: true, db: 'uzz_crm_u7hn' });
  });

  it('reads the database name from a connection string', () => {
    expect(databaseName('postgresql://u:p@host.render.com/uzz_crm_u7hn')).toBe('uzz_crm_u7hn');
    expect(databaseName('не адрес')).toBe('(не указана)');
    expect(databaseName(undefined)).toBe('(не указана)');
  });

  it('refuses to target directors', () => {
    expect(() => parseArgs(['--roles', 'director'])).toThrow('директор не удаляется никогда');
    expect(() => parseArgs(['--roles', 'sales_manager,director'])).toThrow();
  });

  it('accepts a role and username filter plus --apply', () => {
    expect(parseArgs(['--apply', '--db', 'x', '--roles', 'head_of_sales', '--usernames', 'a, b'])).toMatchObject({
      apply: true,
      roles: ['head_of_sales'],
      usernames: ['a', 'b'],
    });
  });
});
