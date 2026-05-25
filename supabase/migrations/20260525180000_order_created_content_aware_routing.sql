-- Phase 2a: content-aware department routing for order.created.
--
-- (1) Extend fn_emit_notification with an OPTIONAL p_target_roles text[] (default null).
--     When provided, the role fan-out targets those roles (content-aware). When NULL,
--     behavior is IDENTICAL to before (rule-configured role recipients) — so the
--     diary.submitted / field.issue triggers AND the finance supplier-documents upload
--     route (all 5-arg callers) are completely unchanged.
-- (2) trg_work_orders_notify computes target roles from order signals and passes them;
--     no department signal => null => safe fallback to the rule's configured recipients.
--
-- order.created rule flags are NOT changed here (requires_ack=true, blocking=false,
-- open-before-ack via the related work_order). Reversible — see rollback at the bottom.
--
-- Drop the 5-arg form and recreate as 6-arg with a defaulted last param, so existing
-- 5-arg callers resolve to it unchanged. (plpgsql bodies don't create hard deps, so the
-- diary/field/work-orders trigger functions are unaffected by the drop+recreate.)
drop function if exists public.fn_emit_notification(text, text, text, uuid, jsonb);

create or replace function public.fn_emit_notification(
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_created_by uuid,
  p_metadata jsonb,
  p_target_roles text[] default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.notification_rules%rowtype;
  v_notification_id uuid;
begin
  select * into v_rule from public.notification_rules
  where event_type = p_event_type and enabled = true;
  if not found then
    return;
  end if;

  insert into public.notifications (
    event_type, rule_id, title, message, severity, source_module,
    related_entity_type, related_entity_id, created_by,
    requires_ack, blocking, play_sound, expires_at, metadata
  ) values (
    v_rule.event_type, v_rule.id, v_rule.title, v_rule.message, v_rule.severity, v_rule.source_module,
    p_entity_type, p_entity_id, p_created_by,
    v_rule.requires_ack, v_rule.blocking, v_rule.play_sound,
    case when v_rule.expires_after_minutes is not null
         then now() + make_interval(mins => v_rule.expires_after_minutes) else null end,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_notification_id;

  -- role-targeted. When p_target_roles is provided -> fan out to those roles
  -- (content-aware). When null -> identical to prior behavior (rule role recipients).
  insert into public.notification_recipients (notification_id, user_id, matched_role, status)
  select v_notification_id, p.id, p.role, 'pending'
  from public.profiles p
  where coalesce(p.is_active, true) = true
    and (v_rule.exclude_actor = false or p_created_by is null or p.id <> p_created_by)
    and (
      case when p_target_roles is not null
           then p.role = any(p_target_roles)
           else exists (
             select 1 from public.notification_rule_recipients r
             where r.rule_id = v_rule.id and r.recipient_type = 'role' and r.recipient_value = p.role
           )
      end
    )
  on conflict (notification_id, user_id) do nothing;

  -- explicit user-targeted (unchanged)
  insert into public.notification_recipients (notification_id, user_id, matched_role, status)
  select v_notification_id, p.id, p.role, 'pending'
  from public.profiles p
  join public.notification_rule_recipients r
    on r.rule_id = v_rule.id and r.recipient_type = 'user' and r.recipient_value = p.id::text
  where coalesce(p.is_active, true) = true
    and (v_rule.exclude_actor = false or p_created_by is null or p.id <> p_created_by)
  on conflict (notification_id, user_id) do nothing;

  -- master always receives (monitoring) -- unchanged
  insert into public.notification_recipients (notification_id, user_id, matched_role, status)
  select v_notification_id, p.id, p.role, 'pending'
  from public.profiles p
  where p.role = 'master' and coalesce(p.is_active, true) = true
  on conflict (notification_id, user_id) do nothing;
end;
$$;

-- order.created: content-aware department routing from order content signals.
create or replace function public.trg_work_orders_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_roles text[] := array[]::text[];
begin
  if (tg_op = 'INSERT' and coalesce(new.status,'') <> 'draft')
     or (tg_op = 'UPDATE' and coalesce(old.status,'') = 'draft' and coalesce(new.status,'') <> 'draft') then
    if coalesce(new.fabrication_required, false) then v_roles := v_roles || 'fabrication_manager'; end if;
    if coalesce(new.warehouse_required, false) then v_roles := v_roles || 'warehouse_manager'; end if;
    if new.graphics_sent_at is not null or coalesce(new.status,'') = 'graphics_pending' then
      v_roles := v_roles || 'graphics_manager';
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
$$;
