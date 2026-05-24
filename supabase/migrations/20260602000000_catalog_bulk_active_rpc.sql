-- Bulk active/inactive toggle for catalog_items.
-- Activating clears the imported-batch review flag (metadata.review_state = 'needs_review').
-- Deactivating never re-adds it. Only is_active + updated_at + that one metadata key change.
create or replace function set_catalog_active(p_ids text[], p_active boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update catalog_items
  set is_active  = p_active,
      updated_at = now(),
      metadata   = case when p_active then metadata - 'review_state' else metadata end
  where id = any(p_ids);
$$;

grant execute on function set_catalog_active(text[], boolean) to authenticated;
