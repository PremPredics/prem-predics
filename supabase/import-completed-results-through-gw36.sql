-- Imports completed Premier League results through GW36.
-- Run in Supabase SQL Editor after fixtures and teams exist.
-- This updates public.match_results and marks matched fixtures as final.

drop table if exists pg_temp.pp_completed_results_raw;
drop table if exists pg_temp.pp_completed_results_parsed;
drop table if exists pg_temp.pp_team_aliases;
drop table if exists pg_temp.pp_team_lookup;
drop table if exists pg_temp.pp_completed_results_mapped;

create temporary table pp_completed_results_raw as
select btrim(line, E' \t\r\n') as line
from regexp_split_to_table($results$
1. 15/08/2025 — Liverpool 4–2 Bournemouth
2. 16/08/2025 — Aston Villa 0–0 Newcastle
3. 16/08/2025 — Brighton 1–1 Fulham
4. 16/08/2025 — Sunderland 3–0 West Ham
5. 16/08/2025 — Tottenham 3–0 Burnley
6. 16/08/2025 — Wolves 0–4 Man City
7. 17/08/2025 — Chelsea 0–0 Crystal Palace
8. 17/08/2025 — Nott'm Forest 3–1 Brentford
9. 17/08/2025 — Man United 0–1 Arsenal
10. 18/08/2025 — Leeds 1–0 Everton
11. 22/08/2025 — West Ham 1–5 Chelsea
12. 23/08/2025 — Man City 0–2 Tottenham
13. 23/08/2025 — Bournemouth 1–0 Wolves
14. 23/08/2025 — Brentford 1–0 Aston Villa
15. 23/08/2025 — Burnley 2–0 Sunderland
16. 23/08/2025 — Arsenal 5–0 Leeds
17. 24/08/2025 — Crystal Palace 1–1 Nott'm Forest
18. 24/08/2025 — Everton 2–0 Brighton
19. 24/08/2025 — Fulham 1–1 Man United
20. 25/08/2025 — Newcastle 2–3 Liverpool
21. 30/08/2025 — Chelsea 2–0 Fulham
22. 30/08/2025 — Man United 3–2 Burnley
23. 30/08/2025 — Sunderland 2–1 Brentford
24. 30/08/2025 — Tottenham 0–1 Bournemouth
25. 30/08/2025 — Wolves 2–3 Everton
26. 30/08/2025 — Leeds 0–0 Newcastle
27. 31/08/2025 — Brighton 2–1 Man City
28. 31/08/2025 — Nott'm Forest 0–3 West Ham
29. 31/08/2025 — Liverpool 1–0 Arsenal
30. 31/08/2025 — Aston Villa 0–3 Crystal Palace
31. 13/09/2025 — Arsenal 3–0 Nott'm Forest
32. 13/09/2025 — Bournemouth 2–1 Brighton
33. 13/09/2025 — Crystal Palace 0–0 Sunderland
34. 13/09/2025 — Everton 0–0 Aston Villa
35. 13/09/2025 — Fulham 1–0 Leeds
36. 13/09/2025 — Newcastle 1–0 Wolves
37. 13/09/2025 — West Ham 0–3 Tottenham
38. 13/09/2025 — Brentford 2–2 Chelsea
39. 14/09/2025 — Burnley 0–1 Liverpool
40. 14/09/2025 — Man City 3–0 Man United
41. 20/09/2025 — Liverpool 2–1 Everton
42. 20/09/2025 — Brighton 2–2 Tottenham
43. 20/09/2025 — Burnley 1–1 Nott'm Forest
44. 20/09/2025 — West Ham 1–2 Crystal Palace
45. 20/09/2025 — Wolves 1–3 Leeds
46. 20/09/2025 — Man United 2–1 Chelsea
47. 20/09/2025 — Fulham 3–1 Brentford
48. 21/09/2025 — Bournemouth 0–0 Newcastle
49. 21/09/2025 — Sunderland 1–1 Aston Villa
50. 21/09/2025 — Arsenal 1–1 Man City
51. 27/09/2025 — Brentford 3–1 Man United
52. 27/09/2025 — Chelsea 1–3 Brighton
53. 27/09/2025 — Crystal Palace 2–1 Liverpool
54. 27/09/2025 — Leeds 2–2 Bournemouth
55. 27/09/2025 — Man City 5–1 Burnley
56. 27/09/2025 — Nott'm Forest 0–1 Sunderland
57. 27/09/2025 — Tottenham 1–1 Wolves
58. 28/09/2025 — Aston Villa 3–1 Fulham
59. 28/09/2025 — Newcastle 1–2 Arsenal
60. 29/09/2025 — Everton 1–1 West Ham
61. 03/10/2025 — Bournemouth 3–1 Fulham
62. 04/10/2025 — Leeds 1–2 Tottenham
63. 04/10/2025 — Arsenal 2–0 West Ham
64. 04/10/2025 — Man United 2–0 Sunderland
65. 04/10/2025 — Chelsea 2–1 Liverpool
66. 05/10/2025 — Aston Villa 2–1 Burnley
67. 05/10/2025 — Everton 2–1 Crystal Palace
68. 05/10/2025 — Newcastle 2–0 Nott'm Forest
69. 05/10/2025 — Wolves 1–1 Brighton
70. 05/10/2025 — Brentford 0–1 Man City
71. 18/10/2025 — Nott'm Forest 0–3 Chelsea
72. 18/10/2025 — Brighton 2–1 Newcastle
73. 18/10/2025 — Burnley 2–0 Leeds
74. 18/10/2025 — Crystal Palace 3–3 Bournemouth
75. 18/10/2025 — Man City 2–0 Everton
76. 18/10/2025 — Sunderland 2–0 Wolves
77. 18/10/2025 — Fulham 0–1 Arsenal
78. 19/10/2025 — Tottenham 1–2 Aston Villa
79. 19/10/2025 — Liverpool 1–2 Man United
80. 20/10/2025 — West Ham 0–2 Brentford
81. 24/10/2025 — Leeds 2–1 West Ham
82. 25/10/2025 — Chelsea 1–2 Sunderland
83. 25/10/2025 — Newcastle 2–1 Fulham
84. 25/10/2025 — Man United 4–2 Brighton
85. 25/10/2025 — Brentford 3–2 Liverpool
86. 26/10/2025 — Arsenal 1–0 Crystal Palace
87. 26/10/2025 — Aston Villa 1–0 Man City
88. 26/10/2025 — Bournemouth 2–0 Nott'm Forest
89. 26/10/2025 — Wolves 2–3 Burnley
90. 26/10/2025 — Everton 0–3 Tottenham
91. 01/11/2025 — Brighton 3–0 Leeds
92. 01/11/2025 — Burnley 0–2 Arsenal
93. 01/11/2025 — Crystal Palace 2–0 Brentford
94. 01/11/2025 — Fulham 3–0 Wolves
95. 01/11/2025 — Nott'm Forest 2–2 Man United
96. 01/11/2025 — Tottenham 0–1 Chelsea
97. 01/11/2025 — Liverpool 2–0 Aston Villa
98. 02/11/2025 — West Ham 3–1 Newcastle
99. 02/11/2025 — Man City 3–1 Bournemouth
100. 03/11/2025 — Sunderland 1–1 Everton
101. 08/11/2025 — Tottenham 2–2 Man United
102. 08/11/2025 — Everton 2–0 Fulham
103. 08/11/2025 — West Ham 3–2 Burnley
104. 08/11/2025 — Sunderland 2–2 Arsenal
105. 08/11/2025 — Chelsea 3–0 Wolves
106. 09/11/2025 — Aston Villa 4–0 Bournemouth
107. 09/11/2025 — Brentford 3–1 Newcastle
108. 09/11/2025 — Crystal Palace 0–0 Brighton
109. 09/11/2025 — Nott'm Forest 3–1 Leeds
110. 09/11/2025 — Man City 3–0 Liverpool
111. 22/11/2025 — Burnley 0–2 Chelsea
112. 22/11/2025 — Bournemouth 2–2 West Ham
113. 22/11/2025 — Brighton 2–1 Brentford
114. 22/11/2025 — Fulham 1–0 Sunderland
115. 22/11/2025 — Liverpool 0–3 Nott'm Forest
116. 22/11/2025 — Wolves 0–2 Crystal Palace
117. 22/11/2025 — Newcastle 2–1 Man City
118. 23/11/2025 — Leeds 1–2 Aston Villa
119. 23/11/2025 — Arsenal 4–1 Tottenham
120. 24/11/2025 — Man United 0–1 Everton
121. 29/11/2025 — Brentford 3–1 Burnley
122. 29/11/2025 — Man City 3–2 Leeds
123. 29/11/2025 — Sunderland 3–2 Bournemouth
124. 29/11/2025 — Everton 1–4 Newcastle
125. 29/11/2025 — Tottenham 1–2 Fulham
126. 30/11/2025 — Crystal Palace 1–2 Man United
127. 30/11/2025 — Aston Villa 1–0 Wolves
128. 30/11/2025 — Nott'm Forest 0–2 Brighton
129. 30/11/2025 — West Ham 0–2 Liverpool
130. 30/11/2025 — Chelsea 1–1 Arsenal
131. 02/12/2025 — Bournemouth 0–1 Everton
132. 02/12/2025 — Fulham 4–5 Man City
133. 02/12/2025 — Newcastle 2–2 Tottenham
134. 03/12/2025 — Arsenal 2–0 Brentford
135. 03/12/2025 — Brighton 3–4 Aston Villa
136. 03/12/2025 — Burnley 0–1 Crystal Palace
137. 03/12/2025 — Wolves 0–1 Nott'm Forest
138. 03/12/2025 — Leeds 3–1 Chelsea
139. 03/12/2025 — Liverpool 1–1 Sunderland
140. 04/12/2025 — Man United 1–1 West Ham
141. 06/12/2025 — Aston Villa 2–1 Arsenal
142. 06/12/2025 — Bournemouth 0–0 Chelsea
143. 06/12/2025 — Everton 3–0 Nott'm Forest
144. 06/12/2025 — Man City 3–0 Sunderland
145. 06/12/2025 — Newcastle 2–1 Burnley
146. 06/12/2025 — Tottenham 2–0 Brentford
147. 06/12/2025 — Leeds 3–3 Liverpool
148. 07/12/2025 — Brighton 1–1 West Ham
149. 07/12/2025 — Fulham 1–2 Crystal Palace
150. 08/12/2025 — Wolves 1–4 Man United
151. 13/12/2025 — Chelsea 2–0 Everton
152. 13/12/2025 — Liverpool 2–0 Brighton
153. 13/12/2025 — Burnley 2–3 Fulham
154. 13/12/2025 — Arsenal 2–1 Wolves
155. 14/12/2025 — Crystal Palace 0–3 Man City
156. 14/12/2025 — Nott'm Forest 3–0 Tottenham
157. 14/12/2025 — Sunderland 1–0 Newcastle
158. 14/12/2025 — West Ham 2–3 Aston Villa
159. 14/12/2025 — Brentford 1–1 Leeds
160. 15/12/2025 — Man United 4–4 Bournemouth
161. 20/12/2025 — Newcastle 2–2 Chelsea
162. 20/12/2025 — Bournemouth 1–1 Burnley
163. 20/12/2025 — Brighton 0–0 Sunderland
164. 20/12/2025 — Man City 3–0 West Ham
165. 20/12/2025 — Wolves 0–2 Brentford
166. 20/12/2025 — Tottenham 1–2 Liverpool
167. 20/12/2025 — Everton 0–1 Arsenal
168. 20/12/2025 — Leeds 4–1 Crystal Palace
169. 21/12/2025 — Aston Villa 2–1 Man United
170. 22/12/2025 — Fulham 1–0 Nott'm Forest
171. 26/12/2025 — Man United 1–0 Newcastle
172. 27/12/2025 — Nott'm Forest 1–2 Man City
173. 27/12/2025 — Arsenal 2–1 Brighton
174. 27/12/2025 — Brentford 4–1 Bournemouth
175. 27/12/2025 — Burnley 0–0 Everton
176. 27/12/2025 — Liverpool 2–1 Wolves
177. 27/12/2025 — West Ham 0–1 Fulham
178. 27/12/2025 — Chelsea 1–2 Aston Villa
179. 28/12/2025 — Sunderland 1–1 Leeds
180. 28/12/2025 — Crystal Palace 0–1 Tottenham
181. 30/12/2025 — Burnley 1–3 Newcastle
182. 30/12/2025 — Chelsea 2–2 Bournemouth
183. 30/12/2025 — Nott'm Forest 0–2 Everton
184. 30/12/2025 — West Ham 2–2 Brighton
185. 30/12/2025 — Arsenal 4–1 Aston Villa
186. 30/12/2025 — Man United 1–1 Wolves
187. 01/01/2026 — Crystal Palace 1–1 Fulham
188. 01/01/2026 — Liverpool 0–0 Leeds
189. 01/01/2026 — Brentford 0–0 Tottenham
190. 01/01/2026 — Sunderland 0–0 Man City
191. 03/01/2026 — Aston Villa 3–1 Nott'm Forest
192. 03/01/2026 — Brighton 2–0 Burnley
193. 03/01/2026 — Wolves 3–0 West Ham
194. 03/01/2026 — Bournemouth 2–3 Arsenal
195. 04/01/2026 — Leeds 1–1 Man United
196. 04/01/2026 — Everton 2–4 Brentford
197. 04/01/2026 — Newcastle 2–0 Crystal Palace
198. 04/01/2026 — Tottenham 1–1 Sunderland
199. 04/01/2026 — Fulham 2–2 Liverpool
200. 04/01/2026 — Man City 1–1 Chelsea
201. 06/01/2026 — West Ham 1–2 Nott'm Forest
202. 07/01/2026 — Bournemouth 3–2 Tottenham
203. 07/01/2026 — Brentford 3–0 Sunderland
204. 07/01/2026 — Crystal Palace 0–0 Aston Villa
205. 07/01/2026 — Everton 1–1 Wolves
206. 07/01/2026 — Fulham 2–1 Chelsea
207. 07/01/2026 — Man City 1–1 Brighton
208. 07/01/2026 — Burnley 2–2 Man United
209. 07/01/2026 — Newcastle 4–3 Leeds
210. 08/01/2026 — Arsenal 0–0 Liverpool
211. 17/01/2026 — Man United 2–0 Man City
212. 17/01/2026 — Chelsea 2–0 Brentford
213. 17/01/2026 — Leeds 1–0 Fulham
214. 17/01/2026 — Liverpool 1–1 Burnley
215. 17/01/2026 — Sunderland 2–1 Crystal Palace
216. 17/01/2026 — Tottenham 1–2 West Ham
217. 17/01/2026 — Nott'm Forest 0–0 Arsenal
218. 18/01/2026 — Wolves 0–0 Newcastle
219. 18/01/2026 — Aston Villa 0–1 Everton
220. 19/01/2026 — Brighton 1–1 Bournemouth
221. 24/01/2026 — West Ham 3–1 Sunderland
222. 24/01/2026 — Burnley 2–2 Tottenham
223. 24/01/2026 — Fulham 2–1 Brighton
224. 24/01/2026 — Man City 2–0 Wolves
225. 24/01/2026 — Bournemouth 3–2 Liverpool
226. 25/01/2026 — Brentford 0–2 Nott'm Forest
227. 25/01/2026 — Crystal Palace 1–3 Chelsea
228. 25/01/2026 — Newcastle 0–2 Aston Villa
229. 25/01/2026 — Arsenal 2–3 Man United
230. 26/01/2026 — Everton 1–1 Leeds
231. 31/01/2026 — Brighton 1–1 Everton
232. 31/01/2026 — Leeds 0–4 Arsenal
233. 31/01/2026 — Wolves 0–2 Bournemouth
234. 31/01/2026 — Chelsea 3–2 West Ham
235. 31/01/2026 — Liverpool 4–1 Newcastle
236. 01/02/2026 — Aston Villa 0–1 Brentford
237. 01/02/2026 — Man United 3–2 Fulham
238. 01/02/2026 — Nott'm Forest 1–1 Crystal Palace
239. 01/02/2026 — Tottenham 2–2 Man City
240. 02/02/2026 — Sunderland 3–0 Burnley
241. 06/02/2026 — Leeds 3–1 Nott'm Forest
242. 07/02/2026 — Man United 2–0 Tottenham
243. 07/02/2026 — Arsenal 3–0 Sunderland
244. 07/02/2026 — Bournemouth 1–1 Aston Villa
245. 07/02/2026 — Burnley 0–2 West Ham
246. 07/02/2026 — Fulham 1–2 Everton
247. 07/02/2026 — Wolves 1–3 Chelsea
248. 07/02/2026 — Newcastle 2–3 Brentford
249. 08/02/2026 — Brighton 0–1 Crystal Palace
250. 08/02/2026 — Liverpool 1–2 Man City
251. 10/02/2026 — Chelsea 2–2 Leeds
252. 10/02/2026 — Everton 1–2 Bournemouth
253. 10/02/2026 — Tottenham 1–2 Newcastle
254. 10/02/2026 — West Ham 1–1 Man United
255. 11/02/2026 — Aston Villa 1–0 Brighton
256. 11/02/2026 — Crystal Palace 2–3 Burnley
257. 11/02/2026 — Man City 3–0 Fulham
258. 11/02/2026 — Nott'm Forest 0–0 Wolves
259. 11/02/2026 — Sunderland 0–1 Liverpool
260. 12/02/2026 — Brentford 1–1 Arsenal
261. 18/02/2026 — Wolves 2–2 Arsenal
262. 21/02/2026 — Aston Villa 1–1 Leeds
263. 21/02/2026 — Brentford 0–2 Brighton
264. 21/02/2026 — Chelsea 1–1 Burnley
265. 21/02/2026 — West Ham 0–0 Bournemouth
266. 21/02/2026 — Man City 2–1 Newcastle
267. 22/02/2026 — Crystal Palace 1–0 Wolves
268. 22/02/2026 — Nott'm Forest 0–1 Liverpool
269. 22/02/2026 — Sunderland 1–3 Fulham
270. 22/02/2026 — Tottenham 1–4 Arsenal
271. 23/02/2026 — Everton 0–1 Man United
272. 27/02/2026 — Wolves 2–0 Aston Villa
273. 28/02/2026 — Bournemouth 1–1 Sunderland
274. 28/02/2026 — Burnley 3–4 Brentford
275. 28/02/2026 — Liverpool 5–2 West Ham
276. 28/02/2026 — Newcastle 2–3 Everton
277. 28/02/2026 — Leeds 0–1 Man City
278. 01/03/2026 — Brighton 2–1 Nott'm Forest
279. 01/03/2026 — Fulham 2–1 Tottenham
280. 01/03/2026 — Man United 2–1 Crystal Palace
281. 01/03/2026 — Arsenal 2–1 Chelsea
282. 03/03/2026 — Bournemouth 0–0 Brentford
283. 03/03/2026 — Everton 2–0 Burnley
284. 03/03/2026 — Leeds 0–1 Sunderland
285. 03/03/2026 — Wolves 2–1 Liverpool
286. 04/03/2026 — Aston Villa 1–4 Chelsea
287. 04/03/2026 — Brighton 0–1 Arsenal
288. 04/03/2026 — Fulham 0–1 West Ham
289. 04/03/2026 — Man City 2–2 Nott'm Forest
290. 04/03/2026 — Newcastle 2–1 Man United
291. 05/03/2026 — Tottenham 1–3 Crystal Palace
292. 14/03/2026 — Burnley 0–0 Bournemouth
293. 14/03/2026 — Sunderland 0–1 Brighton
294. 14/03/2026 — Arsenal 2–0 Everton
295. 14/03/2026 — Chelsea 0–1 Newcastle
296. 14/03/2026 — West Ham 1–1 Man City
297. 15/03/2026 — Crystal Palace 0–0 Leeds
298. 15/03/2026 — Man United 3–1 Aston Villa
299. 15/03/2026 — Nott'm Forest 0–0 Fulham
300. 15/03/2026 — Liverpool 1–1 Tottenham
301. 16/03/2026 — Brentford 2–2 Wolves
302. 20/03/2026 — Bournemouth 2–2 Man United
303. 21/03/2026 — Brighton 2–1 Liverpool
304. 21/03/2026 — Fulham 3–1 Burnley
305. 21/03/2026 — Everton 3–0 Chelsea
306. 21/03/2026 — Leeds 0–0 Brentford
307. 22/03/2026 — Newcastle 1–2 Sunderland
308. 22/03/2026 — Aston Villa 2–0 West Ham
309. 22/03/2026 — Tottenham 0–3 Nott'm Forest
310. 10/04/2026 — West Ham 4–0 Wolves
311. 11/04/2026 — Arsenal 1–2 Bournemouth
312. 11/04/2026 — Brentford 2–2 Everton
313. 11/04/2026 — Burnley 0–2 Brighton
314. 11/04/2026 — Liverpool 2–0 Fulham
315. 12/04/2026 — Crystal Palace 2–1 Newcastle
316. 12/04/2026 — Nott'm Forest 1–1 Aston Villa
317. 12/04/2026 — Sunderland 1–0 Tottenham
318. 12/04/2026 — Chelsea 0–3 Man City
319. 13/04/2026 — Man United 1–2 Leeds
320. 18/04/2026 — Brentford 0–0 Fulham
321. 18/04/2026 — Leeds 3–0 Wolves
322. 18/04/2026 — Newcastle 1–2 Bournemouth
323. 18/04/2026 — Tottenham 2–2 Brighton
324. 18/04/2026 — Chelsea 0–1 Man United
325. 19/04/2026 — Aston Villa 4–3 Sunderland
326. 19/04/2026 — Everton 1–2 Liverpool
327. 19/04/2026 — Nott'm Forest 4–1 Burnley
328. 19/04/2026 — Man City 2–1 Arsenal
329. 20/04/2026 — Crystal Palace 0–0 West Ham
330. 21/04/2026 — Brighton 3–0 Chelsea
331. 22/04/2026 — Bournemouth 2–2 Leeds
332. 22/04/2026 — Burnley 0–1 Man City
333. 24/04/2026 — Sunderland 0–5 Nott'm Forest
334. 25/04/2026 — Fulham 1–0 Aston Villa
335. 25/04/2026 — Liverpool 3–1 Crystal Palace
336. 25/04/2026 — West Ham 2–1 Everton
337. 25/04/2026 — Wolves 0–1 Tottenham
338. 25/04/2026 — Arsenal 1–0 Newcastle
339. 27/04/2026 — Man United 2–1 Brentford
340. 01/05/2026 — Leeds 3–1 Burnley
341. 02/05/2026 — Brentford 3–0 West Ham
342. 02/05/2026 — Newcastle 3–1 Brighton
343. 02/05/2026 — Wolves 1–1 Sunderland
344. 02/05/2026 — Arsenal 3–0 Fulham
345. 03/05/2026 — Bournemouth 3–0 Crystal Palace
346. 03/05/2026 — Man United 3–2 Liverpool
347. 03/05/2026 — Aston Villa 1–2 Tottenham
348. 04/05/2026 — Chelsea 1–3 Nott'm Forest
349. 04/05/2026 — Everton 3–3 Man City
350. 09/05/2026 — Liverpool 1–1 Chelsea
351. 09/05/2026 — Brighton 3–0 Wolves
352. 09/05/2026 — Fulham 0–1 Bournemouth
353. 09/05/2026 — Sunderland 0–0 Man United
354. 09/05/2026 — Man City 3–0 Brentford
355. 10/05/2026 — Burnley 2–2 Aston Villa
356. 10/05/2026 — Crystal Palace 2–2 Everton
357. 10/05/2026 — Nott'm Forest 1–1 Newcastle
358. 10/05/2026 — West Ham 0–1 Arsenal
359. 11/05/2026 — Tottenham 1–1 Leeds
360. 13/05/2026 — Man City 3–0 Crystal Palace
$results$, E'\n') as line
where btrim(line, E' \t\r\n') <> '';

create temporary table pp_completed_results_parsed as
select
  (match_data)[1]::integer as match_number,
  to_date((match_data)[2], 'DD/MM/YYYY') as played_on,
  btrim((match_data)[3], E' \t\r\n') as home_alias,
  (match_data)[4]::integer as home_goals,
  (match_data)[5]::integer as away_goals,
  btrim((match_data)[6], E' \t\r\n') as away_alias
from (
  select
    line,
    regexp_match(
      line,
      '^[[:space:]]*([0-9]+)\.[[:space:]]+([0-9]{2}/[0-9]{2}/[0-9]{4})[[:space:]]+[' || chr(8212) || '-][[:space:]]+(.+)[[:space:]]+([0-9]+)[' || chr(8211) || '-]([0-9]+)[[:space:]]+(.+)[[:space:]]*$'
    ) as match_data
  from pp_completed_results_raw
) parsed
where match_data is not null;

create temporary table pp_team_aliases (
  alias text primary key,
  team_key text not null,
  priority integer not null default 100
);

insert into pp_team_aliases (alias, team_key, priority)
values
  ('Arsenal', 'arsenal', 1),
  ('Aston Villa', 'aston_villa', 1),
  ('AFC Bournemouth', 'bournemouth', 1),
  ('Bournemouth', 'bournemouth', 2),
  ('Brentford', 'brentford', 1),
  ('Brighton & Hove Albion', 'brighton', 1),
  ('Brighton', 'brighton', 2),
  ('Burnley', 'burnley', 1),
  ('Chelsea', 'chelsea', 1),
  ('Crystal Palace', 'crystal_palace', 1),
  ('Everton', 'everton', 1),
  ('Fulham', 'fulham', 1),
  ('Leeds United', 'leeds', 1),
  ('Leeds', 'leeds', 2),
  ('Liverpool', 'liverpool', 1),
  ('Manchester City', 'man_city', 1),
  ('Man City', 'man_city', 2),
  ('Manchester United', 'man_u', 1),
  ('Man United', 'man_u', 2),
  ('Man U', 'man_u', 3),
  ('Newcastle United', 'newcastle', 1),
  ('Newcastle', 'newcastle', 2),
  ('Nottingham Forest', 'nottingham_forest', 1),
  ('Nott''m Forest', 'nottingham_forest', 2),
  ('Sunderland', 'sunderland', 1),
  ('Tottenham Hotspur', 'tottenham', 1),
  ('Tottenham', 'tottenham', 2),
  ('West Ham United', 'west_ham', 1),
  ('West Ham', 'west_ham', 2),
  ('Wolverhampton Wanderers', 'wolves', 1),
  ('Wolverhampton', 'wolves', 2),
  ('Wolves', 'wolves', 3);

create temporary table pp_team_lookup as
select distinct on (a.team_key)
  a.team_key,
  t.id,
  t.name
from pp_team_aliases a
join public.teams t on lower(t.name) = lower(a.alias)
order by a.team_key, a.priority, t.name;

create temporary table pp_completed_results_mapped as
with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
),
fixture_slots as (
  select
    f.id as fixture_id,
    row_number() over (order by gw.number, f.sort_order, f.kickoff_at, f.id) as match_number
  from public.fixtures f
  join public.gameweeks gw
    on gw.id = f.gameweek_id
   and gw.season_id = f.season_id
  join target_season s on s.id = f.season_id
  where gw.number between 1 and 36
)
select
  p.*,
  htl.name as home_team_name,
  atl.name as away_team_name,
  ht.id as home_team_id,
  at.id as away_team_id,
  fs.fixture_id
from pp_completed_results_parsed p
left join pp_team_aliases ha on lower(ha.alias) = lower(p.home_alias)
left join pp_team_aliases aa on lower(aa.alias) = lower(p.away_alias)
left join pp_team_lookup htl on htl.team_key = ha.team_key
left join pp_team_lookup atl on atl.team_key = aa.team_key
left join public.teams ht on ht.id = htl.id
left join public.teams at on at.id = atl.id
left join fixture_slots fs on fs.match_number = p.match_number;

-- Clear previous attempts for this season, then rebuild from the ordered result list.
with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
)
delete from public.match_results mr
using public.fixtures f, target_season s
where mr.fixture_id = f.id
  and f.season_id = s.id;

update public.fixtures f
set
  home_team_id = m.home_team_id,
  away_team_id = m.away_team_id,
  kickoff_at = make_timestamptz(
    extract(year from m.played_on)::integer,
    extract(month from m.played_on)::integer,
    extract(day from m.played_on)::integer,
    15,
    0,
    0,
    'Europe/London'
  ),
  status = 'final'
from pp_completed_results_mapped m
where m.fixture_id = f.id
  and m.home_team_id is not null
  and m.away_team_id is not null;

with target_season as (
  select id
  from public.seasons
  where name = 'Premier League 2025-26'
  order by created_at desc
  limit 1
)
update public.fixtures f
set status = 'scheduled'
from public.gameweeks gw, target_season s
where gw.id = f.gameweek_id
  and gw.season_id = f.season_id
  and f.season_id = s.id
  and gw.number in (37, 38)
  and f.status = 'final';

insert into public.match_results (
  fixture_id,
  home_goals,
  away_goals,
  entered_by,
  finalized_at
)
select
  fixture_id,
  home_goals,
  away_goals,
  null,
  now()
from pp_completed_results_mapped
where fixture_id is not null
  and home_team_id is not null
  and away_team_id is not null
on conflict (fixture_id) do update
set
  home_goals = excluded.home_goals,
  away_goals = excluded.away_goals,
  entered_by = excluded.entered_by,
  finalized_at = excluded.finalized_at,
  updated_at = now();

select
  (select count(*) from pp_completed_results_raw) as raw_lines,
  (select count(*) from pp_completed_results_parsed) as parsed_results,
  (select count(*) from pp_completed_results_mapped where fixture_id is not null and home_team_id is not null and away_team_id is not null) as matched_fixtures,
  (select count(*) from pp_completed_results_mapped where fixture_id is null or home_team_id is null or away_team_id is null) as unmatched_fixtures,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'match_number', match_number,
        'home', home_alias,
        'away', away_alias,
        'home_team_name', home_team_name,
        'away_team_name', away_team_name,
        'home_team_found', home_team_id is not null,
        'away_team_found', away_team_id is not null,
        'fixture_slot_found', fixture_id is not null
      )
      order by match_number
    ) filter (where fixture_id is null or home_team_id is null or away_team_id is null),
    '[]'::jsonb
  ) as unmatched_rows
from pp_completed_results_mapped;
