-- BUG FIX (found by the 50-order simulation, 2026-05-30): trg_work_orders_notify
-- appends role literals to a text[] WITHOUT a ::text cast:
--   v_roles := v_roles || 'warehouse_manager';
-- Postgres resolves `text[] || unknown-literal` as array||array and tries to cast
-- the literal to text[], throwing: malformed array literal: "warehouse_manager".
-- Result: INSERT/UPDATE of a non-draft work_order that routes to fabrication /
-- warehouse / graphics ROLLS BACK — blocking order creation/promotion for those
-- departments. Reproduced: seeding a work_order with warehouse_required=true failed.
--
-- FIX: cast each appended literal to ::text so it is treated as an array element.
--
-- ⚠️ NOT auto-applied. Review then `supabase db push`. Low-risk (corrects the
-- append to the intended behavior; no schema/data change). Recommended before the
-- 50-order simulation and for production order-flow correctness.

CREATE OR REPLACE FUNCTION public.trg_work_orders_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_roles text[] := array[]::text[];
begin
  if (tg_op = 'INSERT' and coalesce(new.status,'') <> 'draft')
     or (tg_op = 'UPDATE' and coalesce(old.status,'') = 'draft' and coalesce(new.status,'') <> 'draft') then
    if coalesce(new.fabrication_required, false) then v_roles := v_roles || 'fabrication_manager'::text; end if;
    if coalesce(new.warehouse_required, false) then v_roles := v_roles || 'warehouse_manager'::text; end if;
    if new.graphics_sent_at is not null or coalesce(new.status,'') = 'graphics_pending' then
      v_roles := v_roles || 'graphics_manager'::text;
    end if;
    perform public.fn_emit_notification(
      'order.created', 'work_order', new.id::text, null,
      jsonb_build_object(
        'order_number', new.order_number, 'status', new.status,
        'fabrication_required', coalesce(new.fabrication_required, false),
        'warehouse_required', coalesce(new.warehouse_required, false)
      ),
      case when array_length(v_roles, 1) >= 1 then v_roles else null end
    );
  end if;
  return new;
end;
$function$;
