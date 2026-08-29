# Live Player Stats pool audit — 28 August 2026

## Outcome

The read-only live audit is complete. Supabase's Data API **Max rows** setting is
**1,000**. The database contains **1,793 player rows**, of which **587 are active**.
The old Player Stats loader built its pool from one alphabetically ordered
all-player request, so **269 valid active 2026-27 players after that first page
could be absent**. That is the systemic cause of Rayan Cherki and Phil Foden
disappearing.

Every one of the 587 active players is attached to a current-season club and has
a usable 2026-27 team-assignment window. The audit found:

- 0 active players without eligible current-season history.
- 0 active players outside the season pool.
- 0 active current-team/open-assignment mismatches.
- 0 invalid assignment windows or overlapping different-club windows.
- 0 current-season fixture-stat rows without matching historical eligibility.
- 20 intentionally deactivated players with historical eligibility, retained for
  the new **Include deactivated players** option.
- 19 duplicate display-name groups and 16 documented identity groups. These are
  reported below and deliberately not merged, renamed, reactivated or reassigned.

No live data was changed by this audit.

## Cherki and Foden

- **Phil Foden** is active at Manchester City, with an open Manchester City
  assignment from GW1. His all-player API position is 1,431.
- **Rayan Cherki** is active at Manchester City, with an open Manchester City
  assignment from GW1. His all-player API position is 1,448.
- Phil's display name remains **Phil Foden**. The migration adds documented
  registered-name aliases so `Philip Foden` finds that same record without
  changing what the UI displays.

Search verification:

- `Cherki` → **Rayan Cherki**
- `Rayan` → **Rayan**, **Rayan Aït-Nouri**, **Rayan Cherki**
- `Rayan Cherki` → **Rayan Cherki**
- `Foden` → **Phil Foden**
- `Phil Foden` → **Phil Foden**
- `Philip Foden` → **Phil Foden**

## Exact active players vulnerable to the old 1,000-row load (269)

This is the complete live-snapshot list, grouped by current team. “Row” is the
one-based position in the live database's deterministic display-name/ID order.

### Arsenal (13)

- Kepa Arrizabalaga — row 1017
- Marli Salmon — row 1208
- Martin Ødegaard — row 1212
- Martín Zubimendi — row 1215
- Max Dowman — row 1257
- Mikel Merino — row 1294
- Myles Lewis-Skelly — row 1322
- Noni Madueke — row 1357
- Piero Hincapié — row 1433
- Riccardo Calafiori — row 1477
- Tommy Setford — row 1662
- Viktor Gyökeres — row 1713
- William Saliba — row 1742

### Aston Villa (13)

- Lamare Bogarde — row 1059
- Leon Bailey — row 1071
- Marco Bizot — row 1190
- Matteo Ruggeri — row 1241
- Matty Cash — row 1254
- Modou Keba Cisse — row 1307
- Ollie Watkins — row 1394
- Pau Torres — row 1425
- Ross Barkley — row 1513
- Tammy Abraham — row 1605
- Tyrone Mings — row 1698
- Victor Lindelöf — row 1709
- Zion Suzuki — row 1792

### Bournemouth (8)

- Lewis Cook — row 1082
- Marcus Tavernier — row 1198
- Michele di Gregorio — row 1289
- Rayan — row 1446
- Remy Rees-Dottin — row 1468
- Ryan Christie — row 1517
- Tyler Adams — row 1681
- Veljko Milosavljević — row 1706

### Brentford (17)

- Kaye Furo — row 1006
- Keane Lewis-Potter — row 1009
- Kevin Schade — row 1022
- Kristoffer Ajer — row 1046
- Luka Bentt — row 1143
- Mamadou Sangare — row 1179
- Mathias Jensen — row 1231
- Michael Kayode — row 1281
- Mikkel Damsgaard — row 1296
- Myles Peart-Harris — row 1323
- Nathan Collins — row 1326
- Reiss Nelson — row 1463
- Rico Henry — row 1480
- Romelle Donovan — row 1504
- Sepp van den Berg — row 1567
- Vitaly Janelt — row 1720
- Yehor Yarmolyuk — row 1759

### Brighton (17)

- Lewis Dunk — row 1084
- Luka Vušković — row 1145
- Mats Wieffer — row 1234
- Matt O'Riley — row 1238
- Maxim De Cuyper — row 1268
- Michael Svoboda — row 1288
- Nehemiah Oriola — row 1336
- Olivier Boscagli — row 1390
- Pascal Groß — row 1420
- Pascal Struijk — row 1421
- Promise David — row 1436
- Rodrigo Rego — row 1500
- Stefanos Tzimas — row 1595
- Tom Watson — row 1655
- Yankuba Minteh — row 1755
- Yasin Ayari — row 1756
- Zadok Yohanna — row 1784

### Chelsea (18)

- Levi Colwill — row 1078
- Liam Delap — row 1096
- Malo Gusto — row 1178
- Mamadou Sarr — row 1180
- Marc Guiu — row 1186
- Marco Palestra — row 1191
- Maxence Lacroix — row 1267
- Moisés Caicedo — row 1314
- Morgan Rogers — row 1317
- Pedro Neto — row 1427
- Pep Chavarria — row 1430
- Reece James — row 1451
- Robert Sánchez — row 1491
- Roméo Lavia — row 1505
- Shim Mheuka — row 1578
- Tosin Adarabioyo — row 1664
- Valentin Barco — row 1703
- Wesley Fofana — row 1728

### Coventry (11)

- Liam Kitching — row 1099
- Loum Tchaouna — row 1117
- Luke Woolfenden — row 1159
- Matt Grimes — row 1237
- Miguel Brau — row 1291
- Milan van Ewijk — row 1298
- Romain Esse — row 1501
- Sidiki Cherif — row 1580
- Tatsuhiro Sakamoto — row 1608
- Victor Torp — row 1712
- Yang Min-Hyeok — row 1754

### Crystal Palace (10)

- Nathaniel Clyne — row 1330
- Odsonne Édouard — row 1362
- Oscar Mingueza — row 1408
- Rio Cardines — row 1486
- Takehiro Tomiyasu — row 1604
- Tyrick Mitchell — row 1694
- Walter Benítez — row 1722
- Will Hughes — row 1733
- Yéremy Pino — row 1761
- Zavier Gozo — row 1787

### Everton (11)

- Kiernan Dewsbury-Hall — row 1034
- Mark Travers — row 1201
- Merlin Röhl — row 1275
- Michael Keane — row 1282
- Nathan Patterson — row 1328
- Reece Welch — row 1453
- Thierno Barry — row 1626
- Tim Iroegbunam — row 1643
- Tyler Dibling — row 1683
- Tyrique George — row 1696
- Vitaliy Mykolenko — row 1719

### Fulham (10)

- Kenny Tete — row 1016
- Kevin — row 1019
- Oscar Bobb — row 1407
- Rodrigo Muniz — row 1499
- Ryan Sessegnon — row 1523
- Samuel Chukwueze — row 1537
- Sander Berge — row 1543
- Shea Charles — row 1575
- Timothy Castagne — row 1645
- Tom Cairney — row 1651

### Hull (19)

- Kieran Dowell — row 1031
- Konstantinos Tzolakis — row 1041
- Lewis Coyle — row 1083
- Lewis Koumas — row 1089
- Liam Millar — row 1100
- Lucas Gourna-Douath — row 1132
- Lucas Herrington — row 1133
- Matt Crooks — row 1235
- Matt Targett — row 1239
- Mohamed Belloumi — row 1309
- Nobel Mendy — row 1356
- Oliver McBurnie — row 1380
- Oscar Zambrano — row 1409
- Paddy McNair — row 1418
- Regan Slater — row 1455
- Ryan Giles — row 1519
- Semi Ajayi — row 1565
- Toby Collyer — row 1649
- Yu Hirakawa — row 1769

### Ipswich (8)

- Kasey McAteer — row 1004
- Kayne van Oevelen — row 1007
- Kjell Scherpen — row 1036
- Leif Davis — row 1064
- Marcelino Núñez — row 1187
- Saša Lukić — row 1547
- Sindre Walle Egeli — row 1584
- Wes Burns — row 1727

### Leeds (7)

- Lucas Perri — row 1136
- Lukas Nmecha — row 1147
- Nico Elvedi — row 1343
- Noah Okafor — row 1354
- Sean Longstaff — row 1555
- Tarik Muharemovic — row 1606
- Wilfried Gnonto — row 1731

### Liverpool (10)

- Milos Kerkez — row 1301
- Rio Ngumoha — row 1489
- Ronald Araujo — row 1506
- Ryan Gravenberch — row 1520
- Trent Kone-Doherty — row 1671
- Trey Nyoni — row 1674
- Victor Munoz — row 1710
- Virgil van Dijk — row 1716
- Wataru Endo — row 1724
- Wellity Lucky — row 1725

### Manchester City (14)

- Marc Guéhi — row 1184
- Mateo Kovačić — row 1224
- Matheus Nunes — row 1230
- Nico O'Reilly — row 1345
- Omar Marmoush — row 1400
- Phil Foden — row 1431
- Pierce Charles — row 1432
- Rayan Aït-Nouri — row 1447
- Rayan Cherki — row 1448
- Reigan Heskey — row 1459
- Rico Lewis — row 1481
- Rúben Dias — row 1515
- Ryan McAidoo — row 1522
- Stephen Mfuni — row 1596

### Manchester United (17)

- Karl Darlow — row 1003
- Kobbie Mainoo — row 1037
- Leny Yoro — row 1068
- Lisandro Martínez — row 1102
- Luke Shaw — row 1158
- Manuel Ugarte — row 1181
- Mason Mount — row 1219
- Matheus Cunha — row 1228
- Matthijs de Ligt — row 1253
- Noussair Mazraoui — row 1359
- Patrick Dorgu — row 1422
- Senne Lammens — row 1566
- Shea Lacey — row 1576
- Tyler Fletcher — row 1684
- Tyler Fredricson — row 1685
- Tynan Thompson — row 1690
- Youri Tielemans — row 1768

### Newcastle (14)

- Leo Shahar — row 1070
- Lewis Hall — row 1087
- Lewis Miley — row 1090
- Lukas Hornicek — row 1146
- Malick Thiaw — row 1175
- Nick Pope — row 1340
- Nick Woltemade — row 1341
- Nico González — row 1344
- Sean Neave — row 1556
- Sean Steur — row 1557
- Sven Botman — row 1600
- Tino Livramento — row 1647
- William Osula — row 1740
- Yoane Wissa — row 1765

### Nottingham Forest (18)

- Lorenzo Lucca — row 1107
- Luca Netz — row 1125
- Matz Sels — row 1255
- Morato — row 1315
- Morgan Gibbs-White — row 1316
- Murillo — row 1319
- Neco Williams — row 1334
- Nicolás Domínguez — row 1346
- Nicolò Savona — row 1347
- Nikola Milenković — row 1348
- Ola Aina — row 1365
- Oleksandr Zinchenko — row 1369
- Omari Hutchinson — row 1402
- Ousmane Diomande — row 1411
- Ryan Yates — row 1524
- Taiwo Awoniyi — row 1603
- Xaver Schlager — row 1752
- Zach Abbott — row 1777

### Sunderland (15)

- Luke O'Nien — row 1157
- Lutsharel Geertruida — row 1160
- Melker Ellborg — row 1273
- Nilson Angulo — row 1350
- Noah Sadiki — row 1355
- Nordi Mukiele — row 1358
- Omar Alderete — row 1398
- Patrick Roberts — row 1423
- Reinildo Mandava — row 1460
- Robin Roefs — row 1493
- Romaine Mundle — row 1502
- Simon Adingra — row 1582
- Thomas Meunier — row 1634
- Trai Hume — row 1667
- Wilson Isidor — row 1748

### Tottenham (19)

- Kevin Danso — row 1020
- Lucá Williams-Barnett — row 1128
- Lucas Bergvall — row 1129
- Marcos Senesi — row 1193
- Martin Dúbravka — row 1211
- Mateus Fernandes — row 1225
- Mathys Tel — row 1233
- Micky van de Ven — row 1290
- Mohammed Kudus — row 1312
- Pape Matar Sarr — row 1419
- Pedro Porro — row 1428
- Randal Kolo Muani — row 1443
- Richarlison — row 1479
- Rodrigo Bentancur — row 1496
- Sandro Tonali — row 1544
- Savio — row 1549
- Souza — row 1590
- Wilson Odobert — row 1749
- Xavi Simons — row 1753

## Deactivated players with valid 2026-27 history (20)

These match known departures/loans and remain deactivated. They become visible
only when the checkbox is enabled and are labelled **Deactivated**:

- Ben Johnson — Ipswich; GW1–1
- Benjamin Arthur — Brentford; GW1–open
- Cristian Romero — Tottenham; GW1–open
- Dastan Satpaev — Chelsea; GW1–open
- Dilane Bakwa — Nottingham Forest; GW1–1
- Divine Mukasa — Manchester City; GW1–1
- Djed Spence — Tottenham; GW1–open
- Enes Ünal — Bournemouth; GW1–open
- Guglielmo Vicario — Tottenham; GW1–open
- Harry Howell — Brighton; GW1–open
- Joël Piroe — Leeds; GW1–open
- Kieran Morrison — Liverpool; GW1–open
- Max Alleyne — Manchester City; GW1–open
- Reggie Walsh — Chelsea; GW1–open
- Rodri — Manchester City; GW1–open
- Ryan Kavuma-McQueen — Chelsea; GW1–open
- Sam Byram — Leeds; GW1–1
- Sebastiaan Bornauw — Leeds; GW1–open
- Tijjani Reijnders — Manchester City; GW1–open
- Yunus Konak — Brentford; GW1–open

## Documented duplicate-identity review (16 groups)

The migration leaves all of these rows and their foreign keys intact.

| Identity evidence | Live rows |
| --- | --- |
| West Ham:Adama Traore Diarra | Adama Traoré — inactive, West Ham, history none<br>Adama Traoré — inactive, Fulham, history none |
| Manchester City:Antoine Serlom Semenyo | Antoine Semenyo — active, Manchester City, history Manchester City GW1–open<br>Antoine Semenyo — inactive, Bournemouth, history none |
| Bournemouth:Ben Gannon Doak | Ben Doak — inactive, Bournemouth, history none<br>Ben Gannon-Doak — active, Bournemouth, history Bournemouth GW1–open |
| Crystal Palace:Brennan Price Johnson | Brennan Johnson — inactive, Tottenham, history none<br>Brennan Johnson — active, Everton, history Everton GW1–open |
| Aston Villa:Douglas Luiz Soares De Paulo | Douglas Luiz — inactive, Nottingham Forest, history none<br>Douglas Luiz — active, Aston Villa, history Aston Villa GW1–open |
| Arsenal:Eberechi Oluchi Eze | Eberechi Eze — active, Arsenal, history Arsenal GW1–open<br>Eberechi Eze — inactive, Crystal Palace, history none |
| Crystal Palace:Evann Ludovic Vidjannagni Guessand | Evann Guessand — inactive, Aston Villa, history none<br>Evann Guessand — active, Crystal Palace, history Crystal Palace GW1–open |
| Aston Villa:Harvey Daniel James Elliott | Harvey Elliott — active, Aston Villa, history Aston Villa GW1–open<br>Harvey Elliott — inactive, Liverpool, history none |
| Burnley:James Michael Edward Ward-Prowse | James Ward-Prowse — inactive, West Ham, history none<br>James Ward-Prowse — inactive, Burnley, history none |
| Crystal Palace:Jørgen Strand Larsen | Jørgen Strand Larsen — active, Crystal Palace, history Crystal Palace GW1–open<br>Jørgen Strand Larsen — inactive, Wolverhampton, history none |
| Manchester City:Addji Keaninkin Marc-Israel Guehi | Marc Guéhi — inactive, Crystal Palace, history none<br>Marc Guéhi — active, Manchester City, history Manchester City GW1–open |
| Chelsea:Marc Guiu Paz | Marc Guiu — inactive, Sunderland, history none<br>Marc Guiu — active, Chelsea, history Chelsea GW1–open |
| West Ham:Maximilian Kilman | Max Kilman — inactive, West Ham, history none<br>Maximilian Kilman — inactive, West Ham, history none |
| Fulham:Oscar Bobb | Oscar Bobb — inactive, Manchester City, history none<br>Oscar Bobb — active, Fulham, history Fulham GW1–open |
| Manchester City:Sávio Moreira De Oliveira | Savio — active, Tottenham, history Manchester City GW1–1; Tottenham GW2–open<br>Sávio — inactive, Manchester City, history none |
| Brentford:Yunus Emre Konak | Yunus Emre Konak — inactive, Brentford, history none<br>Yunus Konak — inactive, Brentford, history Brentford GW1–open |

## Exact duplicate-name review (19 groups)

| Display name | Live rows |
| --- | --- |
| Adama Traoré | inactive at West Ham (0bad1f15-6767-4266-a9ba-977a6aa44334)<br>inactive at Fulham (ade9cd6f-89ca-48a3-8fca-b382850e2331) |
| Alfie White | inactive at Fulham (5e02cc52-c989-4d85-adda-43d0615bd269)<br>inactive at Wolverhampton (62408d8f-a709-46c9-a725-b2b59a3f4499) |
| Antoine Semenyo | active at Manchester City (0357e54d-076c-4a1d-9770-bb0baaff307e)<br>inactive at Bournemouth (a3f86a10-a388-4c72-9281-ff16caf775ca) |
| Brennan Johnson | inactive at Tottenham (8e3e7afe-0209-411e-9471-06777c749d13)<br>active at Everton (8f2932e4-20bf-4aec-bfe1-8983f28e0a36) |
| Douglas Luiz | inactive at Nottingham Forest (2dd07b1e-4668-426f-91d3-fbc6b3f86896)<br>active at Aston Villa (3c4e49b1-f68e-477b-9918-6497c9b474ab) |
| Eberechi Eze | active at Arsenal (16ae0157-4a7f-4e7c-9f6b-c5817fdf7d3c)<br>inactive at Crystal Palace (951c2b58-85bf-486e-8399-a92ee9df2f80) |
| Evann Guessand | inactive at Aston Villa (c071619a-6746-4b21-b14a-b7b3399b34a1)<br>active at Crystal Palace (c311a5c5-cb09-48bd-9407-7c4811a01418) |
| Facundo Buonanotte | inactive at Chelsea (61f88847-95c3-45c7-9bd4-a1c0fecf8804)<br>inactive at Leeds (63fce132-dfa7-4d65-a42e-2b45e07810e9)<br>inactive at Brighton (e0c90869-7fa1-4029-86b8-4e862797c2dd) |
| Harvey Elliott | active at Aston Villa (e647abaa-328b-4171-b53b-ba0b0e48d404)<br>inactive at Liverpool (e7bcc352-af47-46b0-b1b9-7a14a9631715) |
| Jack Patterson | inactive at Everton (66be0719-9e85-4d94-b421-3412ea6994f1)<br>inactive at Newcastle (8ffd0533-87bd-4f88-8805-2d90b0f6db97) |
| Jacob Watson | inactive at Leeds (70240e19-6dd6-494d-9e2a-b01adf9d37cd)<br>inactive at Manchester United (890342b2-2ce9-4f6d-b95f-25bfbc4bc1af) |
| James Ward-Prowse | inactive at West Ham (17f75052-7d8d-4fa2-9f06-ac59999fb0bf)<br>inactive at Burnley (a2cd5881-3be9-41c8-aeb3-e0b96c1c96fd) |
| Jørgen Strand Larsen | active at Crystal Palace (1273de37-245a-4c62-802a-016457fa3f4c)<br>inactive at Wolverhampton (872af523-39a1-4685-b4fc-e80ac3bed313) |
| Joseph Wheeler Henry | inactive at Chelsea (0068d93e-6e57-4192-9e2f-a7cf7b31af19)<br>inactive at Brentford (5326fecb-c33e-4d85-9c34-0a6701957c6c) |
| Marc Guéhi | inactive at Crystal Palace (4063b2d1-5460-4474-a528-83ab7efeec8b)<br>active at Manchester City (4f44dee7-8d12-4272-ad3e-0801f3de412d) |
| Marc Guiu | inactive at Sunderland (1578e112-2c03-401c-9953-d55083f264b2)<br>active at Chelsea (5a9c2377-1781-451e-a755-ab783b51904c) |
| Oscar Bobb | inactive at Manchester City (7e41d19e-838c-416f-871e-453452c62e9c)<br>active at Fulham (f89f5912-c583-4ba1-ac75-63c0c32e6e73) |
| Savio | active at Tottenham (53b61174-a867-4169-97b5-5968b31d5727)<br>inactive at Manchester City (f6bb7e2c-12ca-454f-b142-7bccacdf9702) |
| Tyrique George | inactive at Chelsea (2ebdb724-1557-4d5b-8869-059ac5c765ea)<br>active at Everton (967bc6ec-927f-41a2-aa99-d1f27c16fc06) |

## Migration rehearsal against the live snapshot

The prepared migration was executed twice in disposable PostgreSQL/PGlite seeded
with the live reference/history snapshot. It would:

- Add 2,944 documented alias rows across
  1,552 existing player identities.
- Make **0** player-team assignment repairs on the current live data.
- Make **0** team, display-name, active-flag, stat, pick, fixture or season changes.
- Preserve all downloaded protected reference/stat evidence and every existing
  assignment unchanged.
- Produce no changes on the second run.

The local database engine orders one non-ASCII name differently at the artificial
1,000-row report boundary. The 269-player list above comes from the actual live
Supabase ordering; this collation-only rehearsal difference does not affect any
repair or application behavior.

## Recommended production order

1. Run the complete `supabase/player-stats-pool-integrity-2026-08-28.sql` file
   once in Supabase. It adds the alias table/policies/functions and emits one JSON
   report. Do not run a reset SQL file.
2. Review the JSON result. On this snapshot, only `search_names_added` repairs
   are expected; assignment/team/activation repairs should remain empty.
3. Deploy the client changes. The client is backward-tolerant if deployed first,
   but `Philip Foden` search becomes available only after the alias migration.
4. Authenticated smoke-test Player Stats, Roster Review, Actual Results, Fixture
   Stats, Schedule and Star Man selectors.

Snapshot captured at 2026-08-28T22:14:28.593983+00:00. The snapshot contains football
reference/history data only—no emails, profile photos, individual predictions or
card hands.
