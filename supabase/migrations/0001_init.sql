-- Day-1 schema: workspaces, contacts, conversations, messages, prompts,
-- tool_configs, templates — plus workspace_members, which is the join table
-- that makes "multi-tenant by workspace" actually enforceable via RLS.
-- Later layers (message_batches, business_info, kb_documents, setter_configs,
-- schedules, integrations, logs) are added in their own migrations.

create extension if not exists "pgcrypto";

create type public.workspace_role as enum ('admin', 'manager', 'agent', 'viewer');
create type public.conversation_status as enum (
  'ai_active',
  'human_active',
  'handoff_pending',
  'awaiting_user',
  'snoozed',
  'closed'
);
create type public.message_direction as enum ('inbound', 'outbound');
create type public.message_sender as enum ('contact', 'ai', 'human');
create type public.template_status as enum ('draft', 'submitted', 'approved', 'rejected', 'paused');

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- workspaces ------------------------------------------------------------

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  ycloud_api_key text,
  ycloud_webhook_secret text,
  ycloud_whatsapp_number text unique,
  openrouter_api_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

-- workspace_members -------------------------------------------------------

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'agent',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id and m.user_id = auth.uid()
  );
$$;

create function public.is_workspace_admin(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id
      and m.user_id = auth.uid()
      and m.role in ('admin', 'manager')
  );
$$;

-- contacts ----------------------------------------------------------------

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  phone text not null,
  name text,
  email text,
  source text,
  owner_id uuid references auth.users(id) on delete set null,
  tags text[] not null default '{}',
  custom_fields jsonb not null default '{}',
  stage text,
  highlevel_contact_id text,
  opted_in boolean not null default true,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, phone)
);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

create index contacts_workspace_id_idx on public.contacts(workspace_id);

-- conversations -------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status public.conversation_status not null default 'ai_active',
  assigned_to uuid references auth.users(id) on delete set null,
  window_expires_at timestamptz,
  channel text not null default 'whatsapp',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create index conversations_workspace_id_idx on public.conversations(workspace_id);
create index conversations_contact_id_idx on public.conversations(contact_id);

-- messages --------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction public.message_direction not null,
  sender public.message_sender not null,
  type text not null default 'text',
  body text,
  media_url text,
  wamid text,
  batch_id uuid,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages(conversation_id, created_at);
create index messages_workspace_id_idx on public.messages(workspace_id);
create unique index messages_wamid_idx on public.messages(wamid) where wamid is not null;

-- prompts -----------------------------------------------------------------

create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope text not null default 'workspace',
  scope_ref text,
  content text not null,
  is_published boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now()
);

create index prompts_workspace_scope_idx on public.prompts(workspace_id, scope, scope_ref);

-- tool_configs --------------------------------------------------------------

create table public.tool_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tool_name text not null,
  enabled boolean not null default false,
  credentials jsonb not null default '{}',
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (workspace_id, tool_name)
);

-- templates -----------------------------------------------------------------

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  language text not null default 'es',
  status public.template_status not null default 'draft',
  category text,
  components jsonb not null default '[]',
  meta_template_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name, language)
);

create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

-- Row Level Security ---------------------------------------------------------
-- Dashboard access goes through these policies (authenticated workspace members).
-- The inbound webhook and background jobs use the service role key, which
-- bypasses RLS entirely, so they are unaffected by the policies below.

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.prompts enable row level security;
alter table public.tool_configs enable row level security;
alter table public.templates enable row level security;

create policy "members can view their workspace" on public.workspaces
  for select using (public.is_workspace_member(id));
create policy "admins can update their workspace" on public.workspaces
  for update using (public.is_workspace_admin(id));

create policy "members can view membership roster" on public.workspace_members
  for select using (public.is_workspace_member(workspace_id));
create policy "admins can manage membership roster" on public.workspace_members
  for all using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy "members can view contacts" on public.contacts
  for select using (public.is_workspace_member(workspace_id));
create policy "members can manage contacts" on public.contacts
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "members can view conversations" on public.conversations
  for select using (public.is_workspace_member(workspace_id));
create policy "members can manage conversations" on public.conversations
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "members can view messages" on public.messages
  for select using (public.is_workspace_member(workspace_id));
create policy "members can send messages" on public.messages
  for insert with check (public.is_workspace_member(workspace_id));

create policy "members can view prompts" on public.prompts
  for select using (public.is_workspace_member(workspace_id));
create policy "managers can manage prompts" on public.prompts
  for all using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy "members can view tool configs" on public.tool_configs
  for select using (public.is_workspace_member(workspace_id));
create policy "managers can manage tool configs" on public.tool_configs
  for all using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy "members can view templates" on public.templates
  for select using (public.is_workspace_member(workspace_id));
create policy "managers can manage templates" on public.templates
  for all using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- Realtime: the inbox needs live inserts/updates on these tables.
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
