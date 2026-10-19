const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Vas/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const teams=['Arsenal','Bournemouth','Aston Villa','Brentford','Brighton','Chelsea','Coventry','Crystal Palace','Everton','Fulham','Hull','Ipswich','Leeds','Liverpool','Man City','Man U',"Nott'm Forest",'Newcastle','Sunderland','Tottenham'];
const fixtures=Array.from({length:10},(_,i)=>({id:'fixture-'+i,gameweek_id:1,season_id:'season',home_team_id:'team-'+i*2,away_team_id:'team-'+(i*2+1),kickoff_at:'2030-10-20T13:00:00Z',prediction_locks_at:'2030-10-20T11:30:00Z',status:'scheduled'}));
const tables={teams:teams.map((name,i)=>({id:'team-'+i,name})),fixtures,predictions:[],active_card_effects:[],curse_hated_forced_predictions:[],curse_gambler_rolls:[]};
const mock=`
const tables=${JSON.stringify(tables)};
class Query {
 constructor(name){this.name=name}
 select(){return this} eq(){return this} in(){return this} order(){return this} abortSignal(){return this} maybeSingle(){this.single=true;return this}
 upsert(rows){window.savedPredictions=rows;return this} delete(){window.notificationsSaved=null;return this}
 then(resolve,reject){return Promise.resolve({data:this.name==='pp_push_subscriptions'?window.notificationsSaved:(tables[this.name]||[]),error:null}).then(resolve,reject)}
}
export const supabase={from:name=>new Query(name),rpc:async(name,args)=>{
 if(name==='pp_push_public_key')return {data:'B'+ 'A'.repeat(86),error:null};
 window.notificationsSaved={gameweek_ended:args.p_ended,deadline_reminder:args.p_deadline};return {error:null};
},auth:{getUser:async()=>({data:{user:{id:'user'}},error:null}),getSession:async()=>({data:{session:{user:{id:'user'}}}})}};
`;
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
 for(const width of [360,390,430,768,1440]){
  const context=await browser.newContext({viewport:{width,height:width<500?780:1000},serviceWorkers:'block'});
  const page=await context.newPage(); const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*.html*',async route=>{
   const file=new URL(route.request().url()).pathname.split('/').pop()||'index.html';
   const html=fs.readFileSync(file,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace('pp-page-loading','').replace('</body>','<script type="module" src="assets/js/notifications.js"></script>'+(file==='predictions.html'?'<script type="module" src="assets/js/predictions.js"></script>':'')+'</body>');
   await route.fulfill({contentType:'text/html',body:html});
  });
  await page.route('**/assets/js/supabase-client.js',route=>route.fulfill({contentType:'text/javascript',body:mock}));
  await page.route('**/assets/js/league-context.js',route=>route.fulfill({contentType:'text/javascript',body:`
   export const escapeHtml=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
   export const formatDateTime=s=>s, shortTeamName=s=>s, leagueUrl=p=>p;
   export const loadLeagueContext=async()=>({user:{id:'user'},league:{id:'league',season_id:'season'}});
  `}));
  await page.route('**/assets/js/gameweek-context.js',route=>route.fulfill({contentType:'text/javascript',body:'export const loadActiveGameweek=async()=>({activeGameweek:{gameweek_id:1,gameweek_number:1,first_fixture_kickoff_at:"2030-10-20T13:00:00Z"}});'}));
  await page.addInitScript(()=>{
    window.permissionRequests=0;window.unsubscribed=0;
    let subscribed=false;
    const sub={endpoint:'https://fcm.googleapis.com/test',toJSON:()=>({endpoint:'https://fcm.googleapis.com/test',keys:{p256dh:'B'+'A'.repeat(86),auth:'A'.repeat(22)}}),unsubscribe:async()=>{subscribed=false;window.unsubscribed++;return true}};
    const registration={pushManager:{getSubscription:async()=>subscribed?sub:null,subscribe:async()=>{subscribed=true;return sub}}};
    Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>registration,ready:Promise.resolve(registration),getRegistration:async()=>registration}});
    window.PushManager=function(){};
    window.Notification={permission:'default',requestPermission:async()=>{window.permissionRequests++;return 'granted'}};
  });
  await page.goto('http://localhost:4173/predictions.html');
  await page.waitForSelector('.prediction-row-frame');
  assert.equal(await page.locator('[data-fixture-id]').count(),10);
  assert.equal(await page.locator('.prediction-gameweek').count(),0);
  assert.match(await page.locator('.prediction-kickoff').first().textContent(),/SUN 14:00/);
  const geometry=await page.evaluate(()=>({last:document.querySelector('[data-fixture-id="fixture-9"]').getBoundingClientRect().bottom,width:document.documentElement.scrollWidth,viewport:innerWidth,headers:[...document.querySelectorAll('.prediction-column-headings span')].map(e=>e.textContent)}));
  assert.ok(geometry.last<780,JSON.stringify(geometry));
  assert.ok(geometry.width<=width,JSON.stringify(geometry));
  assert.deepEqual(geometry.headers,['Kick Off Time','Game','Fixture Lock']);
  await page.locator('[data-home-goals]').first().fill('2');
  await page.locator('[data-away-goals]').first().fill('1');
  await page.locator('[data-save-all]').click();
  await page.waitForSelector('.prediction-score-axis--saved');
  assert.equal(await page.evaluate(()=>savedPredictions[0].home_goals),2);
  await page.locator('[data-edit-predictions]').click();
  assert.equal(await page.locator('[data-home-goals]').first().inputValue(),'2');
  assert.equal(await page.evaluate(()=>permissionRequests),0);
  await page.getByRole('button',{name:'Notification settings'}).click();
  await page.getByRole('button',{name:'Save settings'}).waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('.pp-notification-dialog button[type=submit]').disabled);
  assert.equal(await page.locator('.pp-notification-dialog input:checked').count(),0);
  await page.getByLabel('Gameweek finished notifications').check();
  await page.getByRole('button',{name:'Save settings'}).click();
  await page.waitForFunction(()=>window.notificationsSaved?.gameweek_ended===true);
  assert.equal(await page.evaluate(()=>notificationsSaved.deadline_reminder),false);
  assert.equal(await page.evaluate(()=>permissionRequests),1);
  await page.getByLabel('Gameweek finished notifications').uncheck();
  await page.getByRole('button',{name:'Save settings'}).click();
  await page.waitForFunction(()=>window.unsubscribed===1);
  await page.getByRole('button',{name:'Back',exact:true}).click();
  fs.mkdirSync('outputs/notification-check',{recursive:true});
  await page.screenshot({path:'outputs/notification-check/predictions-'+width+'.png',fullPage:true});
  assert.deepEqual(errors,[]);
  for(const file of ['index.html','league.html','power-cards.html','awards.html']){
    await page.goto('http://localhost:4173/'+file);
    await page.waitForSelector('.pp-notification-bell');
    const rect=await page.locator('.pp-notification-bell').boundingBox();
    assert.ok(rect.x>=0 && rect.x+rect.width<=width, file+' bell outside viewport');
    if(width===390) await page.screenshot({path:'outputs/notification-check/'+file+'.png'});
  }
  console.log('PASS viewport',width,'10 fixtures, save/edit, notification opt-in/off, header bell',geometry);
  await context.close();
 }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
