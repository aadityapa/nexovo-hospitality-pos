import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE='http://localhost:4173', OUT=process.env.OUT || './screenshots';
const PW={admin:'Admin@123',waiter1:'Waiter@123',cashier:'Cashier@123',kitchen:'Kitchen@123'};
const WID=[[390,844,'390'],[768,1024,'768'],[1024,768,'1024'],[1440,900,'1440']];
const PLAN={
 admin:[['dashboard','/admin'],['inventory','/admin/inventory'],['purchases','/admin/purchases'],['menu-items','/admin/menu/items'],['offers','/admin/offers'],['reports','/admin/reports'],['roles','/admin/roles'],['settings','/admin/settings'],['audit','/admin/audit'],['reservations','/admin/reservations'],['vip','/admin/vip'],['orders','/admin/orders'],['users','/admin/users'],['branches','/admin/branches'],['notifications','/admin/notifications'],['profile','/profile'],['club','/admin/club']],
 waiter1:[['waiter-home','/waiter'],['waiter-tables','/waiter/tables'],['waiter-ready','/waiter/ready'],['waiter-orders','/waiter/orders']],
 cashier:[['cashier-home','/cashier'],['cashier-bills','/cashier/bills'],['cashier-tables','/cashier/tables']],
 kitchen:[['kitchen','/kitchen']],
};
mkdirSync(OUT,{recursive:true});
const b=await chromium.launch({args:['--no-sandbox','--disable-gpu','--font-render-hinting=none']});
const settle=async p=>{await p.waitForLoadState('networkidle').catch(()=>{});await p.waitForFunction(()=>!document.querySelector('[aria-busy="true"], .skeleton'),null,{timeout:5000}).catch(()=>{});await p.waitForTimeout(550);};
const only=process.argv[2]?process.argv[2].split(','):null;
for(const [w,h,tag] of WID){
 if(only&&!only.includes(tag))continue;
 for(const [user,routes] of Object.entries(PLAN)){
  const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2});const p=await c.newPage();
  await p.goto(BASE+'/login',{waitUntil:'domcontentloaded'});await settle(p);
  if(user==='admin'&&(tag==='1440'||tag==='390'))await p.screenshot({path:`${OUT}/login@${tag}.png`});
  await p.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(user);
  await p.locator('input[type="password"]').first().fill(PW[user]);
  await p.locator('button[type="submit"]').first().click();await p.waitForTimeout(2000);await settle(p);
  for(const [slug,path] of routes){await p.goto(BASE+path,{waitUntil:'domcontentloaded'});await settle(p);
   await p.screenshot({path:`${OUT}/${slug}@${tag}.png`});process.stdout.write(slug+'@'+tag+' ');}
  await c.close();
 }
}
{const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});const p=await c.newPage();
 await p.goto(BASE+'/menu/MAIN/T1',{waitUntil:'domcontentloaded'});await settle(p);
 await p.screenshot({path:OUT+'/public-menu@390.png'});await c.close();}
await b.close();console.log('\ndone');
