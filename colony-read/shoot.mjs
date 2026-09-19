import {chromium} from '/Users/cook/agents/forge/projects/three-units/node_modules/playwright/index.mjs';
import fs from 'fs';
const [,,mode,trace,out]=process.argv;
const b=await chromium.launch();
if(mode==='frames'){const p=await b.newPage({viewport:{width:1280,height:720}});
 await p.goto(`http://localhost:8765/index.html?trace=${trace}`);await p.waitForFunction('window.ready');
 fs.mkdirSync(out,{recursive:true});
 for(let d=0;d<12;d++)for(const [k,ph] of [[1,36],[2,44],[3,53]]){await p.evaluate(t=>draw(t),d*60+ph);await p.screenshot({path:`${out}/night${String(d+1).padStart(2,'0')}_${k}.png`});}
}else{const ctx=await b.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}});
 const p=await ctx.newPage();await p.goto(`http://localhost:8765/index.html?trace=${trace}&play=12`);await p.waitForFunction('window.done',null,{timeout:120000});await ctx.close();}
await b.close();
