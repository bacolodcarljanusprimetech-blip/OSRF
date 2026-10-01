create table if not exists public.supply_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  category text not null default 'General',
  unit text not null default 'piece',
  quantity integer not null default 0 check (quantity >= 0),
  is_available boolean not null default false check (not is_available or quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.supply_items enable row level security;

grant select, insert, update, delete on public.supply_items to authenticated;
revoke all on public.supply_items from anon;

drop policy if exists "Admins can manage supply items" on public.supply_items;
create policy "Admins can manage supply items"
on public.supply_items
for all
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'ADMIN')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'ADMIN');

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists departments_name_lower_idx
  on public.departments (lower(name));

alter table public.departments enable row level security;
revoke all on public.departments from public;
revoke insert, update, delete on public.departments from anon;
grant select on public.departments to anon, authenticated;
grant insert, update, delete on public.departments to authenticated;

drop policy if exists "Anyone can read active departments" on public.departments;
create policy "Anyone can read active departments"
on public.departments for select to anon, authenticated
using (is_active);

drop policy if exists "Admins can manage departments" on public.departments;
create policy "Admins can manage departments"
on public.departments for all to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'ADMIN')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'ADMIN');

insert into public.departments (name)
values ('Marketing'), ('Finance'), ('HR'), ('Legal')
on conflict do nothing;

alter table public.supply_items
  add column if not exists description text not null default '';

create table if not exists public.supply_attributes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists supply_attributes_name_lower_idx
  on public.supply_attributes (lower(name));

create table if not exists public.supply_item_attributes (
  item_id uuid not null references public.supply_items(id) on delete cascade,
  attribute_id uuid not null references public.supply_attributes(id) on delete cascade,
  is_required boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (item_id, attribute_id)
);

create table if not exists public.supply_item_attribute_values (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  attribute_id uuid not null,
  value text not null check (char_length(trim(value)) > 0),
  created_at timestamptz not null default now(),
  foreign key (item_id, attribute_id)
    references public.supply_item_attributes(item_id, attribute_id)
    on delete cascade
);

create unique index if not exists supply_item_attribute_values_unique_idx
  on public.supply_item_attribute_values (item_id, attribute_id, lower(value));

alter table public.supply_attributes enable row level security;
alter table public.supply_item_attributes enable row level security;
alter table public.supply_item_attribute_values enable row level security;

revoke all on public.supply_attributes, public.supply_item_attributes, public.supply_item_attribute_values from anon;
grant select, insert, update, delete on public.supply_attributes, public.supply_item_attributes, public.supply_item_attribute_values to authenticated;

drop policy if exists "Admins can manage supply attributes" on public.supply_attributes;
create policy "Admins can manage supply attributes"
on public.supply_attributes for all to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'ADMIN')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'ADMIN');

drop policy if exists "Admins can manage item attributes" on public.supply_item_attributes;
create policy "Admins can manage item attributes"
on public.supply_item_attributes for all to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'ADMIN')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'ADMIN');

drop policy if exists "Admins can manage item attribute values" on public.supply_item_attribute_values;
create policy "Admins can manage item attribute values"
on public.supply_item_attribute_values for all to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'ADMIN')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'ADMIN');

insert into public.supply_attributes (name)
values ('Brand'), ('Color'), ('Size'), ('Material'), ('Model'), ('Type')
on conflict do nothing;

create or replace function public.search_requestable_supply_items(search_text text default null)
returns table (
  id uuid,
  name text,
  category text,
  description text,
  unit text,
  attributes jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    item.id,
    item.name,
    item.category,
    item.description,
    item.unit,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', attribute.id,
        'name', attribute.name,
        'required', item_attribute.is_required,
        'values', coalesce((
          select jsonb_agg(attribute_value.value order by attribute_value.value)
          from public.supply_item_attribute_values as attribute_value
          where attribute_value.item_id = item.id
            and attribute_value.attribute_id = attribute.id
        ), '[]'::jsonb)
      ) order by attribute.name)
      from public.supply_item_attributes as item_attribute
      join public.supply_attributes as attribute on attribute.id = item_attribute.attribute_id
      where item_attribute.item_id = item.id
        and attribute.is_active
    ), '[]'::jsonb) as attributes
  from public.supply_items as item
  where item.is_available and item.quantity > 0
    and (
      coalesce(trim(search_text), '') = ''
      or concat_ws(' ',
        item.name,
        item.category,
        item.description,
        coalesce((
          select string_agg(attribute.name || ' ' || attribute_value.value, ' ')
          from public.supply_item_attributes as item_attribute
          join public.supply_attributes as attribute on attribute.id = item_attribute.attribute_id
          left join public.supply_item_attribute_values as attribute_value
            on attribute_value.item_id = item_attribute.item_id
            and attribute_value.attribute_id = item_attribute.attribute_id
          where item_attribute.item_id = item.id
            and attribute.is_active
        ), '')
      ) ilike '%' || trim(search_text) || '%'
    )
  order by item.name;
$function$;

revoke all on function public.search_requestable_supply_items(text) from public;
grant execute on function public.search_requestable_supply_items(text) to anon, authenticated;

create or replace function public.replace_supply_item_attributes(
  p_item_id uuid,
  p_attributes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  attribute_data jsonb;
  attribute_id uuid;
  value_text text;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'ADMIN' then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_attributes, '[]'::jsonb)) <> 'array' then
    raise exception 'Attributes must be provided as an array.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.supply_items where id = p_item_id) then
    raise exception 'Supply item not found.' using errcode = 'P0002';
  end if;

  delete from public.supply_item_attributes where item_id = p_item_id;

  for attribute_data in
    select entry.value
    from jsonb_array_elements(coalesce(p_attributes, '[]'::jsonb)) as entry(value)
  loop
    attribute_id := (attribute_data ->> 'attribute_id')::uuid;

    if not exists (
      select 1 from public.supply_attributes
      where id = attribute_id and is_active
    ) then
      raise exception 'An attribute is missing or inactive.' using errcode = '22023';
    end if;

    insert into public.supply_item_attributes (item_id, attribute_id, is_required)
    values (
      p_item_id,
      attribute_id,
      coalesce((attribute_data ->> 'is_required')::boolean, false)
    );

    for value_text in
      select entry.value
      from jsonb_array_elements_text(coalesce(attribute_data -> 'values', '[]'::jsonb)) as entry(value)
    loop
      if char_length(trim(value_text)) > 0 then
        insert into public.supply_item_attribute_values (item_id, attribute_id, value)
        values (p_item_id, attribute_id, trim(value_text))
        on conflict do nothing;
      end if;
    end loop;
  end loop;
end;
$function$;

revoke all on function public.replace_supply_item_attributes(uuid, jsonb) from public;
grant execute on function public.replace_supply_item_attributes(uuid, jsonb) to authenticated;

create table if not exists public.supply_requests (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  requestor_name text not null check (char_length(trim(requestor_name)) > 0),
  department text not null check (char_length(trim(department)) > 0),
  remarks text not null default '',
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'RECEIVED')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supply_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.supply_requests(id) on delete cascade,
  supply_item_id uuid not null references public.supply_items(id) on delete restrict,
  item_name text not null,
  unit text not null,
  quantity integer not null check (quantity > 0),
  attributes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.supply_request_number_counter (
  counter_name text primary key check (counter_name = 'supply_request'),
  last_number bigint not null default 0 check (last_number >= 0)
);

insert into public.supply_request_number_counter (counter_name, last_number)
values ('supply_request', 0)
on conflict (counter_name) do nothing;

alter table public.supply_requests enable row level security;
alter table public.supply_request_items enable row level security;
alter table public.supply_request_number_counter enable row level security;
revoke all on public.supply_requests, public.supply_request_items, public.supply_request_number_counter from public, anon, authenticated;

create or replace function public.submit_supply_request(
  p_requestor_name text,
  p_department text,
  p_remarks text,
  p_items jsonb
)
returns table (request_id uuid, reference_code text, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request_id uuid := gen_random_uuid();
  v_reference_code text;
  v_request_number bigint;
  v_created_at timestamptz;
  v_month text;
  v_department text;
  v_line jsonb;
  v_item_id uuid;
  v_quantity integer;
  v_total_item_quantity integer;
  v_available_quantity integer;
  v_item_available boolean;
  v_item_name text;
  v_unit text;
  v_request_attributes jsonb;
  v_attribute_snapshot jsonb;
begin
  if char_length(trim(coalesce(p_requestor_name, ''))) not between 2 and 120 then
    raise exception 'Enter a requestor name between 2 and 120 characters.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_department, ''))) not between 2 and 120 then
    raise exception 'Enter a department between 2 and 120 characters.' using errcode = '22023';
  end if;
  select department.name into v_department
  from public.departments as department
  where lower(department.name) = lower(trim(p_department))
    and department.is_active;
  if v_department is null then
    raise exception 'Select an active department.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_remarks, '')) > 1000 then
    raise exception 'Remarks must be 1000 characters or fewer.' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Request items must be provided as an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'A request must contain between 1 and 20 item lines.' using errcode = '22023';
  end if;

  update public.supply_request_number_counter as counter
  set last_number = counter.last_number + 1
  where counter.counter_name = 'supply_request'
  returning counter.last_number into v_request_number;

  if v_request_number is null then
    raise exception 'Request number counter is not initialized.' using errcode = '55000';
  end if;

  v_created_at := clock_timestamp();
  v_month := to_char(v_created_at at time zone 'Asia/Manila', 'MM');
  v_reference_code := v_month || '-' || lpad(v_request_number::text, 3, '0');

  insert into public.supply_requests (
    id, reference_code, requestor_name, department, remarks, status, created_at, updated_at
  ) values (
    v_request_id, v_reference_code, trim(p_requestor_name), v_department,
    coalesce(trim(p_remarks), ''), 'PENDING', v_created_at, v_created_at
  );

  for v_line in select entry.value from jsonb_array_elements(p_items) as entry(value)
  loop
    v_item_id := (v_line ->> 'supply_item_id')::uuid;
    v_quantity := (v_line ->> 'quantity')::integer;
    v_request_attributes := coalesce(v_line -> 'attributes', '{}'::jsonb);

    if v_quantity is null or v_quantity < 1 or v_quantity > 10000 then
      raise exception 'Each item quantity must be between 1 and 10000.' using errcode = '22023';
    end if;
    if jsonb_typeof(v_request_attributes) <> 'object' then
      raise exception 'Item attributes must be an object.' using errcode = '22023';
    end if;

    select item.name, item.unit, item.quantity, item.is_available
    into v_item_name, v_unit, v_available_quantity, v_item_available
    from public.supply_items as item
    where item.id = v_item_id
    for share;

    if not found then
      raise exception 'The requested item is no longer in the catalog.' using errcode = '22023';
    end if;
    if not v_item_available or v_available_quantity < 1 then
      raise exception 'STOCK_UNAVAILABLE: "%" is no longer available to request.', v_item_name
        using errcode = '22023', detail = 'UNAVAILABLE|' || v_item_id::text || '|' || v_item_name;
    end if;

    select coalesce(sum((entry.value ->> 'quantity')::integer), 0)
    into v_total_item_quantity
    from jsonb_array_elements(p_items) as entry(value)
    where (entry.value ->> 'supply_item_id')::uuid = v_item_id;

    if v_total_item_quantity > v_available_quantity then
      raise exception 'STOCK_UNAVAILABLE: "%" has only % in stock, but % were requested.',
        v_item_name, v_available_quantity, v_total_item_quantity
        using errcode = '22023',
          detail = 'INSUFFICIENT|' || v_item_id::text || '|' || v_item_name || '|' || v_available_quantity::text || '|' || v_total_item_quantity::text;
    end if;

    if exists (
      select 1
      from public.supply_item_attributes as item_attribute
      join public.supply_attributes as attribute on attribute.id = item_attribute.attribute_id
      where item_attribute.item_id = v_item_id
        and item_attribute.is_required
        and attribute.is_active
        and nullif(trim(v_request_attributes ->> item_attribute.attribute_id::text), '') is null
    ) then
      raise exception 'Complete all required details for each item.' using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_each_text(v_request_attributes) as supplied(attribute_id, value)
      where trim(supplied.value) <> ''
        and not exists (
          select 1
          from public.supply_item_attributes as item_attribute
          join public.supply_attributes as attribute on attribute.id = item_attribute.attribute_id
          where item_attribute.item_id = v_item_id
            and item_attribute.attribute_id = supplied.attribute_id::uuid
            and attribute.is_active
        )
    ) then
      raise exception 'An item contains an unsupported attribute.' using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'name', attribute.name,
      'value', coalesce(v_request_attributes ->> item_attribute.attribute_id::text, ''),
      'required', item_attribute.is_required
    ) order by attribute.name), '[]'::jsonb)
    into v_attribute_snapshot
    from public.supply_item_attributes as item_attribute
    join public.supply_attributes as attribute on attribute.id = item_attribute.attribute_id
    where item_attribute.item_id = v_item_id and attribute.is_active;

    insert into public.supply_request_items (
      request_id, supply_item_id, item_name, unit, quantity, attributes
    ) values (
      v_request_id, v_item_id, v_item_name, v_unit, v_quantity, v_attribute_snapshot
    );
  end loop;

  return query select v_request_id, v_reference_code, 'PENDING'::text, v_created_at;
end;
$function$;

revoke all on function public.submit_supply_request(text, text, text, jsonb) from public;
grant execute on function public.submit_supply_request(text, text, text, jsonb) to anon, authenticated;

drop function if exists public.track_supply_request(text);
create function public.track_supply_request(p_reference_code text)
returns table (reference_code text, status text, created_at timestamptz, rejection_reason text)
language sql
stable
security definer
set search_path = ''
as $function$
  select request.reference_code, request.status, request.created_at,
    case when request.status = 'REJECTED' then request.rejection_reason else null end
  from public.supply_requests as request
  where request.reference_code = upper(trim(coalesce(p_reference_code, '')))
  limit 1;
$function$;

revoke all on function public.track_supply_request(text) from public;
grant execute on function public.track_supply_request(text) to anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('ADMIN', 'APPROVER', 'RECEIVER')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant all on public.profiles to service_role;

alter table public.supply_requests
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists received_by uuid references public.profiles(id) on delete set null,
  add column if not exists received_at timestamptz;

create or replace function public.get_approver_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_actor_id is null
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'APPROVER'
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'is_active', 'true') = 'false'
    or not exists (
      select 1 from public.profiles
      where id = v_actor_id and role = 'APPROVER' and is_active
    ) then
    raise exception 'Active approver access is required.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'total_requests', count(*),
      'pending_requests', count(*) filter (where request.status = 'PENDING'),
      'approved_requests', count(*) filter (where request.status = 'APPROVED'),
      'rejected_requests', count(*) filter (where request.status = 'REJECTED'),
      'received_requests', count(*) filter (where request.status = 'RECEIVED'),
      'requests_today', count(*) filter (where (request.created_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date),
      'unique_requestors', count(distinct (lower(request.requestor_name), lower(request.department))),
      'units_requested', coalesce((
        select sum(line.quantity) from public.supply_request_items as line
      ), 0)
    ),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object('department', summary.department, 'request_count', summary.request_count)
                       order by summary.request_count desc, summary.department)
      from (
        select request.department, count(*) as request_count
        from public.supply_requests as request
        group by request.department
        order by count(*) desc, request.department
        limit 8
      ) as summary
    ), '[]'::jsonb),
    'top_requestors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', summary.requestor_name,
        'department', summary.department,
        'request_count', summary.request_count
      ) order by summary.request_count desc, summary.requestor_name)
      from (
        select request.requestor_name, request.department, count(*) as request_count
        from public.supply_requests as request
        group by request.requestor_name, request.department
        order by count(*) desc, request.requestor_name
        limit 8
      ) as summary
    ), '[]'::jsonb),
    'top_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', summary.item_name,
        'quantity', summary.quantity,
        'request_count', summary.request_count
      ) order by summary.quantity desc, summary.item_name)
      from (
        select line.item_name, sum(line.quantity) as quantity, count(*) as request_count
        from public.supply_request_items as line
        group by line.item_name
        order by sum(line.quantity) desc, line.item_name
        limit 8
      ) as summary
    ), '[]'::jsonb),
    'inventory_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'name', item.name,
        'category', item.category,
        'description', item.description,
        'unit', item.unit,
        'quantity', item.quantity,
        'is_available', item.is_available
      ) order by lower(item.name), item.id)
      from public.supply_items as item
    ), '[]'::jsonb),
    'pending_queue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', request.id,
        'reference_code', request.reference_code,
        'requestor_name', request.requestor_name,
        'department', request.department,
        'remarks', request.remarks,
        'status', request.status,
        'created_at', request.created_at,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', line.item_name,
            'unit', line.unit,
            'quantity', line.quantity,
            'attributes', line.attributes,
            'is_available', coalesce((select item.is_available from public.supply_items as item where item.id = line.supply_item_id), false),
            'available_quantity', coalesce((select item.quantity from public.supply_items as item where item.id = line.supply_item_id), 0)
          ) order by line.created_at)
          from public.supply_request_items as line
          where line.request_id = request.id
        ), '[]'::jsonb)
      ) order by request.created_at)
      from public.supply_requests as request
      where request.status = 'PENDING'
    ), '[]'::jsonb),
    'review_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', request.id,
        'reference_code', request.reference_code,
        'requestor_name', request.requestor_name,
        'department', request.department,
        'remarks', request.remarks,
        'status', request.status,
        'rejection_reason', request.rejection_reason,
        'created_at', request.created_at,
        'reviewed_at', request.reviewed_at,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', line.item_name,
            'unit', line.unit,
            'quantity', line.quantity,
            'attributes', line.attributes,
            'is_available', coalesce((select item.is_available from public.supply_items as item where item.id = line.supply_item_id), false),
            'available_quantity', coalesce((select item.quantity from public.supply_items as item where item.id = line.supply_item_id), 0)
          ) order by line.created_at)
          from public.supply_request_items as line
          where line.request_id = request.id
        ), '[]'::jsonb)
      ) order by request.reviewed_at desc nulls last)
      from public.supply_requests as request
      where request.status <> 'PENDING'
    ), '[]'::jsonb)
  ) into v_result
  from public.supply_requests as request;

  return coalesce(v_result, jsonb_build_object(
    'metrics', jsonb_build_object(
      'total_requests', 0, 'pending_requests', 0, 'approved_requests', 0,
      'rejected_requests', 0, 'received_requests', 0, 'requests_today', 0,
      'unique_requestors', 0, 'units_requested', 0
    ),
    'departments', '[]'::jsonb,
    'top_requestors', '[]'::jsonb,
    'top_items', '[]'::jsonb,
    'inventory_items', '[]'::jsonb,
    'pending_queue', '[]'::jsonb,
    'review_history', '[]'::jsonb
  ));
end;
$function$;

create or replace function public.review_supply_request(
  p_request_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_reference_code text;
begin
  if v_actor_id is null
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'APPROVER'
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'is_active', 'true') = 'false'
    or not exists (
      select 1 from public.profiles
      where id = v_actor_id and role = 'APPROVER' and is_active
    ) then
    raise exception 'Active approver access is required.' using errcode = '42501';
  end if;

  if p_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'Choose approve or reject.' using errcode = '22023';
  end if;
  if p_decision = 'REJECTED' and char_length(trim(coalesce(p_rejection_reason, ''))) < 3 then
    raise exception 'Enter a rejection reason of at least 3 characters.' using errcode = '22023';
  end if;

  update public.supply_requests as request
  set status = p_decision,
      rejection_reason = case when p_decision = 'REJECTED' then trim(p_rejection_reason) else null end,
      reviewed_by = v_actor_id,
      reviewed_at = now(),
      updated_at = now()
  where request.id = p_request_id and request.status = 'PENDING'
  returning request.reference_code into v_reference_code;

  if v_reference_code is null then
    raise exception 'This request is no longer pending or does not exist.' using errcode = '22023';
  end if;

  return v_reference_code;
end;
$function$;

create or replace function public.get_receiver_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'RECEIVER'
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'is_active', 'true') = 'false'
    or not exists (
      select 1 from public.profiles
      where id = v_actor_id and role = 'RECEIVER' and is_active
    ) then
    raise exception 'Active receiver access is required.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'approved_count', (select count(*) from public.supply_requests where status = 'APPROVED'),
    'received_count', (select count(*) from public.supply_requests where status = 'RECEIVED'),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', request.id,
        'reference_code', request.reference_code,
        'requestor_name', request.requestor_name,
        'department', request.department,
        'remarks', request.remarks,
        'created_at', request.created_at,
        'reviewed_at', request.reviewed_at,
        'approver_name', (select profile.full_name from public.profiles as profile where profile.id = request.reviewed_by),
        'received_at', request.received_at,
        'receiver_name', (select profile.full_name from public.profiles as profile where profile.id = request.received_by),
        'status', request.status,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', line.item_name,
            'unit', line.unit,
            'quantity', line.quantity,
            'attributes', line.attributes
          ) order by line.created_at)
          from public.supply_request_items as line
          where line.request_id = request.id
        ), '[]'::jsonb)
      ) order by request.created_at)
      from public.supply_requests as request
      where request.status in ('APPROVED', 'RECEIVED')
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.mark_supply_request_received(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_reference_code text;
  v_request_status text;
  v_line record;
  v_available_quantity integer;
begin
  if v_actor_id is null
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'RECEIVER'
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'is_active', 'true') = 'false'
    or not exists (
      select 1 from public.profiles
      where id = v_actor_id and role = 'RECEIVER' and is_active
    ) then
    raise exception 'Active receiver access is required.' using errcode = '42501';
  end if;

  select request.reference_code, request.status
  into v_reference_code, v_request_status
  from public.supply_requests as request
  where request.id = p_request_id
  for update;

  if not found or v_request_status <> 'APPROVED' then
    raise exception 'Only approved requests can be marked received.' using errcode = '22023';
  end if;

  for v_line in
    select line.supply_item_id, sum(line.quantity)::integer as requested_quantity,
      max(line.item_name) as item_name
    from public.supply_request_items as line
    where line.request_id = p_request_id
    group by line.supply_item_id
    order by line.supply_item_id
  loop
    select item.quantity
    into v_available_quantity
    from public.supply_items as item
    where item.id = v_line.supply_item_id
    for update;

    if not found then
      raise exception 'Supply item "%" no longer exists in inventory.', v_line.item_name
        using errcode = '22023';
    end if;
    if v_available_quantity < v_line.requested_quantity then
      raise exception 'STOCK_UNAVAILABLE: "%" has only % in stock, but % were requested.',
        v_line.item_name, v_available_quantity, v_line.requested_quantity
        using errcode = '22023';
    end if;

    update public.supply_items as item
    set quantity = item.quantity - v_line.requested_quantity,
        is_available = case
          when item.quantity - v_line.requested_quantity = 0 then false
          else item.is_available
        end,
        updated_at = now()
    where item.id = v_line.supply_item_id;
  end loop;

  update public.supply_requests as request
  set status = 'RECEIVED', received_by = v_actor_id, received_at = now(), updated_at = now()
  where request.id = p_request_id
  returning request.reference_code into v_reference_code;

  return v_reference_code;
end;
$function$;

revoke all on function public.get_approver_dashboard() from public;
revoke all on function public.review_supply_request(uuid, text, text) from public;
revoke all on function public.get_receiver_dashboard() from public;
revoke all on function public.mark_supply_request_received(uuid) from public;
grant execute on function public.get_approver_dashboard() to authenticated;
grant execute on function public.review_supply_request(uuid, text, text) to authenticated;
grant execute on function public.get_receiver_dashboard() to authenticated;
grant execute on function public.mark_supply_request_received(uuid) to authenticated;
