-- Tombstone hardening. Follows 20261104000300, which stopped a deleted account
-- (deleted_at set) from getting a handle. This closes the other half: once
-- deleted_at is set it can never be cleared again, by any role, including the
-- service role. Without it, the service role could clear deleted_at and then
-- set a handle, bringing a deleted account back.
--
-- Same function name and trigger as before (profiles_block_tombstone_handle,
-- profiles_no_handle_on_tombstone), so nothing needs to be dropped or recreated:
-- the trigger already fires on insert and on update of handle or deleted_at.
--
-- anonymise_profile() sets deleted_at from null to a time (allowed) and
-- before_auth_user_deleted() only deletes the profile row afterwards (a DELETE,
-- which this trigger does not cover), so both keep working.

create or replace function public.profiles_block_tombstone_handle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A deleted account can never have a handle.
  if new.deleted_at is not null and new.handle is not null then
    raise exception 'ACCOUNT_DELETED: a deleted account cannot have a handle' using errcode = '42501';
  end if;
  -- And deleted_at can never be cleared once set.
  if tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null then
    raise exception 'ACCOUNT_DELETED: a deleted account cannot be restored' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_block_tombstone_handle() from public, anon, authenticated;
