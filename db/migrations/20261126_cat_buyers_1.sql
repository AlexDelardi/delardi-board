-- "Who bought it" on the Catalogue's item page.
--
-- Every recorded client purchase of a design (crm_transactions matched to the Catalogue by cat_link_transactions),
-- newest first, with what the ticket adds where the purchase came through one: size, serial, ticket number.
-- Read only. catalogue-api calls it for people with the right to see clients and shows everyone else the count.
-- Voided and training tickets are left out. A client merged into another record points at the record that stayed.

create or replace function public.cat_model_buyers(p_model text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(r order by r->>'sold_at' desc, (r->>'id')::bigint desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', t.id,
      'sold_at', t.sold_at,
      'client_id', coalesce(nullif(c.merged_into, ''), t.client_id),
      'client_name', coalesce(qm.display_name, q.display_name),
      'related_party', coalesce(c.related_party, false),
      'seller', coalesce(rp.label, t.advisor),
      'variant_id', t.cat_variant_id,
      'size', l.size,
      'serial', l.serial_raw,
      'qty', t.qty,
      'net_uzs', t.net_uzs,
      'ticket_id', k.ticket_id,
      'ticket_no', k.ticket_no) r
    from crm_transactions t
    left join crm_clients c on c.client_id = t.client_id
    left join crm_queue q on q.client_id = t.client_id
    left join crm_queue qm on qm.client_id = nullif(c.merged_into, '')
    left join crm_sales_reps rp on rp.source_name = t.advisor
    left join ops_ticket_lines l on l.line_id = t.ticket_line_id
    left join ops_tickets k on k.ticket_id = l.ticket_id
    where t.cat_model_id = p_model
      and (k.ticket_id is null or (k.status = 'posted' and k.source <> 'training'))
  ) x
$$;
revoke execute on function public.cat_model_buyers(text) from public, anon, authenticated;
