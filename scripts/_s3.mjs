import { chromium } from 'playwright';
import { walkScreens } from './auditFixture.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const scheme of ['light','dark']) {
const ctx = await b.newContext({ viewport:{width:390,height:844}, colorScheme: scheme });
const page = await ctx.newPage(); page.setDefaultTimeout(5000);
let n=0;
await walkScreens({ page, BASE:'http://127.0.0.1:4173/', width:390, step: async (label, nav) => {
  n++;
  try { await nav(); await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/claude-0/-home-user-press-golf/ed55be20-9d07-5fc8-987d-c1373566e6be/scratchpad/shots/'+String(n).padStart(2,'0')+'-'+scheme+'-'+label.replace(/[^a-z0-9]+/gi,'_').slice(0,24)+'.png', fullPage: true }); } catch(e){ console.log('fail', label, String(e).slice(0,200)); }
}});
await ctx.close(); }
await b.close();
