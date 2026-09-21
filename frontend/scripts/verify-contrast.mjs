import { chromium } from 'playwright';
const B='http://localhost:4173';
const PW={admin:'Admin@123',waiter1:'Waiter@123',cashier:'Cashier@123',kitchen:'Kitchen@123'};
const PLAN={admin:['/admin','/admin/inventory','/admin/purchases','/admin/reports','/admin/roles','/admin/settings','/admin/audit','/admin/vip','/admin/club','/admin/customers','/admin/menu/items','/admin/offers','/admin/notifications','/admin/branches','/admin/reservations','/profile'],
 waiter1:['/waiter','/waiter/tables','/waiter/ready'],cashier:['/cashier','/cashier/bills'],kitchen:['/kitchen']};
const b=await chromium.launch({args:['--no-sandbox','--disable-gpu']});
const settle=async p=>{await p.waitForLoadState('networkidle').catch(()=>{});await p.waitForTimeout(350);};
const probe=()=>{
 const lum=(r,g,bl)=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(bl);};
 const parse=s=>{const m=s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);return m?{r:+m[1],g:+m[2],b:+m[3],a:m[4]===undefined?1:+m[4]}:null;};
 const bgOf=el=>{for(let n=el;n;n=n.parentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c&&c.a>0.9)return c;}return {r:8,g:10,b:12};};
 const bad=[];
 document.querySelectorAll('body *').forEach(el=>{
   if(el.children.length) return;
   const t=(el.textContent||'').trim(); if(!t) return;
   const r=el.getBoundingClientRect(); if(r.width<=0||r.height<=0) return;
   const s=getComputedStyle(el); if(s.visibility==='hidden'||s.opacity==='0') return;
   const fg=parse(s.color); if(!fg||fg.a<0.9) return;
   const bg=bgOf(el);
   const L1=lum(fg.r,fg.g,fg.b),L2=lum(bg.r,bg.g,bg.b);
   const ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
   const px=parseFloat(s.fontSize), bold=parseInt(s.fontWeight,10)>=700;
   const need=(px>=24||(px>=18.66&&bold))?3:4.5;
   if(ratio<need) bad.push(`${t.slice(0,26)} ${ratio.toFixed(2)}:1 (need ${need}) ${s.color} on rgb(${bg.r},${bg.g},${bg.b}) ${px}px`);
 });
 return [...new Set(bad)].slice(0,4);
};
let n=0;
for(const [user,routes] of Object.entries(PLAN)){
 const c=await b.newContext({viewport:{width:1280,height:900}});const p=await c.newPage();
 await p.goto(B+'/login',{waitUntil:'domcontentloaded'});await settle(p);
 await p.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(user);
 await p.locator('input[type="password"]').first().fill(PW[user]);
 await p.locator('button[type="submit"]').first().click();await p.waitForTimeout(1600);await settle(p);
 for(const path of routes){await p.goto(B+path,{waitUntil:'domcontentloaded'});await settle(p);
  const r=await p.evaluate(probe); if(r.length){n+=r.length;console.log(`CONTRAST ${path}\n   `+r.join('\n   '));}}
 await c.close();
}
await b.close();console.log(n?`\n${n} contrast findings`:'\nNo text below its WCAG AA threshold on any checked route');
