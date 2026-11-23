-- CRM cockpit: a message sent on the day of the purchase counts as the follow-up.
-- Before, only a contact on a later day did, so a thank-you logged the same day left the client on the follow-up list.
-- The visit in which the purchase was made is not a follow-up: a same-day contact logged as a visit still leaves it open.
do $mig$
declare src text;
begin
  select pg_get_functiondef('public.crm_cockpit(text,date,integer)'::regprocedure) into src;
  if position('m.last_contact_on <= b.sold_at)' in src) = 0 then raise exception 'crm_cockpit is not in the shape this change expects'; end if;
  src := replace(src, 'm.last_contact_on <= b.sold_at)',
    'm.last_contact_on < b.sold_at or (m.last_contact_on = b.sold_at and m.last_contact_channel = ''visit''))');
  execute src;
end $mig$;
revoke execute on function public.crm_cockpit(text, date, integer) from public, anon, authenticated;
