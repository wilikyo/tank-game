/* Run node tools/build-release.cjs after the main game has been bundled.
   release.json owns the public version and announcement. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=path.resolve(root,'..');
const read=file=>fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const release=JSON.parse(read(path.join(root,'release.json')));
if (!/^\d+\.\d+\.\d+$/.test(release.version) || !Array.isArray(release.notes) ||
    !release.notes.every(n=>typeof n==='string') || !release.title || !release.date) {
  throw Error('release.json needs a version, date, title and notes');
}
let html=read(path.join(source,'坦克迷阵.html'));
const app=read(path.join(source,'app.js')).trim();
const client=read(path.join(__dirname,'release-client.js'));
const styles=`
#release-version{font-variant-numeric:tabular-nums}
.release-notes{margin:14px 0;border-top:1px solid #cccac3;padding-top:10px;font-size:12px}
.release-notes summary{cursor:pointer;color:#555b68}
.release-notes p{font-size:12px;margin:10px 0}
.release-notes ul,.release-changes{padding-left:19px;font-size:13px;line-height:1.65}
.release-notes li,.release-changes li{margin:7px 0}
#release-notice{position:absolute;top:65px;right:2vw;z-index:5;max-width:min(520px,86vw);
display:flex;gap:10px;align-items:center;padding:9px 12px;border-radius:6px;
background:#242836;color:#faf9f5;font-size:12px;box-shadow:0 2px 8px #20233133}
#release-notice .tool{white-space:nowrap;font-size:12px}
.mobile #release-notice{top:39px;right:12px;max-width:75%;padding:5px 8px}
.mobile #release-version{font-size:11px;padding:2px 5px}
@media(orientation:landscape) and (max-height:600px){#release-notice{top:39px}}
@media(max-width:420px){#release-notice{top:51px;flex-wrap:wrap}.mobile #release-notice{top:39px}}
`;
function replaceOnce(text,from,to) {
  if (text.split(from).length!==2) throw Error('Game integration changed: '+from.slice(0,80));
  return text.replace(from,()=>to);
}
let patched=app;
patched=replaceOnce(patched,"  const {Game,STEP", "  const release=window.TankRelease;\n  const {Game,STEP");
patched=replaceOnce(patched,"    if(!panel.open)panel.showModal();",
  "    release.appendNotes(panelBody);\n    if(!panel.open)panel.showModal();");
patched=replaceOnce(patched,
  "view='play';panel.close();last=0;debt=0;running=true;resetInput();$('board').focus();",
  "view='play';panel.close();last=0;debt=0;running=true;resetInput();$('board').focus();release.sync();");
patched=replaceOnce(patched,"deviceScreen();sync();","deviceScreen();sync();release.sync();");
patched=replaceOnce(patched,"if(!ending){game.newRound();resetInput();debt=0;}",
  "if(!ending){game.newRound();resetInput();debt=0;release.sync();}");
patched=replaceOnce(patched,"if(result){ending=.12;save();break;}",
  "if(result){ending=.12;save();release.roundEnded();break;}");
patched=replaceOnce(patched,"  sync();deviceScreen();requestAnimationFrame(frame);",`
  release.connect({
    inRound:()=>active && !game.result,
    save,
    openNotes() {
      if (running) pause();
      const notes=panelBody.querySelector('.release-notes');
      if (notes) { notes.open=true; notes.scrollIntoView({block:'nearest'}); }
    },
    prompt(latest) {
      view='update';
      section('本局已结束 · 有新版本','v'+latest.version+' · '+latest.title+'。比分已保存在这台设备。');
      panelBody.querySelectorAll('.release-notes,.release-update').forEach(el=>el.remove());
      const notes=document.createElement('ul');
      notes.className='release-changes';
      for (const text of latest.notes) {
        const li=document.createElement('li');li.textContent=text;notes.append(li);
      }
      const refresh=action('刷新更新',()=>void release.refresh(),'action primary release-refresh');
      const keep=action('继续当前版本',play);
      const actions=group('stack');
      actions.append(refresh,keep);
      actions.before(notes);
      release.sync();
    }
  });
  sync();deviceScreen();requestAnimationFrame(frame);`.trimEnd());
const build=crypto.createHash('sha256').update(html).update(client).update(styles)
  .update(patched).update(JSON.stringify(release)).digest('hex').slice(0,16);
const metadata={...release,build};
html=replaceOnce(html,app,client.replace('__TANK_RELEASE__',()=>JSON.stringify(metadata))+'\n'+patched);
html=replaceOnce(html,'</head>',
  '<meta name="tank-version" content="'+release.version+'">\n'+
  '<meta name="tank-build" content="'+build+'">\n<style>'+styles+'</style>\n</head>');
// Check the complete artifact before writing any deployable files.
for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
if (/<script[^>]+src=/.test(html)) throw Error('Release must include the complete game');
fs.writeFileSync(path.join(root,'index.html'),html);
fs.writeFileSync(path.join(root,'version.json'),JSON.stringify(metadata,null,2)+'\n');
console.log('Built v'+release.version+' ('+build+'), '+Buffer.byteLength(html)+' bytes');
