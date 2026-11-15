-- POS 1: sales rights, settings, barcode and ticket columns, suspended sales, training source.
-- Nothing here is reachable from the API roles; the sales-api edge function (service role) is the only caller.

-- Rights.
alter table public.board_users
  add column can_view_sales  boolean not null default false,
  add column can_post_sales  boolean not null default false,
  add column can_void_sales  boolean not null default false,
  add column can_manage_till boolean not null default false;
alter table public.editor_sessions add column can_use_sales boolean not null default false;

-- Barcodes.
alter table public.ops_pieces add column barcode text;
alter table public.cat_pieces add column barcode text;

-- Ticket columns, training source, card type.
alter table public.ops_tickets
  add column receipt_text text,
  add column walk_in      boolean not null default false,
  add column void_reason  text,
  add column voided_by    text,
  add column voided_at    timestamptz;
alter table public.ops_tickets drop constraint ops_tickets_source_check;
alter table public.ops_tickets add constraint ops_tickets_source_check
  check (source in ('colibri', 'delardi', 'training'));
alter table public.ops_ticket_payments add column card_type text;
alter table public.ops_ticket_payments add constraint ops_ticket_payments_card_type_check
  check (card_type is null or card_type in ('uzcard', 'humo', 'visa'));

-- Settings (singleton) and its change log.
create table public.pos_settings (
  id             smallint primary key default 1 check (id = 1),
  mode           text not null default 'training' check (mode in ('training', 'live')),
  go_live_date   date,
  vat_pct        numeric(5,2) not null default 0,
  cash_notice_uzs bigint not null default 170000000,
  shop_address   text not null default '',
  updated_at     timestamptz,
  updated_by     text
);
create table public.pos_settings_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  actor     text not null,
  field     text not null,
  old_value text,
  new_value text
);

-- Suspended sales. One suspended sale per piece per mode.
create table public.pos_drafts (
  draft_id   bigint generated always as identity primary key,
  mode       text not null check (mode in ('training', 'live')),
  client_id  text references public.crm_clients(client_id),
  walk_in    boolean not null default false,
  seller     text,
  fiscal_ref text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create table public.pos_draft_lines (
  draft_id     bigint not null references public.pos_drafts(draft_id) on delete cascade,
  line_no      int not null,
  piece_id     uuid not null references public.ops_pieces(piece_id),
  price_uzs    bigint not null,
  discount_pct numeric(5,2) not null default 0,
  seller       text,
  mode         text not null,
  primary key (draft_id, line_no),
  unique (mode, piece_id)
);

create sequence public.pos_ticket_no_seq;
create sequence public.pos_training_no_seq;

insert into public.pos_settings (id) values (1);

alter table public.pos_settings     enable row level security;
alter table public.pos_settings_log enable row level security;
alter table public.pos_drafts       enable row level security;
alter table public.pos_draft_lines  enable row level security;
revoke all on public.pos_settings, public.pos_settings_log, public.pos_drafts, public.pos_draft_lines
  from public, anon, authenticated;
revoke all on sequence public.pos_settings_log_id_seq, public.pos_drafts_draft_id_seq,
  public.pos_ticket_no_seq, public.pos_training_no_seq from public, anon, authenticated;

-- Mode switch: logs the change; go_live_date is set the first time the mode becomes live and never cleared.
create function public.pos_set_mode(p_mode text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.pos_settings%rowtype;
begin
  if p_mode is null or p_mode not in ('training', 'live') then
    raise exception 'mode must be training or live';
  end if;
  select * into s from public.pos_settings where id = 1 for update;
  insert into public.pos_settings_log(actor, field, old_value, new_value)
    values (coalesce(nullif(btrim(p_actor), ''), 'unknown'), 'mode', s.mode, p_mode);
  update public.pos_settings
     set mode = p_mode,
         go_live_date = coalesce(go_live_date,
                                 case when p_mode = 'live' then (now() at time zone 'Asia/Tashkent')::date end),
         updated_at = now(), updated_by = p_actor
   where id = 1
   returning * into s;
  return jsonb_build_object('mode', s.mode, 'go_live_date', s.go_live_date);
end $$;
revoke execute on function public.pos_set_mode(text, text) from public, anon, authenticated;

-- Training tickets stay out of the monthly totals (same view as 20261113_s3_2, plus the filter).
drop view public.ops_ticket_monthly;
create view public.ops_ticket_monthly with (security_invoker = true) as
select date_trunc('month', t.sold_at)::date as month,
       count(*) as tickets,
       coalesce(sum(l.sale_lines), 0)::bigint as sale_lines,
       coalesce(sum(l.refund_lines), 0)::bigint as refund_lines,
       coalesce(sum(l.net), 0) as net,
       coalesce(sum(p.card), 0) as card,
       coalesce(sum(p.visa), 0) as visa,
       coalesce(sum(l.net), 0) - coalesce(sum(p.card), 0) - coalesce(sum(p.visa), 0) as unrecorded
  from ops_tickets t
  left join (select ticket_id,
                    count(*) filter (where kind = 'sale') sale_lines,
                    count(*) filter (where kind = 'refund') refund_lines,
                    sum(case kind when 'refund' then -net else net end) net
               from ops_ticket_lines group by ticket_id) l using (ticket_id)
  left join (select ticket_id,
                    sum(amount) filter (where method = 'card') card,
                    sum(amount) filter (where method = 'visa') visa
               from ops_ticket_payments group by ticket_id) p using (ticket_id)
 where t.source <> 'training'
 group by 1;
revoke all on public.ops_ticket_monthly from public, anon, authenticated;

-- Alex runs the till.
update public.board_users
   set can_view_sales = true, can_post_sales = true, can_void_sales = true, can_manage_till = true
 where name = 'Alex';
