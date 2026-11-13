-- 037_products_catalog.sql
-- Persist the product catalog (was a hardcoded client-side list, so UI add/edit/delete
-- was lost on reload). DB-backed table, seeded with the existing catalog.
-- Safe to re-run (idempotent).

create table if not exists public.products (
  id         text primary key,
  name       text not null,
  sizes      jsonb not null default '[]'::jsonb,
  colors     jsonb not null default '[]'::jsonb,
  cuts       jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
drop policy if exists "Authenticated read products" on public.products;
create policy "Authenticated read products" on public.products for select using (is_authenticated());
drop policy if exists "Admin/logistics manage products ins" on public.products;
create policy "Admin/logistics manage products ins" on public.products for insert with check (get_my_role() = any (array['admin','logistics']));
drop policy if exists "Admin/logistics manage products upd" on public.products;
create policy "Admin/logistics manage products upd" on public.products for update using (get_my_role() = any (array['admin','logistics']));
drop policy if exists "Admin/logistics manage products del" on public.products;
create policy "Admin/logistics manage products del" on public.products for delete using (get_my_role() = any (array['admin','logistics']));

insert into public.products (id,name,sizes,colors,cuts,created_at) values
('p1','Essentials Snatched Bodysuit Bodyshaper','["S", "M", "L", "XL", "2XL", "3XL"]'::jsonb,'["Beige", "Black"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '1 second'),
('p2','Strapless Bodysuit Bodyshaper','["S", "M", "L", "XL"]'::jsonb,'["Beige", "Black"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '2 second'),
('p3','Essentials Mid Thigh Bodysuit Bodyshaper','["S", "M", "L", "XL"]'::jsonb,'["Beige", "Black"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '3 second'),
('p4','Essentials Cap Sleeves Playsuit Bodyshaper','["S", "M", "L", "XL"]'::jsonb,'["Beige", "Black"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '4 second'),
('p5','Intense Snatched Bodyshaper','["XS-S", "M-L", "XL-2XL", "3XL-4XL", "5XL-6XL", "7XL-8XL"]'::jsonb,'["Beige", "Black", "Brown", "Red", "Y2K Pink"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '5 second'),
('p6','Intense Mid Thigh Bodyshaper','["XS-S", "M-L", "XL-2XL", "3XL-4XL", "5XL-6XL", "7XL-8XL"]'::jsonb,'["Beige", "Black", "Brown"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '6 second'),
('p7','Full Sleeves Bare Bodysuit','["XS", "S", "M", "L", "XL", "2XL", "3XL"]'::jsonb,'["Beige", "Black", "Brown"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '7 second'),
('p8','Cap Sleeves Bare Bodysuit','["XS", "S", "M", "L", "XL", "2XL", "3XL"]'::jsonb,'["Beige", "Black", "Brown"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '8 second'),
('p9','Sleeveless Bare Bodysuit','["XS", "S", "M", "L", "XL", "2XL", "3XL"]'::jsonb,'["Beige", "Black", "Brown"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '9 second'),
('p10','Intense Strapless Bodyshaper','["S", "M", "L", "XL"]'::jsonb,'["Beige", "Black"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '10 second'),
('p11','Non Padded Wireless Shaping Bra','["XS", "S", "M", "L", "XL"]'::jsonb,'["Beige", "Black"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '11 second'),
('p12','Everyday Seamless Lightly Padded Bra','["S", "M", "L", "XL"]'::jsonb,'["Pink", "Rust"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '12 second'),
('p13','No-Wire Push Up Bra','["S", "M", "L", "XL"]'::jsonb,'["Black", "Blush", "White"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '13 second'),
('p14','Essentials Plus Bodysuit Bodyshaper','["S-M", "L-XL", "2XL-3XL", "4XL-5XL"]'::jsonb,'["Beige", "Black", "Cream"]'::jsonb,'["Brief Style", "Mid Thigh"]'::jsonb, timestamp '2020-01-01' + interval '14 second'),
('p15','Intense High Waisted Shaper Shorts','["XS", "S", "M", "L", "XL"]'::jsonb,'["Beige", "Black"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '15 second'),
('p16','High Compression Tummy Tucker','["S", "M", "L", "XL", "2XL", "3XL"]'::jsonb,'["Brief Cut - High Rise", "Mid Thigh - Mid Rise"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '16 second'),
('p17','Zipper Shapewear Swimsuit','["S", "M", "L", "XL", "2XL", "3XL"]'::jsonb,'[]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '17 second'),
('p18','Plunge Neck Shapewear Swimsuit','["XS", "S", "M", "L", "XL", "2XL", "3XL"]'::jsonb,'[]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '18 second'),
('p19','Thong: Malaika X Invogue','["S", "M", "L", "XL", "2XL", "3XL"]'::jsonb,'["Black", "Olive", "Red", "Pink"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '19 second'),
('p20','Tank Bodysuit Bodyshaper','["XS/S", "M/L", "XL/2XL", "3XL/4XL"]'::jsonb,'["Brown", "White"]'::jsonb,'[]'::jsonb, timestamp '2020-01-01' + interval '20 second')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
