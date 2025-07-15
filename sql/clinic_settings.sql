-- Criação da tabela de configurações por clínica
create table public.clinic_settings (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  google_calendar_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Atualização automática do campo 'updated_at'
create or replace function update_updated_at_column()
returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

create trigger set_timestamp
before update on public.clinic_settings
for each row
execute procedure update_updated_at_column();

-- (Opcional) Permitir leitura/edição via policies no Supabase (se usar diretamente no frontend)
alter table clinic_settings enable row level security;

create policy "Permitir leitura do settings da clínica"
on clinic_settings for select
using (clinic_id = (select clinic_id from public.profiles where id = auth.uid()));

create policy "Permitir update do settings da clínica"
on clinic_settings for update
using (clinic_id = (select clinic_id from public.profiles where id = auth.uid()));
