-- ============================================================================
--  Kanban · esquema completo para Supabase
--  Pega este archivo en el SQL Editor de tu proyecto (una sola vez).
--  Después desactiva "Confirm email" en Authentication > Sign In / Providers,
--  porque el equipo entra con correo + PIN compartido.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id          uuid primary key,
  email       text not null,
  name        text not null,
  color       text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.boards (
  id          uuid primary key,
  slug        text not null unique,
  name        text not null,
  color       text not null,
  created_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  id          uuid primary key,
  board_id    uuid not null references public.boards (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  role        text not null default 'member' check (role in ('admin', 'member')),
  created_at  timestamptz not null default now(),
  unique (board_id, user_id)
);

create table if not exists public.invites (
  id          uuid primary key,
  board_id    uuid not null references public.boards (id) on delete cascade,
  email       text not null,
  name        text not null,
  role        text not null default 'member' check (role in ('admin', 'member')),
  token       text not null unique,
  created_by  uuid not null references public.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);

create table if not exists public.columns (
  id          uuid primary key,
  board_id    uuid not null references public.boards (id) on delete cascade,
  title       text not null,
  kind        text not null default 'todo' check (kind in ('todo', 'doing', 'done')),
  position    double precision not null default 1024,
  wip_limit   integer
);

create table if not exists public.labels (
  id          uuid primary key,
  board_id    uuid not null references public.boards (id) on delete cascade,
  name        text not null,
  color       text not null
);

create table if not exists public.cards (
  id            uuid primary key,
  board_id      uuid not null references public.boards (id) on delete cascade,
  column_id     uuid not null references public.columns (id) on delete cascade,
  title         text not null,
  description   text not null default '',
  priority      text not null default 'normal' check (priority in ('urgent', 'high', 'normal', 'low')),
  position      double precision not null default 1024,
  due_at        timestamptz,
  completed_at  timestamptz,
  created_by    uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.card_labels (
  card_id   uuid not null references public.cards (id) on delete cascade,
  label_id  uuid not null references public.labels (id) on delete cascade,
  primary key (card_id, label_id)
);

create table if not exists public.card_assignees (
  card_id   uuid not null references public.cards (id) on delete cascade,
  user_id   uuid not null references public.users (id) on delete cascade,
  primary key (card_id, user_id)
);

create table if not exists public.items (
  id            uuid primary key,
  card_id       uuid not null references public.cards (id) on delete cascade,
  title         text not null,
  done          boolean not null default false,
  position      double precision not null default 1024,
  due_at        timestamptz,
  assignee_id   uuid references public.users (id) on delete set null
);

create table if not exists public.comments (
  id          uuid primary key,
  card_id     uuid not null references public.cards (id) on delete cascade,
  author_id   uuid not null references public.users (id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.activity (
  id          uuid primary key,
  board_id    uuid not null references public.boards (id) on delete cascade,
  actor_id    uuid references public.users (id) on delete set null,
  type        text not null,
  meta        text not null default '{}',
  card_id     uuid references public.cards (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists members_board_idx    on public.members (board_id);
create index if not exists invites_board_idx    on public.invites (board_id);
create index if not exists invites_token_idx    on public.invites (token);
create index if not exists columns_board_idx    on public.columns (board_id);
create index if not exists cards_board_idx      on public.cards (board_id);
create index if not exists cards_column_idx     on public.cards (column_id);
create index if not exists labels_board_idx     on public.labels (board_id);
create index if not exists items_card_idx       on public.items (card_id);
create index if not exists comments_card_idx    on public.comments (card_id);
create index if not exists activity_board_idx    on public.activity (board_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers de RLS
-- ---------------------------------------------------------------------------

create or replace function public.is_member(bid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.board_id = bid and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_admin(bid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.board_id = bid and m.user_id = auth.uid() and m.role = 'admin'
  );
$$;

create or replace function public.card_board(cid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.board_id from public.cards c where c.id = cid;
$$;

create or replace function public.item_card(iid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select i.card_id from public.items i where i.id = iid;
$$;

create or replace function public.label_board(lid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.board_id from public.labels l where l.id = lid;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.users       enable row level security;
alter table public.boards      enable row level security;
alter table public.members     enable row level security;
alter table public.invites     enable row level security;
alter table public.columns     enable row level security;
alter table public.labels      enable row level security;
alter table public.cards       enable row level security;
alter table public.card_labels enable row level security;
alter table public.card_assignees enable row level security;
alter table public.items       enable row level security;
alter table public.comments    enable row level security;
alter table public.activity    enable row level security;

-- users: cada quien escribe su perfil; se leen los compañeros de tablero
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.members a
      join public.members b on b.board_id = a.board_id
      where a.user_id = auth.uid() and b.user_id = users.id
    )
  );

drop policy if exists users_insert on public.users;
create policy users_insert on public.users for insert to authenticated
  with check (id = auth.uid());

drop policy if exists users_update on public.users;
create policy users_update on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- boards
drop policy if exists boards_select on public.boards;
create policy boards_select on public.boards for select to authenticated
  using (public.is_member(id) or exists (select 1 from public.invites i where i.board_id = boards.id and i.accepted_at is null));

drop policy if exists boards_insert on public.boards;
create policy boards_insert on public.boards for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists boards_update on public.boards;
create policy boards_update on public.boards for update to authenticated
  using (public.is_admin(id)) with check (public.is_admin(id));

drop policy if exists boards_delete on public.boards;
create policy boards_delete on public.boards for delete to authenticated
  using (public.is_admin(id));

-- members
drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
  using (public.is_member(board_id));

drop policy if exists members_insert on public.members;
create policy members_insert on public.members for insert to authenticated
  with check (
    public.is_admin(board_id)
    or (user_id = auth.uid() and exists (
      select 1 from public.invites i
      where i.board_id = members.board_id and i.email = (select u.email from public.users u where u.id = auth.uid())
    ))
  );

drop policy if exists members_update on public.members;
create policy members_update on public.members for update to authenticated
  using (public.is_admin(board_id)) with check (public.is_admin(board_id));

drop policy if exists members_delete on public.members;
create policy members_delete on public.members for delete to authenticated
  using (public.is_admin(board_id) or user_id = auth.uid());

-- invites: cualquiera autenticado puede leer una invitación sin usar (va por token)
drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites for select to authenticated
  using (public.is_member(board_id) or accepted_at is null);

drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites for insert to authenticated
  with check (public.is_admin(board_id));

drop policy if exists invites_update on public.invites;
create policy invites_update on public.invites for update to authenticated
  using (public.is_admin(board_id) or accepted_at is null)
  with check (public.is_admin(board_id) or accepted_at is not null);

drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites for delete to authenticated
  using (public.is_admin(board_id));

-- columnas y etiquetas
drop policy if exists columns_select on public.columns;
create policy columns_select on public.columns for select to authenticated using (public.is_member(board_id));
drop policy if exists columns_write on public.columns;
create policy columns_write on public.columns for all to authenticated
  using (public.is_member(board_id)) with check (public.is_member(board_id));

drop policy if exists labels_select on public.labels;
create policy labels_select on public.labels for select to authenticated using (public.is_member(board_id));
drop policy if exists labels_write on public.labels;
create policy labels_write on public.labels for all to authenticated
  using (public.is_member(board_id)) with check (public.is_member(board_id));

-- tarjetas
drop policy if exists cards_select on public.cards;
create policy cards_select on public.cards for select to authenticated using (public.is_member(board_id));
drop policy if exists cards_write on public.cards;
create policy cards_write on public.cards for all to authenticated
  using (public.is_member(board_id)) with check (public.is_member(board_id));

-- relaciones tarjeta-etiqueta y tarjeta-responsable
drop policy if exists card_labels_select on public.card_labels;
create policy card_labels_select on public.card_labels for select to authenticated
  using (public.is_member(public.card_board(card_id)));

drop policy if exists card_labels_write on public.card_labels;
create policy card_labels_write on public.card_labels for all to authenticated
  using (public.is_member(public.card_board(card_id)))
  with check (public.is_member(public.card_board(card_id)));

drop policy if exists card_assignees_select on public.card_assignees;
create policy card_assignees_select on public.card_assignees for select to authenticated
  using (public.is_member(public.card_board(card_id)));

drop policy if exists card_assignees_write on public.card_assignees;
create policy card_assignees_write on public.card_assignees for all to authenticated
  using (public.is_member(public.card_board(card_id)))
  with check (public.is_member(public.card_board(card_id)) or user_id = auth.uid());

-- checklist y comentarios
drop policy if exists items_select on public.items;
create policy items_select on public.items for select to authenticated
  using (public.is_member(public.card_board(card_id)));

drop policy if exists items_write on public.items;
create policy items_write on public.items for all to authenticated
  using (public.is_member(public.card_board(card_id)))
  with check (public.is_member(public.card_board(card_id)));

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (public.is_member(public.card_board(card_id)));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.is_member(public.card_board(card_id)));

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin(public.card_board(card_id)));

-- actividad
drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity for select to authenticated using (public.is_member(board_id));

drop policy if exists activity_insert on public.activity;
create policy activity_insert on public.activity for insert to authenticated
  with check (actor_id = auth.uid() and public.is_member(board_id));
