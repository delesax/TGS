-- Sprint 2 follow-up: admin-only Campaign columns were readable through the API.
--
-- `notes` (admin working notes), `brief` (topic-bank facts, hidden until the
-- owner refreshes them), `needs_owner_decision` and `created_by` were never shown
-- on a page, but the table-level SELECT grant let anyone read them through the
-- API. Browsers now get the public columns only; admins read the private ones
-- through campaign_admin_fields(), which checks the JWT role claim.

revoke select on public.campaigns from anon, authenticated;
grant select (
  id, slug, title, summary, rules, category, format, status, starts_at, ends_at,
  is_sensitive, content_note, opinion_not_advice, rubric_published_at, wave, current_round,
  created_at, updated_at
) on public.campaigns to anon, authenticated;

create or replace function public.campaign_admin_fields(p_ids uuid[])
returns table (id uuid, notes text, needs_owner_decision text, brief jsonb, created_by uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can read Campaign notes' using errcode = '42501';
  end if;
  return query
  select c.id, c.notes, c.needs_owner_decision, c.brief, c.created_by
  from public.campaigns c
  where c.id = any (p_ids);
end;
$$;

revoke execute on function public.campaign_admin_fields(uuid[]) from public, anon;
grant execute on function public.campaign_admin_fields(uuid[]) to authenticated;
