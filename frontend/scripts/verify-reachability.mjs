import { chromium } from 'playwright';
const B='http://localhost:4173';
const PW={admin:'Admin@123',waiter1:'Waiter@123',cashier:'Cashier@123'};
const CASES=[
 ['admin','/admin/settings'],['admin','/admin/roles'],['admin','/admin/users'],
 ['admin','/admin/audit'],['admin','/admin/reports'],['admin','/admin/inventory'],
 ['admin','/admin/reservations'],['admin','/admin/vip'],['admin','/profile'],
 ['waiter1','/waiter'],['waiter1','/waiter/ready'],['cashier','/cashier'],['cashier','/cashier/bills'],
];
const b=await chromium.launch({args:['--no-sandbox','--disable-gpu']});
const settle=async p=>{await p.waitForLoadState('networkidle').catch(()=>{});await p.waitForTimeout(700);};
let fail=0;
for(const [user,route] of CASES){
 const c=await b.newContext({viewport:{width:390,height:844}});const p=await c.newPage();
 await p.goto(B+'/login',{waitUntil:'domcontentloaded'});await settle(p);
 await p.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(user);
 await p.locator('input[type="password"]').first().fill(PW[user]);
 await p.locator('button[type="submit"]').first().click();await p.waitForTimeout(1600);
 await p.goto(B+route,{waitUntil:'domcontentloaded'});await settle(p);
 // scroll to the very bottom, twice (lazy content)
 await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await p.waitForTimeout(500);
 await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await p.waitForTimeout(500);
 const r=await p.evaluate(()=>{
  const vh=window.innerHeight;
  const nav=document.querySelector('nav[data-bottom-nav]');
  const navTop=nav?nav.getBoundingClientRect().top:vh;
  const bar=document.querySelector('.save-bar');
  const barTop=bar?bar.getBoundingClientRect().top:vh;
  const ceiling=Math.min(navTop,barTop);
  // last interactive control that is NOT inside the nav or the bar
  const all=[...document.querySelectorAll('main button, main a[href], main input, main select, main textarea')]
    .filter(e=>!e.closest('nav[data-bottom-nav]')&&!e.closest('.save-bar'))
    .filter(e=>{const x=e.getBoundingClientRect();return x.width>0&&x.height>0;});
  const last=all[all.length-1];
  if(!last)return{ok:true,note:'no controls'};
  const x=last.getBoundingClientRect();
  return {ok:x.bottom<=ceiling+1, ceiling:Math.round(ceiling), bottom:Math.round(x.bottom),
          label:((last.textContent||last.getAttribute('aria-label')||last.tagName).trim()||'?').slice(0,30),
          atEnd: Math.abs(window.scrollY + vh - document.documentElement.scrollHeight) < 3};
 });
 const tag = r.ok?'OK  ':'FAIL';
 if(!r.ok)fail++;
 console.log(`${tag} ${route.padEnd(22)} last="${r.label??''}" bottom=${r.bottom??'-'} ceiling=${r.ceiling??'-'} scrolledToEnd=${r.atEnd??'-'}`);
 await c.close();
}
await b.close();
console.log(fail?`\n${fail} screens hide their last control`:'\nEvery screen: last control clears the bottom nav and the save bar after scrolling to the end');
