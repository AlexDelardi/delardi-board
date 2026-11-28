-- A till sale goes by the number it was posted under (ops_tickets.display_no: its Colibri receipt number while Colibri
-- numbers are the main ones). Performance, the Stock piece page and "Who bought it" in the Catalogue now show that
-- number too, as the till already does. Sales without one keep their own number.
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('public.perf_tickets(date,date,smallint)'::regprocedure);
  n := replace(d, 'select o.ticket_id, o.ticket_no, o.sold_at,', 'select o.ticket_id, coalesce(o.display_no, o.ticket_no) ticket_no, o.sold_at,');
  if n = d then raise exception 'perf_tickets not patched as expected'; end if;
  execute n;
  d := pg_get_functiondef('public.stk_piece_detail(uuid)'::regprocedure);
  n := replace(d, '''ticket_no'', t.ticket_no', '''ticket_no'', coalesce(t.display_no, t.ticket_no)');
  if (length(n) - length(d)) <> 2 * (length('coalesce(t.display_no, t.ticket_no)') - length('t.ticket_no')) then raise exception 'stk_piece_detail not patched as expected'; end if;
  execute n;
  d := pg_get_functiondef('public.cat_model_buyers(text)'::regprocedure);
  n := replace(d, '''ticket_no'', k.ticket_no,', '''ticket_no'', coalesce(k.display_no, k.ticket_no),');
  if n = d then raise exception 'cat_model_buyers not patched as expected'; end if;
  execute n;
end $do$;
