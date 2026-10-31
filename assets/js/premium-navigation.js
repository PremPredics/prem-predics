import { escapeHtml, getCompetitionIdFromUrl, leagueUrl } from './league-context.js';
import { getSessionUser, onSessionUserChange } from './session-user.js';

// A navigation-only layer. No router, score queries, redirects or card actions.
const predictions = ['prediction-hub.html','predictions.html','all-predictions.html'];
const starMan = ['star-man-hub.html','star-man.html','all-star-men.html'];
const gameplay = [...predictions,...starMan,'game-card.html'];
const allowed = new Set(['league.html',...gameplay,'power-cards.html','leaderboard.html','correct-scores.html','statistics.html','medals.html','live-curses.html','awards.html']);
const page = location.pathname.split('/').pop();
const competitionId = getCompetitionIdFromUrl();
// Native full-page navigation preserves history and existing page loading.
const icons = {
  predictions:'M6 3h12v18H6zM9 7h6M9 11h6M9 15h2m2 0h2',
  hub:'m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9',
  cards:'m8 3 12 3-4 15-12-3zM9 8l6 2M8 12l4 1',
  star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z',
  game:'M4 6h16v14H4zM8 3v6m8-6v6M4 11h16m-12 4h2m4 0h2',
  draw:'M4 8h16v12H4zM3 5h18v4H3zM12 5v15m0-15C7-1 3 5 8 5Zm0 0c5-6 9 0 4 0Z',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]}"/></svg>`;
const groups = {
  predictions:[['Predictions','predictions.html','predictions','','predictions'],['Star Man','star-man.html','star','','star'],['Game Card','game-card.html','game','','game']],
  cards:[['Cards','power-cards.html','cards','','cards'],['Shop','power-cards.html','draw','#shop','shop']],
};
let shell, top, openGroup=null, observer, scheduled=false;
const eligibleDocument=()=>document.body.matches('[data-require-auth="true"][data-require-league="true"]') || page==='awards.html'&&Boolean(document.querySelector('.awards-shell'));
const overlaySelector='dialog,[role="dialog"],[aria-modal="true"],[class*="modal"],.hub-choice-overlay,.league-menu-shade,.fullscreen-card-reveal,.premium-pack-reveal,.super-draw-reveal,.countdown-overlay,.cards-shuffle-display,.sign-out-dialog,.pp-page-loader';
let viewportHeight=window.visualViewport?.height||innerHeight;
const isShopView=()=>page==='power-cards.html'&&['#shop','#primarySideActions'].includes(location.hash);
function syncCardsView() {
  if(page!=='power-cards.html')return;
  const panel=document.getElementById('cardsShopPanel');
  if(!panel)return;
  const show=isShopView();
  panel.hidden=!show;
  document.body.classList.toggle('pp-cards-shop-view',show);
}
function link(label,destination,hash='',current=false,tone='') {
  return `<a href="${escapeHtml(leagueUrl(destination,competitionId)+hash)}"${tone?` data-nav-tone="${tone}"`:''}${current?` aria-current="${hash?'location':destination===page?'page':'true'}"`:''}>${escapeHtml(label)}</a>`;
}
function renderTop() {
  if(!top)return;
  const isCards=page==='power-cards.html',shop=isShopView();
  const index=isCards?(shop?1:0):starMan.includes(page)?1:page==='game-card.html'?2:0;
  const items=isCards?groups.cards:groups.predictions;
  let secondary='',secondaryIndex=0;
  if(['predictions.html','all-predictions.html'].includes(page)) {
    secondaryIndex=page==='all-predictions.html'?1:0;
    secondary=link('Make Predictions','predictions.html','',page==='predictions.html','sub')+link('View All Player Predictions','all-predictions.html','',page==='all-predictions.html','sub');
  }
  if(['star-man.html','all-star-men.html'].includes(page)) {
    secondaryIndex=page==='all-star-men.html'?1:0;
    secondary=link('Pick Star Man','star-man.html','',page==='star-man.html','sub')+link('View All Player Star Men','all-star-men.html','',page==='all-star-men.html','sub');
  }
  top.innerHTML=`<nav class="pp-nav-primary" aria-label="${isCards?'Cards':'Predictions'}" data-current-tone="${items[index][4]}" style="--pp-nav-count:${items.length};--pp-nav-index:${index}">${items.map(([label,dest,,hash,tone],i)=>link(label,dest,hash||'',i===index,tone)).join('')}</nav>`+
    (secondary?`<nav class="pp-nav-secondary" aria-label="${starMan.includes(page)?'Star Man':'Predictions'}" style="--pp-nav-index:${secondaryIndex}">${secondary}</nav>`:'');
  syncCardsView();
}
function closeGroup(restore=false) {
  if(!shell)return;
  const previous=openGroup; openGroup=null;
  shell.querySelector('.pp-nav-flyout').hidden=true;
  shell.querySelectorAll('[data-nav-group]').forEach(button=>button.setAttribute('aria-expanded','false'));
  if(restore&&previous)shell.querySelector(`[data-nav-group="${previous}"]`)?.focus({preventScroll:true});
}
function toggleGroup(group) {
  if(openGroup===group){closeGroup(true);return;}
  openGroup=group;
  const flyout=shell.querySelector('.pp-nav-flyout');
  flyout.innerHTML=groups[group].map(([label,dest,svg,hash,tone])=>{
    const current=dest===page&&(hash?isShopView():!isShopView());
    return `<a href="${escapeHtml(leagueUrl(dest,competitionId)+(hash||''))}" data-nav-tone="${tone}"${current?' aria-current="location"':''}>${icon(svg)}<span>${label}</span><svg class="pp-nav-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></a>`;
  }).join('');
  flyout.setAttribute('aria-label',group==='cards'?'Cards':'Predictions');
  shell.querySelectorAll('[data-nav-group]').forEach(button=>button.setAttribute('aria-expanded',String(button.dataset.navGroup===group)));
  flyout.hidden=false;
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&flyout.animate)flyout.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:160,easing:'cubic-bezier(.2,.8,.2,1)'});
  flyout.querySelector('a')?.focus({preventScroll:true});
}
function syncVisibility() {
  scheduled=false;
  if(!shell)return;
  if(!shell.isConnected){destroy();return;}
  const field=document.activeElement?.matches('input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable="true"]');
  const height=window.visualViewport?.height||innerHeight;
  if(!field)viewportHeight=height;
  const keyboard=field&&viewportHeight-height>100&&(window.visualViewport?.scale||1)===1;
  const overlay=document.body.matches('.league-menu-open,.choice-panel-open,.card-preview-open')||[...document.querySelectorAll(overlaySelector)].some(el=>{
    if(el.closest('[data-premium-nav]')||el.hidden)return false;
    const style=getComputedStyle(el);
    // A just-opened modal can be at opacity 0 on its first animation frame.
    const opening=el.classList.contains('show')||el.getAttribute('aria-hidden')==='false'||el.open;
    return style.display!=='none'&&style.visibility!=='hidden'&&(opening||Number(style.opacity)!==0)&&el.getClientRects().length>0;
  });
  const hidden=Boolean(keyboard||overlay);
  shell.classList.toggle('pp-nav-obscured',hidden);shell.inert=hidden;
  if(hidden)closeGroup();
}
function scheduleVisibility(){if(!scheduled){scheduled=true;requestAnimationFrame(syncVisibility);}}
function destroy() {
  shell?.remove();top?.remove();shell=null;top=null;
  document.documentElement.classList.remove('pp-nav-enabled');
  observer?.disconnect();
}
function mount() {
  if(shell||!eligibleDocument())return;
  const category=gameplay.includes(page)?'predictions':page==='power-cards.html'?'cards':'hub';
  document.documentElement.style.setProperty('--pp-nav-original-bottom',getComputedStyle(document.body).paddingBottom);
  document.documentElement.classList.add('pp-nav-enabled');
  shell=document.createElement('div');shell.className='pp-nav-shell';shell.dataset.premiumNav='';
  shell.innerHTML=`<nav class="pp-nav-flyout" id="pp-nav-flyout" hidden></nav><nav class="pp-nav-dock" data-current-section="${category}" aria-label="Private league navigation">
    <button type="button" data-nav-group="predictions" data-nav-tone="predictions" aria-expanded="false" aria-controls="pp-nav-flyout" class="${category==='predictions'?'is-active':''}"${category==='predictions'?' aria-current="true"':''}>${icon('predictions')}<span>Predictions</span></button>
    <a class="pp-nav-home ${category==='hub'?'is-active':''}" data-nav-tone="hub" href="${escapeHtml(leagueUrl('league.html',competitionId))}"${category==='hub'?' aria-current="page"':''}>${icon('hub')}<span>League Hub</span></a>
    <button type="button" data-nav-group="cards" data-nav-tone="cards" aria-expanded="false" aria-controls="pp-nav-flyout" class="${category==='cards'?'is-active':''}"${category==='cards'?' aria-current="true"':''}>${icon('cards')}<span>Cards</span></button></nav>`;
  document.body.append(shell);
  shell.addEventListener('click',event=>{const button=event.target.closest('[data-nav-group]');if(button)toggleGroup(button.dataset.navGroup);else if(event.target.closest('a'))closeGroup();});
  if(gameplay.includes(page)||page==='power-cards.html') {
    const header=document.querySelector('body > header, .awards-header, body > h1');
    if(header){top=document.createElement('div');top.className='pp-nav-top';top.dataset.premiumNav='';header.after(top);renderTop();}
  }
  observer=new MutationObserver(records=>{
    if(records.some(r=>r.target===document.body||r.target.matches?.(overlaySelector)||r.type==='childList'&&[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches(overlaySelector)||n.querySelector(overlaySelector)))))scheduleVisibility();
  });
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','open','aria-hidden']});
  scheduleVisibility();
}
if(allowed.has(page)&&competitionId&&eligibleDocument()) {
  // Reuse the shared local session read. Membership/RLS remain owned by existing guards.
  getSessionUser().then(user=>{if(user)mount();}).catch(()=>{});
  onSessionUserChange((user,event)=>{if(!user&&event==='SIGNED_OUT')destroy();});
  window.addEventListener('pagehide',()=>closeGroup());
  window.addEventListener('pageshow',()=>{renderTop();scheduleVisibility();});
  window.addEventListener('hashchange',()=>{renderTop();closeGroup();});
  document.addEventListener('keydown',event=>{if(openGroup&&event.key==='Escape'){event.preventDefault();closeGroup(true);}});
  document.addEventListener('pointerdown',event=>{if(openGroup&&!shell?.contains(event.target))closeGroup();});
  document.addEventListener('focusin',event=>{if(openGroup&&!shell?.contains(event.target))closeGroup();scheduleVisibility();});
  document.addEventListener('focusout',scheduleVisibility);
  for(const event of ['transitionend','animationend'])document.addEventListener(event,e=>{if(e.target.matches?.(overlaySelector))scheduleVisibility();});
  window.visualViewport?.addEventListener('resize',scheduleVisibility,{passive:true});
  window.addEventListener('resize',scheduleVisibility,{passive:true});
}
