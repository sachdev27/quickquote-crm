create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  quote_no text not null,
  customer_id uuid references public.customers(id) on delete set null,
  quote_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','sent','won','lost')),
  gst_rate numeric not null default 18,
  raw_rate_kg numeric not null default 0,
  production_cost_kg numeric not null default 0,
  transport_kg numeric not null default 0,
  margin_pct numeric not null default 0,
  extra_charges numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  standard text not null,
  size text not null,
  dr text not null,
  od_in numeric,
  weight_lbft numeric,
  weight_kgm numeric,
  length_ft numeric not null default 20,
  pieces integer not null default 1,
  sell_rate_kg numeric not null default 0,
  created_at timestamptz not null default now()
);

create table public.settings (
  user_id uuid primary key,
  company_name text,
  company_address text,
  company_phone text,
  company_gstin text,
  default_raw_rate_kg numeric not null default 0,
  default_production_kg numeric not null default 0,
  default_transport_kg numeric not null default 0,
  default_margin_pct numeric not null default 0,
  default_gst_rate numeric not null default 18,
  updated_at timestamptz not null default now()
);

create unique index quotes_user_quote_no_idx on public.quotes (user_id, quote_no);
create index quotes_user_idx on public.quotes (user_id, created_at desc);
create index customers_user_idx on public.customers (user_id);
create index quote_items_quote_idx on public.quote_items (quote_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO authenticated;
GRANT ALL ON public.quote_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_owner_all" ON public.customers FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "quotes_owner_all" ON public.quotes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "quote_items_owner_all" ON public.quote_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.user_id = auth.uid()));
CREATE POLICY "settings_owner_all" ON public.settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());