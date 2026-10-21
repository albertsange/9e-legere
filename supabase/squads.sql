-- Squads of the 9e (run once in Supabase > SQL Editor; already included in schema.sql)
insert into public.squads (name) values
  ('1er Escouade - France'), ('2e Escouade - Belgium'), ('3e Escouade - Italy'), ('4e Escouade - Germany'),
  ('5e Escouade - Catalonia'), ('6e Escouade - England'), ('7e Escouade - Catalonia 2'), ('8e Escouade - Russia')
on conflict (name) do nothing;
