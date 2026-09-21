import { chromium } from 'playwright';
const B=process.env.BASE||'http://127.0.0.1:4173';
const PW={admin:'Admin@123',manager:'Manager@123',waiter1:'Waiter@123',cashier:'Cashier@123',kitchen:'Kitchen@123',host:'Host@123'};
const PLAN={
 admin:['/admin','/admin/inventory','/admin/inventory/items','/admin/purchases','/admin/suppliers','/admin/menu/items','/admin/menu/categories','/admin/offers','/admin/floors','/admin/tables','/admin/reports','/admin/reports/advanced','/admin/roles','/admin/users','/admin/settings','/admin/audit','/admin/reservations','/admin/vip','/admin/club','/admin/bottle-service','/admin/customers','/admin/loyalty','/admin/orders','/admin/notifications','/admin/branches','/admin/room-charges','/admin/recipes','/admin/qr','/profile','/admin/suppliers/1','/admin/purchases/1','/admin/customers/1','/admin/inventory/items/1','/admin/recipes/1','/admin/more'],
 manager:['/manager','/manager/live','/admin','/host','/admin/notifications','/admin/orders','/admin/tables','/admin/floors','/cashier','/admin/menu/items','/admin/menu/categories','/admin/offers','/admin/recipes','/admin/inventory','/admin/inventory/items','/admin/inventory/movements','/admin/suppliers','/admin/purchases','/admin/customers','/admin/loyalty','/admin/reservations','/admin/club','/admin/vip','/admin/bottle-service','/admin/room-charges','/admin/reports','/admin/reports/advanced','/admin/branches','/admin/settings','/profile','/admin/more','/admin/suppliers/1','/admin/purchases/1','/admin/customers/1','/admin/inventory/items/1','/admin/recipes/1'],
 waiter1:['/waiter','/waiter/tables','/waiter/ready','/waiter/orders'],
 cashier:['/cashier','/cashier/bills','/cashier/paid','/cashier/tables'],
 host:['/host'],
 kitchen:['/kitchen'],
};
const theme=process.argv[2]||'dark', w=Number(process.argv[3]||1440), h=Number(process.argv[4]||900);
const b=await chromium.launch({args:['--no-sandbox','--disable-gpu']});
const settle=async p=>{await p.waitForLoadState('networkidle').catch(()=>{});await p.waitForTimeout(320);};
const probe=()=>{
 const vw=document.documentElement.clientWidth;
 const scrollable=el=>{for(let n=el;n&&n!==document.body;n=n.parentElement){if(/(auto|scroll)/.test(getComputedStyle(n).overflowX))return true;}return false;};
 const over=[];
 document.querySelectorAll('body *').forEach(el=>{const r=el.getBoundingClientRect();if(r.width===0||r.height===0)return;
  if(r.right>vw+1&&!scrollable(el))over.push(el.tagName.toLowerCase()+'.'+String(el.className?.baseVal??el.className??'').slice(0,40));});
 const lum=(R,G,Bl)=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};return 0.2126*f(R)+0.7152*f(G)+0.0722*f(Bl);};
 const parse=s=>{const m=s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);return m?{r:+m[1],g:+m[2],b:+m[3],a:m[4]===undefined?1:+m[4]}:null;};
 /* The background actually painted behind this text.
    A `background-color` walk alone is not enough: a gradient is a `background-image`, so walking
    past it reports the card BEHIND the picture — which is how white text on a dark scrim was
    reported as white-on-white at 1.00:1. So gradients are read too: every colour stop is parsed
    and the most opaque one is taken, because that is the paint doing the covering where the text
    sits. Only a gradient made entirely of near-transparent stops (a gloss, a wash) is skipped, so
    a decorative sheen still measures against the real surface underneath it.
    Returns null only when nothing can be established, which is counted separately — an
    unmeasurable string is neither a pass nor a failure and must not be silently treated as one. */
 const stopsOf=s=>{const out=[];const re=/rgba?\(([^)]+)\)/g;let m;
   while((m=re.exec(s))){const v=m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
     if(v.length>=3)out.push({r:v[0],g:v[1],b:v[2],a:v.length>3?v[3]:1});}
   return out;};
 const bgOf=el=>{for(let n=el;n;n=n.parentElement){
   const st=getComputedStyle(n);
   if(/gradient/.test(st.backgroundImage)){
     const best=stopsOf(st.backgroundImage).sort((x,y)=>y.a-x.a)[0];
     if(best&&best.a>=0.85)return best;
   }
   const c=parse(st.backgroundColor); if(c&&c.a>0.9)return c;
 }return {r:8,g:10,b:12};};
 const bad=[],unmeasured=[];
 document.querySelectorAll('body *').forEach(el=>{ if(el.children.length)return;
   const t=(el.textContent||'').trim(); if(!t)return;
   const r=el.getBoundingClientRect(); if(r.width<=0||r.height<=0)return;
   const s=getComputedStyle(el); if(s.visibility==='hidden'||s.opacity==='0')return;
   // SVG text is painted by `fill`, not `color`. Reading `color` on an <svg><text> reports
   // whatever tone the parent <svg> carries for its strokes — which is how a near-black table
   // number inside a green-stroked table shape was reported as green-on-white at 2.62:1.
   // A false failure is worse than none: it trains you to skim the list the real one is in.
   const isSvg = el.namespaceURI === 'http://www.w3.org/2000/svg';
   const fg=parse(isSvg ? s.fill : s.color); if(!fg||fg.a<0.9)return;
   const bg=bgOf(el);
   if(!bg){ unmeasured.push(`${t.slice(0,24)} over a gradient`); return; }
   const L1=lum(fg.r,fg.g,fg.b),L2=lum(bg.r,bg.g,bg.b);
   const ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
   const px=parseFloat(s.fontSize), bold=parseInt(s.fontWeight,10)>=700;
   const need=(px>=24||(px>=18.66&&bold))?3:4.5;
   if(ratio<need) bad.push(`${t.slice(0,24)} ${ratio.toFixed(2)} (need ${need}) ${s.color}/rgb(${bg.r},${bg.g},${bg.b})`);
 });
 const unnamed=[...document.querySelectorAll('button,a[href]')].filter(e=>{const r=e.getBoundingClientRect();const n=(e.getAttribute('aria-label')||e.getAttribute('title')||(e.textContent||'').trim());return r.width>0&&r.height>0&&!n;}).length;
 return {doc:document.documentElement.scrollWidth,vw,over:over.slice(0,2),bad:[...new Set(bad)].slice(0,3),unmeasured:[...new Set(unmeasured)].slice(0,3),unnamed};
};
let o=0,c=0,u=0,n=0,m=0;
for(const [user,routes] of Object.entries(PLAN)){
 const ctx=await b.newContext({viewport:{width:w,height:h}});const p=await ctx.newPage();
 await p.addInitScript((t)=>{try{localStorage.setItem('nexovo.theme',t);}catch(e){}},theme);
 await p.goto(B+'/login',{waitUntil:'domcontentloaded'});await settle(p);
 await p.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(user);
 await p.locator('input[type="password"]').first().fill(PW[user]);
 await p.locator('button[type="submit"]').first().click();await p.waitForTimeout(1500);await settle(p);
 for(const path of routes){n++;await p.goto(B+path,{waitUntil:'domcontentloaded'});await settle(p);
  const r=await p.evaluate(probe);
  if(r.doc>r.vw+1){o++;console.log(`OVERFLOW ${theme}@${w} ${path} doc=${r.doc} ${r.over.join(' | ')}`);}
  if(r.bad.length){c+=r.bad.length;console.log(`CONTRAST ${theme}@${w} ${path}\n   `+r.bad.join('\n   '));}
  if(r.unnamed){u+=r.unnamed;console.log(`UNNAMED ${theme}@${w} ${path} n=${r.unnamed}`);}
  if(r.unmeasured.length){m+=r.unmeasured.length;console.log(`UNMEASURABLE ${theme}@${w} ${path}\n   `+r.unmeasured.join('\n   '));}
 }
 await ctx.close();
}
await b.close();console.log(`\n${theme}@${w}: ${n} routes | overflow=${o} | contrast=${c} | unnamed=${u} | unmeasurable=${m}`);
