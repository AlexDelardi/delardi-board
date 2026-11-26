-- "Newest arrivals": the arrival date decides on its own. Having a piece in transit no longer
-- lifts a design above newer stock (a June design with one piece in transit sat above the
-- October delivery). Pieces only in transit still come after pieces in the boutique.
do $$
declare d text := pg_get_functiondef('public.cat_filter_v2(jsonb)'::regprocedure); e text;
begin
  e := replace(d, $q$case when p_request->>'sort'='newest' then x.has_transit end desc nulls last,$q$, '');
  if e = d then raise exception 'cat_filter_v2 is not in the expected shape; nothing changed'; end if;
  execute e;
end $$;
