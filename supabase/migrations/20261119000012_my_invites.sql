-- Thunder · 0012 pending invites for the signed-in user
-- Lets the setup page offer "Join <agency>" when someone signs in normally instead of using the invite link.
-- Only returns open invites addressed to the caller's own email.

create or replace function public.my_pending_invites_thunder()
returns table (token text, workspace_name text, invited_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select i.token, w.name, i.created_at
  from public.workspace_invites_thunder i
  join public.workspaces_thunder w on w.id = i.workspace_id and w.deleted_at is null
  where lower(i.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    and i.accepted_at is null
    and i.expires_at > now()
    and not exists (
      select 1 from public.workspace_members_thunder m
      where m.workspace_id = i.workspace_id and m.user_id = (select auth.uid()))
  order by i.created_at desc;
$$;
revoke all on function public.my_pending_invites_thunder() from public, anon;
grant execute on function public.my_pending_invites_thunder() to authenticated;
