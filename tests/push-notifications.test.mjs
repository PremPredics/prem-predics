import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {kickoffLabel} from '../assets/js/prediction-kickoff.js';
import {allowedPushEndpoint,notificationTTL} from '../supabase/functions/gameweek-notifications/push-policy.js';

test('kick-off labels use UK time including GMT/BST and invalid dates',()=>{
  assert.equal(kickoffLabel('2026-10-18T13:00:00Z'),'SUN 14:00');
  assert.equal(kickoffLabel('2026-11-02T20:00:00Z'),'MON 20:00');
  assert.equal(kickoffLabel(null),'TBC');
  assert.equal(kickoffLabel('invalid'),'TBC');
});
test('push delivery accepts only known HTTPS push providers, without redirects or credentials',()=>{
  for(const value of ['https://fcm.googleapis.com/fcm/send/test','https://web.push.apple.com/test','https://updates.push.services.mozilla.com/wpush/test','https://wns2.notify.windows.com/test']) assert.equal(allowedPushEndpoint(value),true,value);
  for(const value of ['http://fcm.googleapis.com/test','https://localhost/test','https://127.0.0.1/test','https://fcm.googleapis.com.evil.test/test','https://fcm.googleapis.com@evil.test/test','https://fcm.googleapis.com:8000/test','https://fcmXgoogleapisXcom/test']) assert.equal(allowedPushEndpoint(value),false,value);
});
test('expired reminders cannot be sent; end-of-week notices never persist over 24 hours',()=>{
  const now=Date.parse('2026-10-18T12:00:00Z');
  assert.equal(notificationTTL('2026-10-18T12:05:00Z',now),300);
  assert.equal(notificationTTL('2026-10-18T11:00:00Z',now),0);
  assert.equal(notificationTTL('2026-10-22T12:00:00Z',now),86400);
  assert.equal(notificationTTL('invalid',now),0);
});
test('service worker shows text safely, coalesces event tags and ignores external click URLs',async()=>{
  const handlers={}; const shown=[]; const opened=[];
  vm.runInNewContext(readFileSync(new URL('../service-worker.js',import.meta.url),'utf8'),{
    URL,Set,Request,
    self:{addEventListener:(name,fn)=>handlers[name]=fn,
      registration:{scope:'https://prempredics.com/',showNotification:async(...args)=>shown.push(args)},
      clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}},
  });
  let pending;
  handlers.push({data:{json:()=>({body:'Gameweek 1 has ended!',tag:'gw1',url:'https://evil.test'})},waitUntil:p=>pending=p});
  await pending;
  assert.equal(shown[0][1].body,'Gameweek 1 has ended!');
  assert.equal(shown[0][1].tag,'gw1');
  assert.equal(shown[0][1].renotify,false);
  handlers.notificationclick({notification:{close(){}},waitUntil:p=>pending=p});
  await pending;
  assert.deepEqual(opened,['https://prempredics.com/index.html']);
});
