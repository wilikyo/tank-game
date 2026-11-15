/* NODE_PATH must resolve playwright-core. Uses a local HTTP server only. */
'use strict';
const fs=require('node:fs'), path=require('node:path'), http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const original=fs.readFileSync(path.join(root,'index.html'),'utf8');
const current=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8'));
const parts=current.version.split('.').map(Number);
parts[2]++;
const future={...current,version:parts.join('.'),build:'abcdef0123456789'};
const futureHtml=original.replaceAll(current.version,future.version).replaceAll(current.build,future.build);
let published=false, fail=false, mismatch=false;
const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(fail){res.writeHead(503).end('offline');return;}
  if(req.url.startsWith('/version.json')){
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify(published?future:current));
  }else{
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(published&&!mismatch?futureHtml:original);
  }
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      Object.defineProperty(window,'TankArena',{configurable:true,set(api){
        const Base=api.Game;
        api.Game=class extends Base {constructor(...args){super(...args);window.testGame=this;}};
        Object.defineProperty(window,'TankArena',{value:api});
      }});
    });
    await page.goto(origin);
    await page.getByText('v'+current.version+' · 更新公告',{exact:true}).click();
    await page.getByRole('button',{name:/电脑/}).click();
    await page.getByRole('button',{name:'挑战 GPT · 困难'}).click();
    await page.getByRole('button',{name:'开始对战'}).click();
    await page.waitForFunction(()=>testGame.time>.2);
    const initialTime=await page.evaluate(()=>testGame.time);
    published=true;
    mismatch=true;
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(350);
    assert.equal(await page.locator('#release-notice').isVisible(),false);
    mismatch=false;
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await page.waitForFunction(()=>!document.getElementById('release-notice').hidden);
    assert.equal(await page.locator('#release-notice button').isDisabled(),true);
    assert.equal(await page.locator('#panel').evaluate(el=>el.open),false);
    assert.equal(await page.locator('meta[name=tank-version]').getAttribute('content'),current.version);
    assert(await page.evaluate(t=>testGame.time>t,initialTime));
    await page.evaluate(()=>{
      testGame.bullets=[];
      testGame.items=[];
      testGame.mines=[];
      testGame.hit(testGame.tanks[0]);
    });
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#panel').evaluate(el=>el.open),false);
    await page.getByText('本局已结束 · 有新版本',{exact:true}).waitFor({timeout:8000});
    assert.equal(await page.evaluate(()=>testGame.result.winner),1);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('tank-arena:last-session:v1')).score[1]),1);
    fail=true;
    await page.locator('#panel').getByRole('button',{name:'刷新更新',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#release-notice span').textContent.includes('暂时无法'));
    assert.equal(await page.locator('meta[name=tank-version]').getAttribute('content'),current.version);
    fail=false;
    await page.getByRole('button',{name:'继续当前版本'}).click();
    await page.waitForFunction(()=>testGame.round===2 && testGame.time>.1);
    assert.equal(await page.locator('#panel').evaluate(el=>el.open),false);
    assert.equal(await page.locator('#release-notice button').isDisabled(),true);
    await page.getByRole('button',{name:/菜单/}).click();
    await page.getByRole('button',{name:'保存比分并退出'}).click();
    await page.locator('#panel').getByRole('button',{name:'刷新更新',exact:true}).click();
    await page.waitForFunction(v=>document.querySelector('meta[name=tank-version]').content===v,future.version);
    assert.equal(await page.locator('#release-notice').isVisible(),false);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('tank-arena:last-session:v1')).score[1]),1);
    published=false;
    for(const device of ['电脑','手机']){
      const p=await browser.newPage({viewport:device==='手机'?{width:390,height:844}:{width:1280,height:800}});
      p.on('pageerror',e=>errors.push(e.message));
      await p.goto(origin);
      await p.getByRole('button',{name:new RegExp(device)}).click();
      await p.getByRole('button',{name:'挑战 GPT · 困难'}).click();
      await p.getByRole('button',{name:'开始对战'}).click();
      await p.getByRole('button',{name:'v'+current.version+' 更新公告',exact:true}).click();
      assert.equal(await p.locator('#panel .release-notes').evaluate(el=>el.open),true);
      await p.getByRole('button',{name:'继续对战',exact:true}).click();
      await p.context().setOffline(true);
      await p.waitForTimeout(250);
      assert.equal(await p.locator('#panel').evaluate(el=>el.open),false);
      assert.equal(await p.locator('#mode-label').textContent(),'本地人机 · 困难');
      await p.close();
    }
    assert.deepEqual(errors,[]);
    console.log('PASS deployment consistency, live notice, 2.5s settlement, save, defer, retry, manual refresh, PC/mobile and offline');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
