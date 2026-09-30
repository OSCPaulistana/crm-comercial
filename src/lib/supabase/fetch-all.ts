import "server-only";

type PageResult = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/**
 * Busca todas as linhas contornando o limite padrão de 1.000 registros por
 * requisição da API do Supabase.
 */
export async function fetchAll<T>(page: (from: number, to: number) => PageResult, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) break;
  }
  return out;
}
