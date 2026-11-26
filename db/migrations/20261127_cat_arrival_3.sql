-- Arrival dates also refresh when pieces change: a Stock-tool import links pieces to their
-- receipt after writing the receipt, and a sale moves a piece out of stock. One statement
-- trigger on ops_pieces covers both (the refresh reads ~700 rows, so it is cheap).
drop trigger if exists ops_pieces_arrival on public.ops_pieces;
create trigger ops_pieces_arrival after insert or update of receipt_id, state, model_id or delete on public.ops_pieces
  for each statement execute function public.cat_refresh_arrival_dates_trg();
