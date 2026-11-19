-- Thunder · 0011 team invites
-- Invites are links (/invite/<token>). The invite page needs to show the agency name before the
-- person is a member, so invite_info_thunder reads it with elevated rights, for a valid token only.

-- One open invite per email per workspace.
create unique index if not exists workspace_invites_open_uq
  on public.workspace_invites_thunder (workspace_id, lower(email))
  where accepted_at is null;

create or replace function public.invite_info_thunder(p_token text)
returns table (workspace_name text, email text, status text)
language sql stable security definer
set search_path = ''
as $$
  select w.name, i.email,
    case when i.accepted_at is not null then 'accepted'
         when i.expires_at <= now() then 'expired'
         else 'open' end
  from public.workspace_invites_thunder i
  join public.workspaces_thunder w on w.id = i.workspace_id and w.deleted_at is null
  where i.token = p_token;
$$;
revoke all on function public.invite_info_thunder(text) from public;
grant execute on function public.invite_info_thunder(text) to anon, authenticated;
