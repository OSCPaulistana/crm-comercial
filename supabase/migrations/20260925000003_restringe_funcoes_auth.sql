-- Migration 003: as funções auxiliares de autorização só podem ser executadas
-- por usuários autenticados (são necessárias nas policies de RLS).
-- Elas retornam apenas o perfil do próprio usuário que está chamando.
revoke execute on function public.perfil_atual() from public, anon;
revoke execute on function public.usuario_ativo() from public, anon;
revoke execute on function public.is_gestor() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.perfil_atual() to authenticated;
grant execute on function public.usuario_ativo() to authenticated;
grant execute on function public.is_gestor() to authenticated;
grant execute on function public.is_admin() to authenticated;
