import { chromium } from 'playwright';
const B='http://localhost:4173';
const PW={admin:'Admin@123',waiter1:'Waiter@123',cashier:'Cashier@123',kitchen:'Kitchen@123'};
const PLAN={
 admin:['/admin','/admin/inventory','/admin/inventory/items','/admin/inventory/movements','/admin/purchases','/admin/suppliers','/admin/menu/items','/admin/menu/categories','/admin/offers','/admin/floors','/admin/tables','/admin/reports','/admin/reports/advanced','/admin/roles','/admin/users','/admin/settings','/admin/audit','/admin/reservations','/admin/vip','/admin/club','/admin/bottle-service','/admin/customers','/admin/loyalty','/admin/orders','/admin/notifications','/admin/branches','/admin/room-charges','/admin/recipes','/admin/qr','/profile'],
 waiter1:['/waiter','/waiter/tables','/waiter/ready','/waiter/orders'],
 cashier:['/cashier','/cashier/bills','/cashier/paid','/cashier/tables'],
 kitchen:['/kitchen'],
};
const WID=[[Number(process.argv[2]||390), Number(process.argv[3]||844)]];
const b=await chromium.launch({args:['--no-sandbox','--disable-gpu']});
const settle=async p=>{await p.waitForLoadState('networkidle').catch(()=>{});await p.waitForTimeout(300);};
const probe=()=>{
 const vw=document.documentElement.clientWidth;
 const scrollable=el=>{for(let n=el;n&&n!==document.body;n=n.parentElement){if(/(auto|scroll)/.test(getComputedStyle(n).overflowX))return true;}return false;};
 const over=[];
 document.querySelectorAll('body *').forEach(el=>{const r=el.getBoundingClientRect();if(r.width===0||r.height===0)return;
  if(r.right>vw+1&&!scrollable(el))over.push(el.tagName.toLowerCase()+'.'+String(el.className?.baseVal??el.className??'').slice(0,45));});
 const name=el=>(el.getAttribute('aria-label')||el.getAttribute('title')||(el.textContent||'').trim()||(el.closest('label')?'wrapped':'')).trim();
 const unnamed=[...document.querySelectorAll('button,a[href]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!name(e);}).length;
 return {vw,doc:document.documentElement.scrollWidth,over:over.slice(0,2),unnamed};
};
let o=0,u=0,n=0;
for(const [w,h] of WID){
 for(const [user,routes] of Object.entries(PLAN)){
  const c=await b.newContext({viewport:{width:w,height:h}});const p=await c.newPage();
  await p.goto(B+'/login',{waitUntil:'domcontentloaded'});await settle(p);
  await p.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(user);
  await p.locator('input[type="password"]').first().fill(PW[user]);
  await p.locator('button[type="submit"]').first().click();await p.waitForTimeout(1500);await settle(p);
  for(const path of routes){n++;await p.goto(B+path,{waitUntil:'domcontentloaded'});await settle(p);
   const r=await p.evaluate(probe);
   if(r.doc>r.vw+1){o++;console.log(`OVERFLOW @${w} ${path} doc=${r.doc} ${r.over.join(' | ')}`);}
   if(r.unnamed){u+=r.unnamed;console.log(`UNNAMED @${w} ${path} n=${r.unnamed}`);}
  }
  await c.close();
 }
}
await b.close();console.log(`\nCHECKED ${n} route-widths | overflow=${o} | unnamed controls=${u}`);
