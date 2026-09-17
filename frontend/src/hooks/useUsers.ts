import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/api/endpoints';
import type { User } from '@/api/types';
import { useUser } from '@/auth/AuthProvider';

/**
 * Directory of visible accounts: director - everyone, head of sales - team
 * (+ self). Other roles cannot list users; for them only the signed-in user
 * is known.
 */
export function useUsers() {
  const me = useUser();
  const canList = me.role === 'director' || me.role === 'head_of_sales';
  const query = useQuery({ queryKey: ['users'], queryFn: usersApi.list, enabled: canList, staleTime: 60_000 });
  const list: User[] = canList ? [...(query.data ?? [])] : [];
  if (!list.some((u) => u.id === me.id)) list.push(me);
  const byId = new Map(list.map((u) => [u.id, u]));
  const nameOf = (id: string | null | undefined) => (id ? (byId.get(id)?.fullName ?? `Сотрудник …${id.slice(-4)}`) : '—');
  const sellers = list.filter((u) => (u.role === 'sales_manager' || u.role === 'head_of_sales') && u.status === 'active');
  return { list, byId, nameOf, sellers, isLoading: canList && query.isLoading };
}
