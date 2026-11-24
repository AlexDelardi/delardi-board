-- CRM cockpit: who may look at a colleague's cockpit.
-- A sales rep opens her own. A login with this right may choose any rep's (and the shared list's); it is for the
-- director, the store manager and marketing. Set per person; nobody has it by default.
alter table public.board_users add column if not exists can_view_all_cockpits boolean not null default false;
comment on column public.board_users.can_view_all_cockpits is 'CRM cockpit: may choose whose cockpit to look at. Without it a login sees only its own (crm_rep_label).';
