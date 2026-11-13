-- Keep handles out of the append-only audit record.
--
-- audit_log rows can never be edited or removed, so a handle written there can
-- never be erased, even when the Strategist later deletes their account. The
-- audit entry for a held-handle decision already says whose profile it is
-- (target_id is the user's id) and which request it was (flag_id), so the
-- handle string is not needed: only flag_id and the reason are recorded now.
--
-- Everything else in decide_held_handle() is identical to migration
-- 20261104000100. Entries already written by the old version cannot be changed.

create or replace function public.decide_held_handle(p_flag_id uuid, p_action text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  f public.moderation_flags%rowtype;
  wanted text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: only admins can decide handles' using errcode = '42501';
  end if;
  if p_action not in ('release', 'keep_held') then
    raise exception 'BAD_ACTION: choose release or keep held' using errcode = '22023';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'REASON_REQUIRED: give a reason of up to 500 characters' using errcode = '22023';
  end if;
  select * into f from public.moderation_flags where id = p_flag_id and kind = 'held_handle' and status = 'open' for update;
  if not found then
    raise exception 'NOT_FOUND: no such held handle' using errcode = 'P0002';
  end if;
  wanted := f.details ->> 'handle';

  if p_action = 'release' then
    if exists (select 1 from public.profiles where id = f.user_id and handle is not null) then
      raise exception 'HANDLE_ALREADY_CHOSEN: this Strategist has since chosen another handle' using errcode = '22023';
    end if;
    if exists (select 1 from public.profiles where lower(handle) = lower(wanted)) then
      raise exception 'HANDLE_TAKEN: someone else now has this handle' using errcode = '23505';
    end if;
    update public.profiles set handle = wanted, handle_set_at = now() where id = f.user_id;
  end if;

  if f.ai_decision_id is not null then
    update public.ai_decisions
    set overridden_by = uid, overridden_at = now(),
        override_outcome = case when p_action = 'release' then 'allow' else 'hold' end::public.ai_decision_outcome,
        override_reason = v_reason
    where id = f.ai_decision_id and overridden_at is null and p_action = 'release';
  end if;

  update public.moderation_flags
  set status = 'resolved', resolution = case when p_action = 'release' then 'released' else 'kept_held' end,
      resolution_reason = v_reason, resolved_by = uid, resolved_at = now()
  where id = f.id;

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (uid, case when p_action = 'release' then 'moderation.handle_released' else 'moderation.handle_kept_held' end,
          'profiles', f.user_id::text, jsonb_build_object('reason', v_reason, 'flag_id', f.id));
end;
$$;

revoke execute on function public.decide_held_handle(uuid, text, text) from public, anon;
grant execute on function public.decide_held_handle(uuid, text, text) to authenticated;
