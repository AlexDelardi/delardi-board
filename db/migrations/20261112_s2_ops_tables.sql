-- Sprint 2, migration 1A: operational tables, first store, manage-stock right.
-- Spec: docs/specs/2026-11-11-s2-foundation-design.md §4, §5 (board_users).

create table public.ops_stores (
  store_id   smallint primary key,
  code       text not null unique,
  name       text not null,
  address    text,
  active     boolean not null default true,
  opened_on  date
);
insert into public.ops_stores(store_id, code, name, address)
values (1, 'BKH26', 'Delardi Boutique', 'Bukhara 26, Tashkent');

create table public.ops_tickets (
  ticket_id   uuid primary key default gen_random_uuid(),
  store_id    smallint not null references public.ops_stores(store_id),
  source      text not null check (source in ('colibri', 'delardi')),
  ticket_no   text not null,
  sold_at     date not null,
  seller      text,
  seller_raw  text,
  client_id   text references public.crm_clients(client_id),
  card_no     text,
  entered_by  text,
  note        text,
  fiscal_ref  text,
  status      text not null default 'posted' check (status in ('posted', 'void')),
  source_file text,
  loaded_at   timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (store_id, source, ticket_no)
);

create table public.ops_pieces (
  piece_id       uuid primary key default gen_random_uuid(),
  store_id       smallint not null references public.ops_stores(store_id),
  brand          text not null,
  serial         text not null,
  article        text,
  model_id       text,
  variant_id     text,
  size           text,
  state          text not null check (state in ('in_transit', 'in_stock', 'reserved', 'booked_out', 'damaged', 'sold')),
  state_since    timestamptz not null default now(),
  hold_client_id text references public.crm_clients(client_id),
  hold_until     date,
  state_note     text,
  first_seen_at  timestamptz not null default now(),
  last_seen_run  bigint,
  last_seen_at   timestamptz,
  sold_line_id   uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index ops_pieces_live_serial on public.ops_pieces (brand, upper(btrim(serial))) where state <> 'sold';
create index ops_pieces_serial_key on public.ops_pieces (upper(btrim(serial)));

create table public.ops_ticket_lines (
  line_id       uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references public.ops_tickets(ticket_id) on delete cascade,
  line_no       int not null,
  kind          text not null default 'sale' check (kind in ('sale', 'refund')),
  article       text,
  item_name     text,
  size          text,
  model_id      text,
  variant_id    text,
  piece_id      uuid references public.ops_pieces(piece_id),
  serial_raw    text,
  qty           int not null default 1,
  price_list    numeric(14,0),
  price_current numeric(14,0),
  discount_pct  numeric(6,4),
  discount_amt  numeric(14,0),
  net           numeric(14,0),
  unique (ticket_id, line_no)
);
create index ops_ticket_lines_piece on public.ops_ticket_lines (piece_id);
create index ops_ticket_lines_serial on public.ops_ticket_lines (upper(btrim(serial_raw)));

alter table public.ops_pieces
  add constraint ops_pieces_sold_line_fkey foreign key (sold_line_id) references public.ops_ticket_lines(line_id);

create table public.ops_ticket_payments (
  payment_id bigint generated always as identity primary key,
  ticket_id  uuid not null references public.ops_tickets(ticket_id) on delete cascade,
  method     text not null check (method in ('cash', 'card', 'visa', 'qr', 'transfer', 'other')),
  amount     numeric(14,0) not null,
  raw        text
);

create table public.ops_piece_events (
  event_id   bigint generated always as identity primary key,
  piece_id   uuid not null references public.ops_pieces(piece_id),
  at         timestamptz not null default now(),
  from_state text,
  to_state   text not null,
  reason     text not null check (reason in ('initial_load', 'arrived', 'sold', 'refunded', 'reserved', 'released',
                 'booked_out', 'returned_from_loan', 'damaged', 'repaired', 'review_resolved', 'serial_reused')),
  ref_kind   text check (ref_kind in ('cat_run', 'ticket_line', 'review', 'manual')),
  ref_id     text,
  actor      text not null,
  note       text
);
create index ops_piece_events_piece on public.ops_piece_events (piece_id, at);

create function public.ops_piece_events_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'ops_piece_events is append-only';
end $$;
create trigger ops_piece_events_immutable before update or delete on public.ops_piece_events
  for each row execute function public.ops_piece_events_immutable();

create table public.ops_review (
  review_id   bigint generated always as identity primary key,
  piece_id    uuid not null references public.ops_pieces(piece_id),
  kind        text not null check (kind in ('missing_from_export', 'serial_reused', 'ticket_conflict')),
  raised_at   timestamptz not null default now(),
  raised_run  bigint,
  status      text not null default 'open' check (status in ('open', 'resolved', 'auto_closed')),
  resolution  text check (resolution in ('sold', 'damaged', 'booked_out', 'still_in_stock')),
  resolved_by text,
  resolved_at timestamptz,
  note        text
);
create unique index ops_review_open on public.ops_review (piece_id, kind) where status = 'open';

-- manage-stock right: Alex only (spec §5)
alter table public.board_users add column can_manage_stock boolean not null default false;
update public.board_users set can_manage_stock = true where name = 'Alex';

-- same protection as every existing table: RLS on, no policies, nothing for the public roles
alter table public.ops_stores          enable row level security;
alter table public.ops_tickets         enable row level security;
alter table public.ops_pieces          enable row level security;
alter table public.ops_ticket_lines    enable row level security;
alter table public.ops_ticket_payments enable row level security;
alter table public.ops_piece_events    enable row level security;
alter table public.ops_review          enable row level security;
revoke all on public.ops_stores, public.ops_tickets, public.ops_pieces, public.ops_ticket_lines,
              public.ops_ticket_payments, public.ops_piece_events, public.ops_review
  from anon, authenticated;
revoke all on sequence public.ops_ticket_payments_payment_id_seq, public.ops_piece_events_event_id_seq,
              public.ops_review_review_id_seq
  from anon, authenticated;
revoke execute on function public.ops_piece_events_immutable() from public, anon, authenticated;
