/* Embedded by build-release.cjs. Version checks never drive the simulation. */
(function () {
  'use strict';
  const current = __TANK_RELEASE__;
  let hooks, latest = null, checking = false, refreshing = false, prompted = '', error = '';
  const notice = document.createElement('aside');
  notice.id = 'release-notice';
  notice.hidden = true;
  const status = document.createElement('span');
  status.setAttribute('role','status');
  const refreshButton = document.createElement('button');
  refreshButton.type = 'button';
  refreshButton.className = 'tool';
  notice.append(status,refreshButton);
  document.querySelector('.stage').append(notice);
  const versionButton = document.createElement('button');
  versionButton.id = 'release-version';
  versionButton.className = 'tool';
  versionButton.textContent = 'v' + current.version;
  versionButton.setAttribute('aria-label','v' + current.version + ' 更新公告');
  document.querySelector('nav').prepend(versionButton);

  function newer(a,b) {
    const x=a.split('.').map(Number), y=b.split('.').map(Number);
    for (let i=0;i<3;i++) if (x[i]!==y[i]) return x[i]>y[i];
    return false;
  }
  function valid(data) {
    return data && /^\d+\.\d+\.\d+$/.test(data.version) &&
      /^[a-f0-9]{16}$/.test(data.build) && Array.isArray(data.notes) &&
      data.notes.length<=30 && data.notes.every(n=>typeof n==='string' && n.length<=1500);
  }
  function urlFor(file,build) {
    const url = new URL(file,location.href);
    url.searchParams.set('release',build);
    return url;
  }
  async function fetchText(url) {
    const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw Error('暂时无法获取新版');
    return response.text();
  }
  async function ready(data) {
    const html=await fetchText(urlFor('index.html',data.build));
    const page=new DOMParser().parseFromString(html,'text/html');
    return page.querySelector('meta[name="tank-build"]')?.content===data.build;
  }
  function render() {
    notice.hidden=!latest;
    const inRound=hooks?.inRound() ?? false;
    const message=latest ? error || '发现新版 v'+latest.version+
      (inRound?'，本局结束后可刷新更新。':'，可刷新更新。') : '';
    status.textContent=message;
    for (const row of document.querySelectorAll('.release-update')) {
      row.hidden=!latest;
      row.querySelector('span').textContent=message;
    }
    const buttons=[refreshButton,...document.querySelectorAll('.release-refresh')];
    for (const button of buttons) {
      button.textContent=refreshing?'检查新版中…':inRound?'本局结束后更新':'刷新更新';
      button.disabled=!latest || inRound || refreshing;
    }
  }
  function appendNotes(parent) {
    const details=document.createElement('details');
    details.className='release-notes';
    const summary=document.createElement('summary');
    summary.textContent='v'+current.version+' · 更新公告';
    const date=document.createElement('p');
    date.textContent=current.date+' · '+current.title;
    const notes=document.createElement('ul');
    for(const note of current.notes) {
      const li=document.createElement('li');
      li.textContent=note;
      notes.append(li);
    }
    details.append(summary,date,notes);
    const update=document.createElement('div');
    update.className='release-update stack';
    update.hidden=!latest;
    const message=document.createElement('span');
    const button=document.createElement('button');
    button.className='action release-refresh';
    button.type='button';
    button.onclick=refresh;
    update.append(message,button);
    parent.append(details,update);
    render();
  }
  async function check() {
    if (checking || !hooks || !/^https?:$/.test(location.protocol)) return;
    checking=true;
    try {
      const text=await fetchText(urlFor('version.json',String(Date.now())));
      const data=JSON.parse(text);
      if (valid(data) && newer(data.version,current.version) &&
          (!latest || newer(data.version,latest.version)) && await ready(data)) {
        latest=data;
        render();
      }
    } catch { /* Keep the running game usable while offline or mid-deployment. */ }
    finally { checking=false; }
  }
  async function refresh() {
    if (!latest || refreshing || hooks.inRound()) return;
    refreshing=true;
    error='';
    render();
    try {
      const target=latest;
      if (!await ready(target)) throw Error('新版仍在部署，请稍后重试。');
      // Recheck after awaiting the network: the player may have started a round.
      if (hooks.inRound()) return;
      hooks.save();
      location.replace(urlFor('index.html',target.build).href);
    } catch {
      error='暂时无法加载新版，可继续当前版本，稍后再试。';
    } finally {
      refreshing=false;
      render();
    }
  }
  refreshButton.onclick=refresh;
  versionButton.onclick=()=>{
    hooks?.openNotes();
  };
  window.TankRelease={
    current,
    connect(callbacks) {
      hooks=callbacks;
      void check();
    },
    appendNotes,
    refresh,
    sync:render,
    roundEnded() {
      render();
      if (!latest || prompted===latest.build) return;
      prompted=latest.build;
      hooks.prompt(latest);
    }
  };
  setInterval(()=>{if(!document.hidden)void check();},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
  window.addEventListener('online',()=>void check());
})();
