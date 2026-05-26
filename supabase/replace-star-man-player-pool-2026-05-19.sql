-- Replace the selectable Star Man player pool from a pasted Name - Team - Country - Height list.
--
-- Safe behaviour:
-- - Updates matching existing players in place so existing Star Man picks and player stats keep their player_id.
-- - Inserts genuinely missing players.
-- - Deactivates old selectable players that are not in the new list.
-- - Keeps any Gameweek 37 Star Man picks or non-zero Gameweek 37 player stats active if they did not match the new list,
--   so no already-entered league data disappears.
-- - Updates height_cm so Power of the Lanky Crouch and Power of the Small and Mighty can work.

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

drop table if exists pg_temp.raw_star_man_roster;
create temp table raw_star_man_roster (
  raw_line text not null
);

insert into raw_star_man_roster (raw_line)
select trim(line)
from regexp_split_to_table($roster$
Name - Team - Country - Height
David Raya - Arsenal - Spain - 183
William Saliba - Arsenal - France - 192
Cristhian Mosquera - Arsenal - Spain - 188
Ben White - Arsenal - England - 186
Piero Hincapié - Arsenal - Ecuador - 184
Gabriel Magalhães - Arsenal - Brazil - 190
Bukayo Saka - Arsenal - England - 178
Martin Ødegaard - Arsenal - Norway - 178
Gabriel Jesus - Arsenal - Brazil - 175
Eberechi Eze - Arsenal - England - 178
Gabriel Martinelli - Arsenal - Brazil - 178
Jurriën Timber - Arsenal - Netherlands - 179
Kepa Arrizabalaga - Arsenal - Spain - 189
Viktor Gyökeres - Arsenal - Sweden - 187
Christian Nørgaard - Arsenal - Denmark - 187
Leandro Trossard - Arsenal - Belgium - 172
Noni Madueke - Arsenal - England - 182
Ethan Nwaneri - Arsenal - England - 176
Mikel Merino - Arsenal - Spain - 189
Kai Havertz - Arsenal - Germany - 193
Riccardo Calafiori - Arsenal - Italy - 188
Tommy Setford - Arsenal - England - 185
Martín Zubimendi - Arsenal - Spain - 181
Declan Rice - Arsenal - England - 188
Myles Lewis-Skelly - Arsenal - England - 178
Jaden Dixon - Arsenal - England - 187
Max Dowman - Arsenal - England - 183
Andre Harriman-Annous - Arsenal - England - 181
Ife Ibrahim - Arsenal - England - 183
Brando Bailey-Joseph - Arsenal - England - 176
Marli Salmon - Arsenal - England - 188
Matty Cash - Aston Villa - Poland - 185
Victor Lindelöf - Aston Villa - Sweden - 187
Ezri Konsa - Aston Villa - England - 183
Tyrone Mings - Aston Villa - England - 196
Ross Barkley - Aston Villa - England - 189
John McGinn - Aston Villa - Scotland - 178
Youri Tielemans - Aston Villa - Belgium - 176
Harvey Elliott - Aston Villa - England - 170
Emiliano Buendía - Aston Villa - Argentina - 172
Ollie Watkins - Aston Villa - England - 180
Lucas Digne - Aston Villa - France - 178
Pau Torres - Aston Villa - Spain - 191
Andrés García - Aston Villa - Spain - 186
Tammy Abraham - Aston Villa - England - 194
Jadon Sancho - Aston Villa - England - 180
Douglas Luiz - Aston Villa - Brazil - 175
Ian Maatsen - Aston Villa - Netherlands - 167
Emiliano Martínez - Aston Villa - Argentina - 195
Amadou Onana - Aston Villa - Belgium - 192
Lamare Bogarde - Aston Villa - Netherlands - 183
Morgan Rogers - Aston Villa - England - 187
Leon Bailey - Aston Villa - Jamaica - 178
Marco Bizot - Aston Villa - Netherlands - 194
Boubacar Kamara - Aston Villa - France - 184
Alysson - Aston Villa - Brazil - 175
George Hemmings - Aston Villa - England - 180
Bradley Burrowes - Aston Villa - England - 178
Donyell Malen - Aston Villa - Netherlands - 179
Jamaldeen Jimoh-Aloba - Aston Villa - England - 180
Kadan Young - Aston Villa - England - 176
Đorđe Petrović - Bournemouth - Serbia - 194
Adrien Truffert - Bournemouth - France - 176
Lewis Cook - Bournemouth - England - 175
Marcos Senesi - Bournemouth - Argentina - 185
Julio Soler - Bournemouth - Argentina - 176
David Brooks - Bournemouth - Wales - 180
Alex Scott - Bournemouth - England - 178
Evanilson - Bournemouth - Brazil - 183
Ryan Christie - Bournemouth - Scotland - 178
Ben Gannon-Doak - Bournemouth - Scotland - 175
Tyler Adams - Bournemouth - United States - 175
Adam Smith - Bournemouth - England - 174
Marcus Tavernier - Bournemouth - England - 178
Bafodé Diakité - Bournemouth - France - 185
Justin Kluivert - Bournemouth - Netherlands - 172
Álex Jiménez - Bournemouth - Spain - 176
Amine Adli - Bournemouth - Morocco - 174
Eli Junior Kroupi - Bournemouth - France - 179
James Hill - Bournemouth - England - 184
Enes Ünal - Bournemouth - Turkey - 187
Alex Tóth - Bournemouth - Hungary - 188
Rayan - Bournemouth - Brazil - 176
Veljko Milosavljević - Bournemouth - Serbia - 188
Remy Rees-Dottin - Bournemouth - England - 180
Julián Araujo - Bournemouth - Mexico - 181
Hamed Traorè - Bournemouth - Ivory Coast - 177
Ben Winterburn - Bournemouth - England - 175
Caoimhín Kelleher - Brentford - Republic of Ireland - 188
Aaron Hickey - Brentford - Scotland - 178
Rico Henry - Brentford - England - 170
Sepp van den Berg - Brentford - Netherlands - 189
Ethan Pinnock - Brentford - Jamaica - 194
Jordan Henderson - Brentford - England - 187
Kevin Schade - Brentford - Germany - 185
Mathias Jensen - Brentford - Denmark - 180
Igor Thiago - Brentford - Brazil - 191
Josh Dasilva - Brentford - England - 184
Reiss Nelson - Brentford - England - 175
Hákon Valdimarsson - Brentford - Iceland - 195
Fábio Carvalho - Brentford - Portugal - 170
Frank Onyeka - Brentford - Nigeria - 183
Antoni Milambo - Brentford - Netherlands - 179
Yehor Yarmolyuk - Brentford - Ukraine - 180
Dango Ouattara - Brentford - Burkina Faso - 177
Kristoffer Ajer - Brentford - Norway - 198
Nathan Collins - Brentford - Republic of Ireland - 193
Keane Lewis-Potter - Brentford - England - 170
Mikkel Damsgaard - Brentford - Denmark - 176
Myles Peart-Harris - Brentford - England - 187
Yunus Konak - Brentford - Turkey - 181
Vitaly Janelt - Brentford - Germany - 184
Michael Kayode - Brentford - Italy - 179
Gustavo Nunes - Brentford - Brazil - 178
Benjamin Arthur - Brentford - England - 188
Romelle Donovan - Brentford - England - 178
Kaye Furo - Brentford - Belgium - 186
Luka Bentt - Brentford - Belgium - 182
Bart Verbruggen - Brighton & Hove Albion - Netherlands - 194
Igor - Brighton & Hove Albion - Brazil - 185
Lewis Dunk - Brighton & Hove Albion - England - 192
Jan Paul van Hecke - Brighton & Hove Albion - Netherlands - 189
Solly March - Brighton & Hove Albion - England - 180
Brajan Gruda - Brighton & Hove Albion - Germany - 178
Stefanos Tzimas - Brighton & Hove Albion - Greece - 186
Georginio Rutter - Brighton & Hove Albion - France - 182
Yankuba Minteh - Brighton & Hove Albion - Gambia - 180
Jack Hinshelwood - Brighton & Hove Albion - England - 181
Tom Watson - Brighton & Hove Albion - England - 178
Carlos Baleba - Brighton & Hove Albion - Cameroon - 179
Danny Welbeck - Brighton & Hove Albion - England - 185
Charalampos Kostoulas - Brighton & Hove Albion - Greece - 186
James Milner - Brighton & Hove Albion - England - 175
Olivier Boscagli - Brighton & Hove Albion - France - 181
Kaoru Mitoma - Brighton & Hove Albion - Japan - 178
Jason Steele - Brighton & Hove Albion - England - 188
Ferdi Kadıoğlu - Brighton & Hove Albion - Turkey - 174
Diego Gómez - Brighton & Hove Albion - Paraguay - 185
Yasin Ayari - Brighton & Hove Albion - Sweden - 172
Mats Wieffer - Brighton & Hove Albion - Netherlands - 188
Maxim De Cuyper - Brighton & Hove Albion - Belgium - 182
Pascal Groß - Brighton & Hove Albion - Germany - 181
Matt O'Riley - Brighton & Hove Albion - Denmark - 189
Joël Veltman - Brighton & Hove Albion - Netherlands - 184
Diego Coppola - Brighton & Hove Albion - Italy - 191
Charlie Tasker - Brighton & Hove Albion - England - 180
Harry Howell - Brighton & Hove Albion - England - 179
Nehemiah Oriola - Brighton & Hove Albion - England - 185
Joe Knight - Brighton & Hove Albion - England - 178
Martin Dúbravka - Burnley - Slovakia - 190
Kyle Walker - Burnley - England - 183
Quilindschy Hartman - Burnley - Netherlands - 183
Joe Worrall - Burnley - England - 193
Maxime Estève - Burnley - France - 193
Axel Tuanzebe - Burnley - DR Congo - 186
Jacob Bruun Larsen - Burnley - Denmark - 183
Lesley Ugochukwu - Burnley - France - 191
Lyle Foster - Burnley - South Africa - 185
Marcus Edwards - Burnley - England - 168
Jaidon Anthony - Burnley - England - 183
Bashir Humphreys - Burnley - England - 186
Max Weiß - Burnley - Germany - 190
Florentino Luís - Burnley - Portugal - 184
Loum Tchaouna - Burnley - France - 180
Hjalmar Ekdal - Burnley - Sweden - 188
Zian Flemming - Burnley - Netherlands - 185
Aaron Ramsey - Burnley - Wales - 180
Oliver Sonne - Burnley - Peru - 184
Lucas Pires - Burnley - Brazil - 182
Josh Cullen - Burnley - Republic of Ireland - 175
Zeki Amdouni - Burnley - Switzerland - 185
Armando Broja - Burnley - Albania - 191
Hannibal Mejbri - Burnley - Tunisia - 177
Josh Laurent - Burnley - England - 188
Mike Trésor - Burnley - Belgium - 172
Jaydon Banel - Burnley - Netherlands - 172
Ashley Barnes - Burnley - England - 186
Ellis Clark - Burnley - England - 180
Robert Sánchez - Chelsea - Spain - 197
Marc Cucurella - Chelsea - Spain - 173
Tosin Adarabioyo - Chelsea - England - 196
Benoît Badiashile - Chelsea - France - 194
Levi Colwill - Chelsea - England - 187
Pedro Neto - Chelsea - Portugal - 173
Enzo Fernández - Chelsea - Argentina - 178
Liam Delap - Chelsea - England - 186
Cole Palmer - Chelsea - England - 189
Jamie Gittens - Chelsea - England - 178
Filip Jörgensen - Chelsea - Denmark - 190
Dário Essugo - Chelsea - Portugal - 178
Andrey Santos - Chelsea - Brazil - 180
Mamadou Sarr - Chelsea - France - 194
João Pedro - Chelsea - Brazil - 182
Jorrel Hato - Chelsea - Netherlands - 182
Trevoh Chalobah - Chelsea - England - 190
Reece James - Chelsea - England - 179
Moisés Caicedo - Chelsea - Ecuador - 178
Malo Gusto - Chelsea - France - 179
Wesley Fofana - Chelsea - France - 186
Josh Acheampong - Chelsea - England - 185
Marc Guiu - Chelsea - Spain - 187
Estêvão - Chelsea - Brazil - 176
Roméo Lavia - Chelsea - Belgium - 181
Reggie Walsh - Chelsea - England - 175
Alejandro Garnacho - Chelsea - Argentina - 180
Jesse Derry - Chelsea - England - 174
Shim Mheuka - Chelsea - England - 188
Ryan Kavuma-McQueen - Chelsea - England - 178
Dean Henderson - Crystal Palace - England - 188
Daniel Muñoz - Crystal Palace - Colombia - 183
Tyrick Mitchell - Crystal Palace - England - 175
Maxence Lacroix - Crystal Palace - France - 190
Ismaïla Sarr - Crystal Palace - Senegal - 185
Jefferson Lerma - Crystal Palace - Colombia - 179
Eddie Nketiah - Crystal Palace - England - 175
Yéremy Pino - Crystal Palace - Spain - 172
Christantus Uche - Crystal Palace - Nigeria - 190
Jean-Philippe Mateta - Crystal Palace - France - 192
Nathaniel Clyne - Crystal Palace - England - 175
Daichi Kamada - Crystal Palace - Japan - 184
Will Hughes - Crystal Palace - England - 185
Adam Wharton - Crystal Palace - England - 182
Jørgen Strand Larsen - Crystal Palace - Norway - 193
Jaydee Canvot - Crystal Palace - France - 186
Borna Sosa - Crystal Palace - Croatia - 187
Chris Richards - Crystal Palace - United States - 188
Evann Guessand - Crystal Palace - Ivory Coast - 185
Chadi Riad - Crystal Palace - Morocco - 186
Kaden Rodney - Crystal Palace - England - 188
Walter Benítez - Crystal Palace - Argentina - 191
Justin Devenny - Crystal Palace - Northern Ireland - 182
Rio Cardines - Crystal Palace - Trinidad and Tobago - 183
George King - Crystal Palace - Republic of Ireland - 192
Dean Benamar - Crystal Palace - England - 185
Benjamin Casey - Crystal Palace - England - 178
Joél Drakes-Thomas - Crystal Palace - England - 178
Romain Esse - Crystal Palace - England - 178
Odsonne Édouard - Crystal Palace - France - 187
Jordan Pickford - Everton - England - 185
Nathan Patterson - Everton - Scotland - 183
Michael Keane - Everton - England - 188
James Tarkowski - Everton - England - 185
Dwight McNeil - Everton - England - 183
Beto - Everton - Portugal - 194
Iliman Ndiaye - Everton - Senegal - 180
Thierno Barry - Everton - France - 195
Mark Travers - Everton - Republic of Ireland - 191
Jake O'Brien - Everton - Republic of Ireland - 197
Vitaliy Mykolenko - Everton - Ukraine - 180
Jack Grealish - Everton - England - 180
Tyrique George - Everton - England - 180
Tyler Dibling - Everton - England - 178
Kiernan Dewsbury-Hall - Everton - England - 178
Séamus Coleman - Everton - Republic of Ireland - 177
Charly Alcaraz - Everton - Argentina - 176
Idrissa Gueye - Everton - Senegal - 174
Jarrad Branthwaite - Everton - England - 195
Merlin Röhl - Everton - Germany - 192
James Garner - Everton - England - 182
Adam Aznou - Everton - Morocco - 175
Tim Iroegbunam - Everton - England - 183
Harrison Armstrong - Everton - England - 180
Reece Welch - Everton - England - 198
Elijah Campbell - Everton - England - 186
Bernd Leno - Fulham - Germany - 190
Kenny Tete - Fulham - Netherlands - 180
Calvin Bassey - Fulham - Nigeria - 185
Joachim Andersen - Fulham - Denmark - 192
Harrison Reed - Fulham - England - 181
Raúl Jiménez - Fulham - Mexico - 190
Harry Wilson - Fulham - Wales - 173
Rodrigo Muniz - Fulham - Brazil - 186
Tom Cairney - Fulham - Scotland - 185
Oscar Bobb - Fulham - Norway - 174
Jorge Cuenca - Fulham - Spain - 190
Sander Berge - Fulham - Norway - 195
Alex Iwobi - Fulham - Nigeria - 183
Jonah Kusi-Asare - Fulham - Sweden - 196
Samuel Chukwueze - Fulham - Nigeria - 172
Saša Lukić - Fulham - Serbia - 183
Timothy Castagne - Fulham - Belgium - 185
Kevin - Fulham - Brazil - 176
Benjamin Lecomte - Fulham - France - 186
Josh King - Fulham - England - 175
Ryan Sessegnon - Fulham - England - 178
Issa Diop - Fulham - France - 194
Emile Smith Rowe - Fulham - England - 182
Antonee Robinson - Fulham - United States - 183
Lucas Perri - Leeds United - Brazil - 197
Jayden Bogle - Leeds United - England - 178
Gabriel Gudmundsson - Leeds United - Sweden - 181
Ethan Ampadu - Leeds United - Wales - 182
Pascal Struijk - Leeds United - Netherlands - 190
Joe Rodon - Leeds United - Wales - 193
Daniel James - Leeds United - Wales - 170
Sean Longstaff - Leeds United - England - 181
Dominic Calvert-Lewin - Leeds United - England - 189
Joël Piroe - Leeds United - Netherlands - 185
Brenden Aaronson - Leeds United - United States - 178
Lukas Nmecha - Leeds United - Germany - 185
Jaka Bijol - Leeds United - Slovenia - 190
Anton Stach - Leeds United - Germany - 193
Noah Okafor - Leeds United - Switzerland - 185
Jack Harrison - Leeds United - England - 175
Ao Tanaka - Leeds United - Japan - 180
Sebastiaan Bornauw - Leeds United - Belgium - 191
James Justin - Leeds United - England - 183
Sam Byram - Leeds United - England - 180
Karl Darlow - Leeds United - Wales - 190
Wilfried Gnonto - Leeds United - Italy - 170
Facundo Buonanotte - Leeds United - Argentina - 174
Ilia Gruev - Leeds United - Bulgaria - 185
Alisson - Liverpool - Brazil - 193
Joe Gomez - Liverpool - England - 188
Wataru Endo - Liverpool - Japan - 178
Virgil van Dijk - Liverpool - Netherlands - 195
Ibrahima Konaté - Liverpool - France - 194
Milos Kerkez - Liverpool - Hungary - 180
Florian Wirtz - Liverpool - Germany - 177
Dominik Szoboszlai - Liverpool - Hungary - 186
Alexander Isak - Liverpool - Sweden - 192
Alexis Mac Allister - Liverpool - Argentina - 176
Mohamed Salah - Liverpool - Egypt - 175
Conor Bradley - Liverpool - Northern Ireland - 180
Federico Chiesa - Liverpool - Italy - 175
Giovanni Leoni - Liverpool - Italy - 196
Curtis Jones - Liverpool - England - 185
Cody Gakpo - Liverpool - Netherlands - 193
Hugo Ekitike - Liverpool - France - 190
Giorgi Mamardashvili - Liverpool - Georgia - 197
Andy Robertson - Liverpool - Scotland - 178
Freddie Woodman - Liverpool - England - 188
Jeremie Frimpong - Liverpool - Netherlands - 171
Ryan Gravenberch - Liverpool - Netherlands - 190
Trey Nyoni - Liverpool - England - 180
Calvin Ramsay - Liverpool - Scotland - 177
Kaide Gordon - Liverpool - England - 173
Amara Nallo - Liverpool - England - 193
Kieran Morrison - Liverpool - Northern Ireland - 180
Rio Ngumoha - Liverpool - England - 170
Jayden Danns - Liverpool - England - 183
Wellity Lucky - Liverpool - England - 190
Trent Kone-Doherty - Liverpool - Republic of Ireland - 177
James Trafford - Manchester City - England - 197
Rúben Dias - Manchester City - Portugal - 187
Tijjani Reijnders - Manchester City - Netherlands - 185
John Stones - Manchester City - England - 188
Nathan Aké - Manchester City - Netherlands - 180
Omar Marmoush - Manchester City - Egypt - 183
Mateo Kovačić - Manchester City - Croatia - 177
Erling Haaland - Manchester City - Norway - 195
Rayan Cherki - Manchester City - France - 177
Jérémy Doku - Manchester City - Belgium - 173
Nico González - Manchester City - Spain - 188
Marc Guéhi - Manchester City - England - 182
Rodri - Manchester City - Spain - 191
Bernardo Silva - Manchester City - Portugal - 173
Rayan Aït-Nouri - Manchester City - Algeria - 180
Joško Gvardiol - Manchester City - Croatia - 185
Gianluigi Donnarumma - Manchester City - Italy - 196
Savinho - Manchester City - Brazil - 176
Matheus Nunes - Manchester City - Portugal - 183
Nico O'Reilly - Manchester City - England - 188
Antoine Semenyo - Manchester City - Ghana - 185
Kalvin Phillips - Manchester City - England - 178
Abdukodir Khusanov - Manchester City - Uzbekistan - 186
Phil Foden - Manchester City - England - 171
Ryan McAidoo - Manchester City - England - 175
Charlie Gray - Manchester City - England - 176
Divine Mukasa - Manchester City - England - 178
Max Alleyne - Manchester City - England - 191
Jaden Heskey - Manchester City - England - 183
Rico Lewis - Manchester City - England - 169
Stephen Mfuni - Manchester City - England - 188
Reigan Heskey - Manchester City - England - 180
Altay Bayındır - Manchester United - Turkey - 198
Diogo Dalot - Manchester United - Portugal - 183
Noussair Mazraoui - Manchester United - Morocco - 183
Matthijs de Ligt - Manchester United - Netherlands - 189
Harry Maguire - Manchester United - England - 194
Lisandro Martínez - Manchester United - Argentina - 175
Mason Mount - Manchester United - England - 181
Bruno Fernandes - Manchester United - Portugal - 179
Matheus Cunha - Manchester United - Brazil - 183
Joshua Zirkzee - Manchester United - Netherlands - 193
Tyrell Malacia - Manchester United - Netherlands - 169
Patrick Dorgu - Manchester United - Denmark - 187
Leny Yoro - Manchester United - France - 190
Amad Diallo - Manchester United - Ivory Coast - 173
Casemiro - Manchester United - Brazil - 185
Bryan Mbeumo - Manchester United - Cameroon - 171
Luke Shaw - Manchester United - England - 178
André Onana - Manchester United - Cameroon - 190
Manuel Ugarte - Manchester United - Uruguay - 182
Ayden Heaven - Manchester United - England - 189
Benjamin Šeško - Manchester United - Slovenia - 195
Senne Lammens - Manchester United - Belgium - 193
Tyler Fredricson - Manchester United - England - 185
Kobbie Mainoo - Manchester United - England - 180
Jack Fletcher - Manchester United - England - 180
Tyler Fletcher - Manchester United - England - 182
Shea Lacey - Manchester United - England - 170
Bendito Mantato - Manchester United - England - 179
Nick Pope - Newcastle United - England - 198
Kieran Trippier - Newcastle United - England - 173
Lewis Hall - Newcastle United - England - 178
Sven Botman - Newcastle United - Netherlands - 193
Fabian Schär - Newcastle United - Switzerland - 188
Joelinton - Newcastle United - Brazil - 186
Sandro Tonali - Newcastle United - Italy - 181
Yoane Wissa - Newcastle United - DR Congo - 180
Anthony Gordon - Newcastle United - England - 182
Harvey Barnes - Newcastle United - England - 174
Malick Thiaw - Newcastle United - Germany - 194
Emil Krafth - Newcastle United - Sweden - 184
William Osula - Newcastle United - Denmark - 193
Anthony Elanga - Newcastle United - Sweden - 178
Tino Livramento - Newcastle United - England - 182
Jacob Murphy - Newcastle United - England - 179
Nick Woltemade - Newcastle United - Germany - 198
Joe Willock - Newcastle United - England - 186
Aaron Ramsdale - Newcastle United - England - 191
Dan Burn - Newcastle United - England - 201
Alex Murphy - Newcastle United - Republic of Ireland - 188
Bruno Guimarães - Newcastle United - Brazil - 182
Jacob Ramsey - Newcastle United - England - 180
Leo Shahar - Newcastle United - England - 179
Sean Neave - Newcastle United - England - 185
Lewis Miley - Newcastle United - England - 189
Jamaal Lascelles - Newcastle United - England - 188
Neco Williams - Nottingham Forest - Wales - 183
Morato - Nottingham Forest - Brazil - 192
Murillo - Nottingham Forest - Brazil - 180
Ibrahim Sangaré - Nottingham Forest - Ivory Coast - 191
Callum Hudson-Odoi - Nottingham Forest - England - 182
Elliot Anderson - Nottingham Forest - England - 179
Taiwo Awoniyi - Nottingham Forest - Nigeria - 183
Morgan Gibbs-White - Nottingham Forest - England - 178
Chris Wood - Nottingham Forest - New Zealand - 191
John Victor - Nottingham Forest - Brazil - 197
Dan Ndoye - Nottingham Forest - Switzerland - 184
Nicolás Domínguez - Nottingham Forest - Argentina - 179
Angus Gunn - Nottingham Forest - Scotland - 196
Igor Jesus - Nottingham Forest - Brazil - 179
Lorenzo Lucca - Nottingham Forest - Italy - 201
Omari Hutchinson - Nottingham Forest - Jamaica - 174
Ryan Yates - Nottingham Forest - England - 190
Jair Cunha - Nottingham Forest - Brazil - 198
James McAtee - Nottingham Forest - England - 180
Luca Netz - Nottingham Forest - Germany - 184
Matz Sels - Nottingham Forest - Belgium - 188
Stefan Ortega - Nottingham Forest - Germany - 185
Dilane Bakwa - Nottingham Forest - France - 179
Willy Boly - Nottingham Forest - Ivory Coast - 195
Nikola Milenković - Nottingham Forest - Serbia - 195
Ola Aina - Nottingham Forest - Nigeria - 182
Nicolò Savona - Nottingham Forest - Italy - 192
Zach Abbott - Nottingham Forest - England - 185
Jimmy Sinclair - Nottingham Forest - England - 180
Oleksandr Zinchenko - Nottingham Forest - Ukraine - 175
Arnaud Kalimuendo - Nottingham Forest - France - 175
Jota Silva - Nottingham Forest - Portugal - 179
Dennis Cirkin - Sunderland - England - 182
Daniel Ballard - Sunderland - Northern Ireland - 187
Lutsharel Geertruida - Sunderland - Netherlands - 184
Chemsdine Talbi - Sunderland - Morocco - 175
Brian Brobbey - Sunderland - Netherlands - 180
Nilson Angulo - Sunderland - Ecuador - 182
Chris Rigg - Sunderland - England - 178
Eliezer Mayenda - Sunderland - France - 180
Luke O'Nien - Sunderland - England - 174
Romaine Mundle - Sunderland - England - 180
Omar Alderete - Sunderland - Paraguay - 188
Reinildo Mandava - Sunderland - Mozambique - 180
Wilson Isidor - Sunderland - France - 186
Habib Diarra - Sunderland - Senegal - 179
Nordi Mukiele - Sunderland - France - 187
Robin Roefs - Sunderland - Netherlands - 193
Bertrand Traoré - Sunderland - Burkina Faso - 181
Noah Sadiki - Sunderland - DR Congo - 183
Enzo Le Fée - Sunderland - France - 170
Milan Aleksić - Sunderland - Serbia - 181
Melker Ellborg - Sunderland - Sweden - 194
Trai Hume - Sunderland - Northern Ireland - 180
Granit Xhaka - Sunderland - Switzerland - 186
Jocelin Ta Bi - Sunderland - Ivory Coast - 182
Harrison Jones - Sunderland - England - 180
Jenson Jones - Sunderland - England - 180
Anthony Patterson - Sunderland - England - 189
Niall Huggins - Sunderland - Wales - 173
Dan Neil - Sunderland - England - 183
Jenson Seelt - Sunderland - Netherlands - 192
Simon Adingra - Sunderland - Ivory Coast - 175
Arthur Masuaku - Sunderland - DR Congo - 179
Patrick Roberts - Sunderland - England - 167
Guglielmo Vicario - Tottenham Hotspur - Italy - 194
Radu Drăgușin - Tottenham Hotspur - Romania - 191
Kevin Danso - Tottenham Hotspur - Austria - 190
João Palhinha - Tottenham Hotspur - Portugal - 190
Xavi Simons - Tottenham Hotspur - Netherlands - 179
Yves Bissouma - Tottenham Hotspur - Mali - 182
Richarlison - Tottenham Hotspur - Brazil - 184
James Maddison - Tottenham Hotspur - England - 175
Mathys Tel - Tottenham Hotspur - France - 183
Destiny Udogie - Tottenham Hotspur - Italy - 186
Archie Gray - Tottenham Hotspur - England - 187
Lucas Bergvall - Tottenham Hotspur - Sweden - 187
Cristian Romero - Tottenham Hotspur - Argentina - 185
Dominic Solanke - Tottenham Hotspur - England - 187
Mohammed Kudus - Tottenham Hotspur - Ghana - 177
Conor Gallagher - Tottenham Hotspur - England - 182
Pedro Porro - Tottenham Hotspur - Spain - 173
Djed Spence - Tottenham Hotspur - England - 184
Wilson Odobert - Tottenham Hotspur - France - 182
Pape Matar Sarr - Tottenham Hotspur - Senegal - 185
Rodrigo Bentancur - Tottenham Hotspur - Uruguay - 187
Antonín Kinský - Tottenham Hotspur - Czech Republic - 190
Ben Davies - Tottenham Hotspur - Wales - 181
Micky van de Ven - Tottenham Hotspur - Netherlands - 193
Souza - Tottenham Hotspur - Brazil - 188
Randal Kolo Muani - Tottenham Hotspur - France - 187
Dane Scarlett - Tottenham Hotspur - England - 180
Callum Olusesi - Tottenham Hotspur - England - 178
Jun'ai Byfield - Tottenham Hotspur - England - 188
Lucá Williams-Barnett - Tottenham Hotspur - England - 170
James Rowswell - Tottenham Hotspur - England - 178
Brennan Johnson - Tottenham Hotspur - Wales - 186
Mads Hermansen - West Ham United - Denmark - 187
Kyle Walker-Peters - West Ham United - England - 173
Maximilian Kilman - West Ham United - England - 194
Axel Disasi - West Ham United - France - 190
Crysencio Summerville - West Ham United - Netherlands - 174
Callum Wilson - West Ham United - England - 180
Taty Castellanos - West Ham United - Argentina - 178
El Hadji Malick Diouf - West Ham United - Senegal - 180
Konstantinos Mavropanos - West Ham United - Greece - 194
Adama Traoré - West Ham United - Spain - 178
Mateus Fernandes - West Ham United - Portugal - 178
Pablo - West Ham United - Brazil - 176
Jarrod Bowen - West Ham United - England - 175
Keiber Lamadrid - West Ham United - Venezuela - 176
Alphonse Areola - West Ham United - France - 195
Jean-Clair Todibo - West Ham United - France - 190
Soungoutou Magassa - West Ham United - France - 188
Tomáš Souček - West Ham United - Czech Republic - 192
Aaron Wan-Bissaka - West Ham United - England - 183
Oliver Scarles - West Ham United - England - 183
Freddie Potts - West Ham United - England - 172
Finlay Herrick - West Ham United - England - 186
Mohamadou Kanté - West Ham United - France - 192
Lewis Orford - West Ham United - England - 180
Ezra Mayers - West Ham United - England - 184
Nayef Aguerd - West Ham United - Morocco - 190
Lucas Paquetá - West Ham United - Brazil - 180
Luis Guilherme - West Ham United - Brazil - 175
Guido Rodríguez - West Ham United - Argentina - 185
Andy Irving - West Ham United - Scotland - 190
Igor Julio - West Ham United - Brazil - 185
James Ward-Prowse - West Ham United - England - 177
Niclas Füllkrug - West Ham United - Germany - 189
George Earthy - West Ham United - England - 178
Callum Marshall - West Ham United - Northern Ireland - 180
José Sá - Wolverhampton Wanderers - Portugal - 192
Matt Doherty - Wolverhampton Wanderers - Republic of Ireland - 185
Hugo Bueno - Wolverhampton Wanderers - Spain - 180
Santiago Bueno - Wolverhampton Wanderers - Uruguay - 190
David Møller Wolfe - Wolverhampton Wanderers - Norway - 185
André - Wolverhampton Wanderers - Brazil - 176
João Gomes - Wolverhampton Wanderers - Brazil - 176
Adam Armstrong - Wolverhampton Wanderers - England - 172
Hwang Hee-chan - Wolverhampton Wanderers - South Korea - 177
Tolu Arokodare - Wolverhampton Wanderers - Nigeria - 197
Yerson Mosquera - Wolverhampton Wanderers - Colombia - 188
Pedro Lima - Wolverhampton Wanderers - Brazil - 174
Rodrigo Gomes - Wolverhampton Wanderers - Portugal - 175
Toti Gomes - Wolverhampton Wanderers - Portugal - 187
Dan Bentley - Wolverhampton Wanderers - England - 193
Jean‐Ricner Bellegarde - Wolverhampton Wanderers - France - 172
Sam Johnstone - Wolverhampton Wanderers - England - 193
Mateus Mané - Wolverhampton Wanderers - Portugal - 176
Ladislav Krejčí - Wolverhampton Wanderers - Czech Republic - 191
Jackson Tchatchoua - Wolverhampton Wanderers - Cameroon - 186
Angel Gomes - Wolverhampton Wanderers - England - 168
Tom Edozie - Wolverhampton Wanderers - England - 175
Jhon Arias - Wolverhampton Wanderers - Colombia - 168
Emmanuel Agbadou - Wolverhampton Wanderers - Ivory Coast - 192
Marshall Munetsi - Wolverhampton Wanderers - Zimbabwe - 188
Saša Kalajdžić - Wolverhampton Wanderers - Austria - 200
Tawanda Chirewa - Wolverhampton Wanderers - Zimbabwe - 181
Ki-Jana Hoever - Wolverhampton Wanderers - Netherlands - 180
Fer López - Wolverhampton Wanderers - Spain - 172
$roster$, E'\r?\n') as line
where trim(line) <> ''
  and trim(line) <> 'Name - Team - Country - Height';

do $$
begin
  if exists (
    select 1
    from pg_temp.raw_star_man_roster
    where array_length(string_to_array(raw_line, ' - '), 1) <> 4
  ) then
    raise exception 'Some roster lines are not in Name - Team - Country - Height format: %',
      (
        select string_agg(raw_line, E'\n')
        from pg_temp.raw_star_man_roster
        where array_length(string_to_array(raw_line, ' - '), 1) <> 4
      );
  end if;
end;
$$;

create or replace function pg_temp.star_man_norm(input_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(extensions.unaccent(coalesce(input_text, ''))), '[^a-z0-9]+', '', 'g');
$$;

create or replace function pg_temp.star_man_first_name(input_text text)
returns text
language plpgsql
immutable
as $$
declare
  words text[];
  word_count integer;
  particle_pos integer;
begin
  words := regexp_split_to_array(trim(coalesce(input_text, '')), '\s+');
  word_count := array_length(words, 1);

  if word_count is null or word_count = 0 then
    return null;
  end if;

  select min(i)
    into particle_pos
  from generate_subscripts(words, 1) as i
  where i > 1
    and lower(words[i]) in ('van', 'de', 'den', 'der', 'del', 'da', 'di', 'dos', 'du', 'le', 'la');

  if particle_pos is not null and particle_pos > 2 then
    return array_to_string(words[1:(particle_pos - 1)], ' ');
  end if;

  return words[1];
end;
$$;

create or replace function pg_temp.star_man_last_name(input_text text)
returns text
language plpgsql
immutable
as $$
declare
  words text[];
  word_count integer;
  particle_pos integer;
begin
  words := regexp_split_to_array(trim(coalesce(input_text, '')), '\s+');
  word_count := array_length(words, 1);

  if word_count is null or word_count = 0 then
    return null;
  end if;

  if word_count = 1 then
    return words[1];
  end if;

  select min(i)
    into particle_pos
  from generate_subscripts(words, 1) as i
  where i > 1
    and lower(words[i]) in ('van', 'de', 'den', 'der', 'del', 'da', 'di', 'dos', 'du', 'le', 'la');

  if particle_pos is not null then
    return array_to_string(words[particle_pos:word_count], ' ');
  end if;

  return array_to_string(words[2:word_count], ' ');
end;
$$;

drop table if exists pg_temp.star_man_roster_seed;
create temp table star_man_roster_seed as
with parsed as (
  select
    raw_line,
    string_to_array(raw_line, ' - ') as parts
  from pg_temp.raw_star_man_roster
),
seed as (
  select
    trim(parts[1]) as display_name,
    case trim(parts[2])
      when 'Brighton & Hove Albion' then 'Brighton'
      when 'Leeds United' then 'Leeds'
      when 'Newcastle United' then 'Newcastle'
      when 'Tottenham Hotspur' then 'Tottenham'
      when 'West Ham United' then 'West Ham'
      when 'Wolverhampton Wanderers' then 'Wolverhampton'
      else trim(parts[2])
    end as team_name,
    trim(parts[3]) as nationality,
    trim(parts[4])::integer as height_cm
  from parsed
)
select
  seed.*,
  pg_temp.star_man_first_name(seed.display_name) as first_name,
  pg_temp.star_man_last_name(seed.display_name) as last_name,
  pg_temp.star_man_norm(seed.display_name) as norm_name
from seed;

-- Temporary pass: Felipe was intentionally omitted from the pasted 605-player list,
-- but GW37 data already references him and he should remain selectable for now.
insert into pg_temp.star_man_roster_seed (
  display_name,
  team_name,
  nationality,
  height_cm,
  first_name,
  last_name,
  norm_name
)
select
  'Felipe',
  'Nottingham Forest',
  'Brazil',
  190,
  pg_temp.star_man_first_name('Felipe'),
  pg_temp.star_man_last_name('Felipe'),
  pg_temp.star_man_norm('Felipe')
where not exists (
  select 1
  from pg_temp.star_man_roster_seed
  where display_name = 'Felipe'
    and team_name = 'Nottingham Forest'
);

do $$
begin
  if exists (
    select 1
    from pg_temp.star_man_roster_seed seed
    left join public.teams teams
      on teams.name = seed.team_name
    where teams.id is null
  ) then
    raise exception 'These team names do not match public.teams: %',
      (
        select string_agg(distinct seed.team_name, ', ')
        from pg_temp.star_man_roster_seed seed
        left join public.teams teams
          on teams.name = seed.team_name
        where teams.id is null
      );
  end if;

  if exists (
    select 1
    from pg_temp.star_man_roster_seed
    group by display_name, team_name
    having count(*) > 1
  ) then
    raise exception 'Duplicate player/team rows found in new roster: %',
      (
        select string_agg(display_name || ' / ' || team_name, ', ')
        from (
          select display_name, team_name
          from pg_temp.star_man_roster_seed
          group by display_name, team_name
          having count(*) > 1
        ) duplicates
      );
  end if;
end;
$$;

drop table if exists pg_temp.star_man_roster_resolved;
create temp table star_man_roster_resolved as
with team_resolved as (
  select
    seed.*,
    teams.id as team_id,
    count(*) over (partition by seed.norm_name) as new_name_count
  from pg_temp.star_man_roster_seed seed
  join public.teams teams
    on teams.name = seed.team_name
)
select
  seed.*,
  matched.id as existing_player_id
from team_resolved seed
left join lateral (
  select player.id
  from public.players player
  where pg_temp.star_man_norm(player.display_name) = seed.norm_name
    and (
      player.team_id = seed.team_id
      or (
        seed.new_name_count = 1
        and not exists (
          select 1
          from public.players exact_team_player
          where exact_team_player.team_id = seed.team_id
            and pg_temp.star_man_norm(exact_team_player.display_name) = seed.norm_name
        )
      )
    )
  order by
    case when player.team_id = seed.team_id then 0 else 1 end,
    case when player.is_active then 0 else 1 end,
    player.created_at
  limit 1
) matched on true;

update public.players player
set
  display_name = roster.display_name,
  first_name = roster.first_name,
  last_name = roster.last_name,
  surname = roster.last_name,
  scrabble_name = roster.last_name,
  nationality = roster.nationality,
  height_cm = roster.height_cm,
  team_id = roster.team_id,
  squad_status = 'squad_player',
  is_active = true
from pg_temp.star_man_roster_resolved roster
where player.id = roster.existing_player_id;

insert into public.players (
  display_name,
  first_name,
  last_name,
  surname,
  scrabble_name,
  nationality,
  height_cm,
  team_id,
  squad_status,
  is_active
)
select
  roster.display_name,
  roster.first_name,
  roster.last_name,
  roster.last_name,
  roster.last_name,
  roster.nationality,
  roster.height_cm,
  roster.team_id,
  'squad_player',
  true
from pg_temp.star_man_roster_resolved roster
where roster.existing_player_id is null
on conflict (display_name, team_id) do update
set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  surname = excluded.surname,
  scrabble_name = excluded.scrabble_name,
  nationality = excluded.nationality,
  height_cm = excluded.height_cm,
  squad_status = excluded.squad_status,
  is_active = true;

drop table if exists pg_temp.final_star_man_player_pool;
create temp table final_star_man_player_pool as
select
  player.id as player_id,
  roster.display_name,
  roster.team_name,
  roster.nationality,
  roster.height_cm
from pg_temp.star_man_roster_seed roster
join public.teams teams
  on teams.name = roster.team_name
join public.players player
  on player.team_id = teams.id
 and pg_temp.star_man_norm(player.display_name) = roster.norm_name;

drop table if exists pg_temp.gw37_protected_player_ids;
create temp table gw37_protected_player_ids as
with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
),
gw37 as (
  select gameweeks.id as gameweek_id, target_season.id as season_id
  from target_season
  join public.gameweeks gameweeks
    on gameweeks.season_id = target_season.id
   and gameweeks.number = 37
)
select distinct picks.player_id
from public.star_man_picks picks
join gw37
  on gw37.season_id = picks.season_id
 and gw37.gameweek_id = picks.gameweek_id
union
select distinct stats.player_id
from public.player_gameweek_stats stats
join gw37
  on gw37.season_id = stats.season_id
 and gw37.gameweek_id = stats.gameweek_id
where coalesce(stats.goals, 0) <> 0
   or coalesce(stats.assists, 0) <> 0
   or coalesce(stats.outside_box_goals, 0) <> 0
   or coalesce(stats.outside_box_assists, 0) <> 0
   or coalesce(stats.yellow_cards, 0) <> 0
   or coalesce(stats.red_cards, 0) <> 0
   or coalesce(stats.minutes_played, 0) <> 0
   or coalesce(stats.started, false) = true
   or coalesce(stats.was_benched, false) = true;

update public.players player
set is_active = false
where player.is_active = true
  and not exists (
    select 1
    from pg_temp.final_star_man_player_pool pool
    where pool.player_id = player.id
  )
  and not exists (
    select 1
    from pg_temp.gw37_protected_player_ids protected
    where protected.player_id = player.id
  );

update public.players player
set is_active = true
where exists (
  select 1
  from pg_temp.gw37_protected_player_ids protected
  where protected.player_id = player.id
);

insert into public.player_team_assignments (
  season_id,
  player_id,
  team_id,
  starts_gameweek_id,
  ends_gameweek_id
)
select
  target_season.id,
  pool.player_id,
  teams.id,
  gw1.id,
  null
from pg_temp.final_star_man_player_pool pool
join public.teams teams
  on teams.name = pool.team_name
join public.seasons target_season
  on target_season.name = 'Premier League 2025-26'
join public.gameweeks gw1
  on gw1.season_id = target_season.id
 and gw1.number = 1
where not exists (
  select 1
  from public.player_team_assignments existing
  where existing.season_id = target_season.id
    and existing.player_id = pool.player_id
    and existing.team_id = teams.id
    and existing.ends_gameweek_id is null
);

with protected_not_in_new_pool as (
  select
    protected_player.display_name,
    teams.name as team_name
  from pg_temp.gw37_protected_player_ids protected
  join public.players protected_player
    on protected_player.id = protected.player_id
  left join public.teams teams
    on teams.id = protected_player.team_id
  where not exists (
    select 1
    from pg_temp.final_star_man_player_pool pool
    where pool.player_id = protected.player_id
  )
)
select 'new_roster_rows' as check_name, count(*)::text as check_value
from pg_temp.star_man_roster_seed
union all
select 'final_new_pool_player_ids', count(distinct player_id)::text
from pg_temp.final_star_man_player_pool
union all
select 'active_players_after_update', count(*)::text
from public.players
where is_active = true
union all
select 'gw37_protected_players', count(*)::text
from pg_temp.gw37_protected_player_ids
union all
select 'gw37_protected_not_in_new_pool', count(*)::text
from protected_not_in_new_pool
union all
select
  'gw37_protected_not_in_new_pool_players',
  coalesce(string_agg(display_name || coalesce(' (' || team_name || ')', ''), ', ' order by display_name), 'None')
from protected_not_in_new_pool;
