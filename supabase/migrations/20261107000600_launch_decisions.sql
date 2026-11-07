-- Legal hardening, Part 9: launch-pack decisions that need the database.
--
-- 1. Cost cap: the global daily AI cap goes from 3,000 to 1,000 calls a day for
--    the first fortnight (decision 4, 7 November 2026). The settings row AND the
--    column default change, and one audit entry records it (actor: system).
--    Raise it again in Admin → Settings after two weeks if usage needs it.
--    (The settings trigger also writes its usual 'settings.updated' entry.)
-- 2. A Campaign's content note may be up to 1,000 characters (was 500): the
--    assisted-dying note you approved is 519 characters, and a content note must
--    be able to carry support-line numbers in full.

alter table public.community_settings alter column ai_daily_cap_global set default 1000;

do $$
declare
  v_before integer;
begin
  select ai_daily_cap_global into v_before from public.community_settings where id = true;
  update public.community_settings set ai_daily_cap_global = 1000 where id = true;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (null, 'settings.changed', 'community_settings', null,
          jsonb_build_object('setting', 'ai_daily_cap_global', 'from', v_before, 'to', 1000, 'actor', 'system',
                             'reason', 'Launch decision 4, 7 November 2026: 1,000 for the first fortnight'));
end;
$$;

alter table public.campaigns drop constraint campaigns_content_note_check;
alter table public.campaigns add constraint campaigns_content_note_check check (char_length(content_note) <= 1000);
