-- Starter player seed generated from the Star Man sheet in:
-- Premier League Predictions 2025-26.xlsx
--
-- This is not the full Premier League player pool.
-- It only creates players who already appear in your workbook's Star Man selections.
-- Team assignments still need to be imported separately.

with player_seed(display_name) as (
  values
    ('Alexander Isak'),
    ('Amad Diallo'),
    ('Amine Adli'),
    ('Andrey Santos'),
    ('Andy Robertson'),
    ('Antoine Semenyo'),
    ('Benjamin Sesko'),
    ('Bernardo Silva'),
    ('Brajan Gruda'),
    ('Brian Brobbey'),
    ('Bruno Fernandes'),
    ('Bryan Mbuembo'),
    ('Bukayo Saka'),
    ('Callum Hudson-Odoi'),
    ('Chris Wood'),
    ('Cole Palmer'),
    ('Crysencio Summerville'),
    ('Curtis Jones'),
    ('Dango Ouattara'),
    ('Danny Welbeck'),
    ('Declan Rice'),
    ('Dominic Calvert Lewin'),
    ('Dominik Szoboszlai'),
    ('Eberechi Eze'),
    ('Eli Junior Kroupi'),
    ('Emi Buendia'),
    ('Enzo Le Fée'),
    ('Erling Haaland'),
    ('Evanilson'),
    ('Florian Wirtz'),
    ('Georginio Rutter'),
    ('Harvey Barnes'),
    ('Hugo Ekitike'),
    ('Hwang Hee-Chan'),
    ('Igor Thiago'),
    ('Iliman Ndiaye'),
    ('Ismaïla Sarr'),
    ('Jack Grealish'),
    ('Jack Hinshelwood'),
    ('Jacob Ramsey'),
    ('Jaidon Anthony'),
    ('Jarrad Bowen'),
    ('Jean-Philipe Mateta'),
    ('Jeremy Doku'),
    ('Joao Pedro'),
    ('Justin Kluivert'),
    ('Kevin Schade'),
    ('Leandro Trossard'),
    ('Lesley Ugochukwu'),
    ('Lukas Nmecha'),
    ('Marc Cucurella'),
    ('Matheus Cunha'),
    ('Mathys Tel'),
    ('Michael Kayode'),
    ('Mohamed Salah'),
    ('Morgan Rogers'),
    ('Nick Woltemade'),
    ('Nico O''Reilly'),
    ('Noah Okafor'),
    ('Omari Hutchinson'),
    ('Oscar Bobb'),
    ('Phil Foden'),
    ('Rayan'),
    ('Rayan Cherki'),
    ('Richarlison'),
    ('Rodri'),
    ('Tammy Abraham'),
    ('Tolu Arokodare'),
    ('Tomáš Souček'),
    ('Tyler Dibling'),
    ('Valentín Castellanos'),
    ('Viktor Gyokeres')
)
insert into public.players (display_name)
select player_seed.display_name
from player_seed
where not exists (
  select 1
  from public.players existing
  where existing.display_name = player_seed.display_name
);

select
  count(*) as total_players,
  count(*) filter (where team_id is null) as players_without_current_team
from public.players;
