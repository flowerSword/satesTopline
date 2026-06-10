/* ============================================================
   售前头条 手机端主逻辑
   路由: hash-based, #/home #/cat #/search #/detail/:id
         #/upload #/favorites #/history #/profile
   ============================================================ */
(function(){
'use strict';

/* ── Utils 小工具 ── */
function esc(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(s){if(!s)return'';const d=new Date(s);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function fmtRel(s){if(!s)return'';const d=new Date(s),n=new Date(),diff=Math.floor((n-d)/1000);if(diff<60)return'刚刚';if(diff<3600)return Math.floor(diff/60)+'分钟前';if(diff<86400)return Math.floor(diff/3600)+'小时前';if(diff<604800)return Math.floor(diff/86400)+'天前';return fmtDate(s);}
function fileIcon(ext){const m={pdf:'📄',ppt:'📊',pptx:'📊',doc:'📋',docx:'📋',xls:'📈',xlsx:'📈',mp4:'🎬',avi:'🎬',png:'🖼️',jpg:'🖼️',jpeg:'🖼️'};return m[(ext||'').toLowerCase()]||'📁';}
function toast(msg){
  let t=document.querySelector('.m-toast');
  if(!t){t=document.createElement('div');t.className='m-toast';document.body.appendChild(t);}
  t.textContent=msg;t.classList.add('show');
  clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),2200);
}
function go(hash){location.hash=hash;}

/* ── App ── */
const App = {
  user: null,
  cats: [],
  catsFlat: [],
  activeCat: null,        // 当前一级分类 id
  activeL2: null,
  activeL3: null,
  hotCache: { all:[], prod:[], plan:[] },

  async init(){
    try{
      this.user = await API.auth.me();
    }catch(e){
      this.renderLogin();
      return;
    }
    await this._loadCats();
    this.render();
    window.addEventListener('hashchange', ()=>this.route());
    this.route();
  },

  async _loadCats(){
    try{
      const tree = await API.cats.tree();
      let cats = [];
      if(Array.isArray(tree)) cats = tree;
      else if(tree && Array.isArray(tree.list)) cats = tree.list;
      else if(tree && Array.isArray(tree.data)) cats = tree.data;
      else if(tree && Array.isArray(tree.children)) cats = tree.children;
      this.cats = cats.filter(c => c.parent_id === null || c.parent_id === undefined || c.level === 1);
      if(!this.cats.length) this.cats = cats;
      this.catsFlat = this._flatCats(cats);
    }catch(e){ console.error('分类加载失败', e); }
  },

  _refreshCatTabs(){
    const inner = document.getElementById('m-cat-tabs');
    if(!inner || !this.cats.length) return;
    if(inner.querySelectorAll('.m-cat-tab').length > 0) return;
    inner.innerHTML = this.cats.map(c=>`<div class="m-cat-tab" data-cid="${c.id}" title="${esc(c.name)}">${esc(c.name.slice(0,4))}</div>`).join('');
  },

  _flatCats(nodes, parent=null){
    let list=[];
    (nodes||[]).forEach(n=>{
      list.push({...n, parent_id:parent});
      if(n.children) list=list.concat(this._flatCats(n.children, n.id));
    });
    return list;
  },

  _renderSubCatBar(){
    const bar = document.getElementById('m-sub-cat-bar');
    if(!bar) return;

    if(!this.activeCat){
      bar.style.display='none';
      bar.innerHTML='';
      return;
    }

    const l1 = this.cats.find(c=>c.id===this.activeCat);
    const l2list = (l1&&l1.children)||[];

    if(!l2list.length){
      bar.style.display='none';
      bar.innerHTML='';
      return;
    }

    const selL2 = l2list.find(c=>c.id===this.activeL2)||null;
    const l3list = selL2?(selL2.children||[]):[];

    bar.style.display='';
    bar.innerHTML=`
      <div class="m-sub-chips">
        <div class="m-sub-chip${!this.activeL2?' active':''}" data-l2="">全部</div>
        ${l2list.map(c=>`<div class="m-sub-chip${this.activeL2===c.id?' active':''}" data-l2="${c.id}">${esc(c.name)}</div>`).join('')}
      </div>
      ${l3list.length?`
      <div class="m-sub-chips" style="border-top:1px solid var(--gray-100)">
        <div class="m-sub-chip${!this.activeL3?' active':''}" data-l3="">全部</div>
        ${l3list.map(c=>`<div class="m-sub-chip${this.activeL3===c.id?' active':''}" data-l3="${c.id}">${esc(c.name)}</div>`).join('')}
      </div>`:''}
    `;

    bar.querySelectorAll('[data-l2]').forEach(el=>{
      el.onclick=()=>{
        this.activeL2 = el.dataset.l2 ? parseInt(el.dataset.l2) : null;
        this.activeL3 = null;
        this._renderSubCatBar();
        this.viewHome();
      };
    });

    bar.querySelectorAll('[data-l3]').forEach(el=>{
      el.onclick=()=>{
        this.activeL3 = el.dataset.l3 ? parseInt(el.dataset.l3) : null;
        this._renderSubCatBar();
        this.viewHome();
      };
    });
  },

  catName(id){
    const c=this.catsFlat.find(x=>x.id===id);
    return c?c.name:'';
  },

  catPath(id){
    const c=this.catsFlat.find(x=>x.id===id);
    if(!c)return'';
    if(c.parent_id){
      const p=this.catsFlat.find(x=>x.id===c.parent_id);
      if(p&&p.parent_id){
        const pp=this.catsFlat.find(x=>x.id===p.parent_id);
        return pp?pp.name+'/'+p.name+'/'+c.name:p.name+'/'+c.name;
      }
      return p?p.name+'/'+c.name:c.name;
    }
    return c.name;
  },

  /* ── 登录页 ── */
  renderLogin(){
    const root = document.getElementById('app-root');
    root.innerHTML = `
      <div style="min-height:100vh;background:var(--blue);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 24px">
        <div style="font-size:28px;margin-bottom:8px">📰</div>
        <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:.04em;margin-bottom:4px">售前头条</div>
        <div style="font-size:13px;color:rgba(255,255,255,.65);margin-bottom:40px">SalesTopline</div>
        <div style="background:#fff;border-radius:16px;padding:28px 24px;width:100%;max-width:360px;box-shadow:0 8px 32px rgba(0,0,0,.2)">
          <div style="font-size:16px;font-weight:700;color:#1F2937;margin-bottom:20px;text-align:center">登录</div>
          <div style="margin-bottom:14px">
            <div style="font-size:12px;color:#6C757D;margin-bottom:5px;font-weight:500">账号</div>
            <input id="m-login-user" type="text" placeholder="请输入账号"
              style="width:100%;height:44px;border:1.5px solid #DEE2E6;border-radius:8px;padding:0 14px;font-size:14px;outline:none;-webkit-appearance:none">
          </div>
          <div style="margin-bottom:20px">
            <div style="font-size:12px;color:#6C757D;margin-bottom:5px;font-weight:500">密码</div>
            <input id="m-login-pwd" type="password" placeholder="请输入密码"
              style="width:100%;height:44px;border:1.5px solid #DEE2E6;border-radius:8px;padding:0 14px;font-size:14px;outline:none;-webkit-appearance:none">
          </div>
          <div id="m-login-err" style="color:#EF4444;font-size:12px;text-align:center;margin-bottom:10px;min-height:16px"></div>
          <button id="m-login-btn"
            style="width:100%;height:46px;background:var(--blue);color:#fff;font-size:15px;font-weight:700;border:none;border-radius:10px;cursor:pointer;letter-spacing:.04em">
            登录
          </button>
        </div>
      </div>`;

    const doLogin = async () => {
      const username = document.getElementById('m-login-user').value.trim();
      const pwd = document.getElementById('m-login-pwd').value;
      const errEl = document.getElementById('m-login-err');
      const btn = document.getElementById('m-login-btn');
      if (!username || !pwd) { errEl.textContent = '请输入账号和密码'; return; }
      btn.disabled = true; btn.textContent = '登录中…';
      try {
        this.user = await API.auth.login(username, pwd);
        await this._loadCats();
        this.render();
        window.addEventListener('hashchange', ()=>this.route());
        this.route();
      } catch(e) {
        errEl.textContent = e.message || '账号或密码错误';
        btn.disabled = false; btn.textContent = '登录';
      }
    };

    document.getElementById('m-login-btn').onclick = doLogin;
    document.getElementById('m-login-pwd').onkeydown = e => { if(e.key === 'Enter') doLogin(); };
    document.getElementById('m-login-user').onkeydown = e => { if(e.key === 'Enter') document.getElementById('m-login-pwd').focus(); };
  },

  /* ── 渲染外框 ── */
  render(){
    document.getElementById('app-root').innerHTML=`
      <div class="m-layout">
        <header class="m-topbar">
          <span class="m-brand">售前头条</span>
          <i class="ti ti-search m-topbar-icon" id="m-search-icon"></i>
          <i class="ti ti-bell m-topbar-icon"></i>
        </header>
        <nav class="m-cat-tabs" id="m-cat-tabs">
          ${(this.cats||[]).map(c=>`<div class="m-cat-tab" data-cid="${c.id}" title="${esc(c.name)}">${esc(c.name.slice(0,4))}</div>`).join('')}
        </nav>
        <div class="m-sub-cat-bar" id="m-sub-cat-bar" style="display:none"></div>
        <div class="m-scroll" id="m-page"></div>
        <nav class="m-bnav" id="m-bnav">
          <div class="m-bn" data-nav="home"><i class="ti ti-home on"></i><span class="on">首页</span></div>
          <div class="m-bn" data-nav="cat"><i class="ti ti-category"></i><span>分类</span></div>
          <div class="m-bn m-bn-plus" data-nav="upload"><i class="ti ti-circle-plus"></i></div>
          <div class="m-bn" data-nav="favorites"><i class="ti ti-heart"></i><span>收藏</span></div>
          <div class="m-bn" data-nav="profile"><i class="ti ti-user"></i><span>我的</span></div>
        </nav>
      </div>`;

    // 若分类已加载则刷新 tab（处理 render 在分类加载前执行的情况）
    this._refreshCatTabs();

    // 分类 tab 点击 → 跳转到分类页并预选对应一级分类
    document.getElementById('m-cat-tabs').addEventListener('click',e=>{
      const tab=e.target.closest('.m-cat-tab');
      if(!tab || !tab.dataset.cid)return;
      go('#/cat?cid='+tab.dataset.cid);
    });

    // 底部导航
    document.getElementById('m-bnav').addEventListener('click',e=>{
      const bn=e.target.closest('.m-bn');
      if(!bn)return;
      const nav=bn.dataset.nav;
      if(nav==='upload') go('#/upload');
      else if(nav==='cat') go('#/cat');
      else if(nav==='favorites') go('#/favorites');
      else if(nav==='profile') go('#/profile');
      else go('#/home');
    });

    // 顶部搜索
    document.getElementById('m-search-icon').onclick=()=>go('#/search');
  },

  /* ── 路由 ── */
  route(){
    const h = location.hash.replace('#','') || '/home';
    const page = document.getElementById('m-page');
    if(!page) return;

    // 控制 topbar / cat-tabs / bnav 显隐
    const tabsEl = document.getElementById('m-cat-tabs');
    const subBarEl = document.getElementById('m-sub-cat-bar');
    const bnav = document.getElementById('m-bnav');

    if(h.startsWith('/home')){
      document.querySelector('.m-topbar').style.display='';
      tabsEl && (tabsEl.style.display='');
      bnav && (bnav.style.display='');
      this._renderSubCatBar();
    } else if(h.startsWith('/cat')){
      document.querySelector('.m-topbar').style.display='none';
      tabsEl && (tabsEl.style.display='none');
      subBarEl && (subBarEl.style.display='none');
      bnav && (bnav.style.display='');
    } else if(h.startsWith('/search')||h.startsWith('/upload')||h.startsWith('/favorites')||h.startsWith('/history')||h.startsWith('/profile')){
      document.querySelector('.m-topbar').style.display='none';
      tabsEl && (tabsEl.style.display='none');
      subBarEl && (subBarEl.style.display='none');
      bnav && (bnav.style.display = (h.startsWith('/favorites')||h.startsWith('/profile')) ? '' : 'none');
    } else {
      document.querySelector('.m-topbar').style.display='none';
      tabsEl && (tabsEl.style.display='none');
      subBarEl && (subBarEl.style.display='none');
      bnav && (bnav.style.display='none');
    }

    // 更新底部导航高亮
    document.querySelectorAll('.m-bn').forEach(bn=>{
      const nav=bn.dataset.nav;
      const active = (nav==='home'&&h.startsWith('/home'))||
                     (nav==='cat'&&h.startsWith('/cat'))||
                     (nav==='upload'&&h.startsWith('/upload'))||
                     (nav==='favorites'&&h.startsWith('/favorites'))||
                     (nav==='profile'&&h.startsWith('/profile'));
      bn.querySelectorAll('i,span').forEach(el=>{
        el.classList.toggle('active', active);
        el.classList.toggle('on', active);
      });
    });

    if(h.startsWith('/home')) this.viewHome(page);
    else if(h.startsWith('/cat')) this.viewCat(page, h);
    else if(h.startsWith('/search')) this.viewSearch(page, h);
    else if(h.startsWith('/detail/')) this.viewDetail(page, h.replace('/detail/',''));
    else if(h.startsWith('/upload')) this.viewUpload(page);
    else if(h.startsWith('/favorites')) this.viewFavorites(page);
    else if(h.startsWith('/history')) this.viewHistory(page);
    else if(h.startsWith('/profile')) this.viewProfile(page);
    else this.viewHome(page);
  },

  /* ══════════════════════════════
     首页
  ══════════════════════════════ */
  async viewHome(page){
    page = page || document.getElementById('m-page');
    if(!page)return;
    page.innerHTML = `<div class="m-loading"><i class="ti ti-loader" style="animation:spin 1s linear infinite"></i>加载中…</div>`;

    try{
      const effectiveCatId = this.activeL3 || this.activeL2 || this.activeCat || null;
      const catFilter = effectiveCatId ? {cat_id: effectiveCatId} : {};
      const [anns, hot, recent] = await Promise.all([
        API.ops.anns({active:true}).catch(()=>[]),
        API.ops.hot({days:7, limit:15}).catch(()=>[]),
        API.ops.recent({limit:12, ...catFilter}).catch(()=>[]),
      ]);
      const [recs_pin, recs_smart] = await Promise.all([
        API.ops.recsHome({pin:true,  limit:4, ...catFilter}).catch(()=>[]),
        API.ops.recsHome({pin:false, limit:4, ...catFilter}).catch(()=>[]),
      ]);
      this.hotCache.all = hot;
      this.hotCache.prod = hot.filter(m=>(m.category_level1||'').includes('产品'));
      this.hotCache.plan = hot.filter(m=>(m.category_level1||'').includes('方案'));

      const rankHtml = (list) => list.length
        ? list.slice(0,10).map((m,i)=>`
            <div class="m-rank-item" data-mid="${m.id}">
              <span class="m-rank-no ${i===0?'r1':i===1?'r2':i===2?'r3':''}">${i+1}</span>
              <span class="m-rank-ttl">${esc(m.title)}</span>
            </div>`).join('')
        : '<div style="padding:8px 0;font-size:11px;color:#aaa">暂无数据</div>';

      const matCard = (m) => `
        <div class="m-mat-card" data-mid="${m.id}">
          <div class="m-mat-title">${esc(m.title)}</div>
          <div class="m-mat-sub">${esc(this.catName(m.category_id)||'')} · V${esc(m.version_no||'1.0')}</div>
          <div class="m-mat-footer">
            <div class="m-mat-tags">
              ${(m.tags||[]).slice(0,2).map(t=>`<span class="m-mat-tag">${esc(t.name)}</span>`).join('')}
            </div>
            <div class="m-mat-dl" data-mid="${m.id}"><i class="ti ti-download" style="font-size:11px"></i>下载</div>
          </div>
        </div>`;

      const recentHtml = recent.length
        ? recent.map(m=>`
            <div class="m-recent-item" data-mid="${m.id}">
              <span class="m-recent-dot"></span>
              <span class="m-recent-ttl">${esc(m.title)}</span>
              <span class="m-recent-badge">${esc(this.catName(m.category_id)||'资料')}</span>
              <span class="m-recent-date">${fmtRel(m.audited_at||m.created_at)}</span>
            </div>`).join('')
        : '<div class="m-empty"><i class="ti ti-inbox"></i><span>暂无动态</span></div>';

      const noticeHtml = anns.length ? `
        <div class="m-notice" id="m-notice" data-aid="${anns[0].id}">
          <span class="m-notice-tag">${anns[0].level==='urgent'?'紧急':anns[0].level==='important'?'重要':'通知'}</span>
          <span class="m-notice-text">${esc(anns[0].title)}${anns.length>1?' | '+anns.slice(1).map(a=>esc(a.title)).join(' | '):''}</span>
          <i class="ti ti-chevron-right"></i>
        </div>` : '';

      page.innerHTML = `
        <!-- 搜索 + 热榜 双栏 -->
        <div class="m-dual">
          <div class="m-dual-l">
            <div class="m-sbox">
              <div class="m-srow">
                <input id="m-kw" class="m-sinput" placeholder="搜索关键词、产品型号…">
                <button id="m-kw-btn" class="m-sbtn">搜索</button>
              </div>
              <button id="m-ai-btn" class="m-ai-btn">✨ AI智能检索</button>
              <div class="m-search-tags" id="m-stags"></div>
            </div>
          </div>
          <div class="m-dual-r">
            <div class="m-rank-box">
              <div class="m-rank-head">🔥 7天热门</div>
              <div class="m-rank-tabs">
                <button class="m-rank-tab active" data-rk="all">全部</button>
                <button class="m-rank-tab" data-rk="prod">产品</button>
                <button class="m-rank-tab" data-rk="plan">方案</button>
              </div>
              <div id="m-rank-all">${rankHtml(this.hotCache.all)}</div>
              <div id="m-rank-prod" style="display:none">${rankHtml(this.hotCache.prod)}</div>
              <div id="m-rank-plan" style="display:none">${rankHtml(this.hotCache.plan)}</div>
            </div>
          </div>
        </div>

        <!-- 公告横幅 -->
        ${noticeHtml}

        ${recs_pin.length ? `
        <!-- 置顶专区 -->
        <div class="m-card" style="margin-top:10px">
          <div class="m-card-head">
            <div class="m-card-bar"></div>
            <div class="m-card-title">管理员置顶专区</div>
            <span class="m-card-more" data-go="/materials">更多›</span>
          </div>
          <div class="m-mat-grid">${recs_pin.map(m=>matCard(m)).join('')}</div>
        </div>` : ''}

        ${recs_smart.length ? `
        <!-- 智能推荐 -->
        <div class="m-card">
          <div class="m-card-head">
            <div class="m-card-bar"></div>
            <div class="m-card-title">智能推荐专区</div>
            <span class="m-card-more" data-go="/materials">更多›</span>
          </div>
          <div class="m-mat-grid">${recs_smart.map(m=>matCard(m)).join('')}</div>
        </div>` : ''}

        ${!recs_pin.length && !recs_smart.length ? `
        <div class="m-card" style="margin-top:10px">
          <div class="m-card-head"><div class="m-card-bar"></div><div class="m-card-title">精选推荐</div><span class="m-card-more" data-go="/materials">更多›</span></div>
          <div class="m-empty"><i class="ti ti-layout-grid"></i><span>管理员可在后台添加推荐</span></div>
        </div>` : ''}

        <!-- 最新动态 -->
        <div class="m-card" style="margin-bottom:16px">
          <div class="m-card-head">
            <div class="m-card-bar"></div>
            <div class="m-card-title">最新资料动态</div>
            <span class="m-card-more" data-go="/materials">更多›</span>
          </div>
          <div id="m-recent">${recentHtml}</div>
        </div>
      `;

      // 搜索
      const kwEl = document.getElementById('m-kw');
      document.getElementById('m-kw-btn').onclick = () => {
        const v = kwEl.value.trim();
        if(v) go('#/search?q='+encodeURIComponent(v)+'&mode=keyword');
      };
      kwEl.onkeydown = (e) => { if(e.key==='Enter' && kwEl.value.trim()) go('#/search?q='+encodeURIComponent(kwEl.value.trim())+'&mode=keyword'); };
      document.getElementById('m-ai-btn').onclick = () => {
        const v = kwEl.value.trim();
        if(!v){ toast('请输入检索内容'); return; }
        go('#/search?q='+encodeURIComponent(v)+'&mode=semantic');
      };

      // 热搜标签
      try{
        const hotTags = await API.ops.hot({days:7,limit:5});
        const box=document.getElementById('m-stags');
        if(box&&hotTags.length){
          box.innerHTML=hotTags.map(m=>`<span class="m-stag" data-mid="${m.id}">${esc(m.title.slice(0,8))}</span>`).join('');
          box.querySelectorAll('.m-stag').forEach(el=>el.onclick=()=>go('#/detail/'+el.dataset.mid));
        }
      }catch(_){}

      // 榜单 tab
      page.querySelectorAll('.m-rank-tab').forEach(btn=>{
        btn.onclick=()=>{
          page.querySelectorAll('.m-rank-tab').forEach(b=>b.classList.remove('active'));
          btn.classList.add('active');
          ['all','prod','plan'].forEach(k=>{
            const el=document.getElementById('m-rank-'+k);
            if(el) el.style.display=btn.dataset.rk===k?'':'none';
          });
        };
      });

      // 通用 data-mid 跳转
      page.addEventListener('click', e=>{
        const mi = e.target.closest('[data-mid]');
        if(mi){
          if(mi.classList.contains('m-mat-dl')){
            e.stopPropagation();
            go('#/detail/'+mi.dataset.mid);
          } else {
            go('#/detail/'+mi.dataset.mid);
          }
        }
        const go2 = e.target.closest('[data-go]');
        if(go2) go('#'+go2.dataset.go);
        const notice = e.target.closest('#m-notice');
        if(notice) go('#/announcements');
      });

    }catch(e){
      page.innerHTML=`<div class="m-empty"><i class="ti ti-alert-circle"></i><span>加载失败：${esc(e.message)}</span></div>`;
    }
  },

  /* ══════════════════════════════
     分类浏览
  ══════════════════════════════ */
  async viewCat(page, hash){
    page = page || document.getElementById('m-page');
    const roots = this.cats;
    if(!roots.length){ page.innerHTML='<div class="m-empty"><i class="ti ti-category"></i><span>暂无分类</span></div>'; return; }

    const initCid = parseInt(new URLSearchParams((hash||'').split('?')[1]||'').get('cid')||'0');
    let selL1 = (initCid && roots.find(c=>c.id===initCid)) || roots[0];
    let selL2 = null;  // id
    let selL3 = null;  // id

    const render = async () => {
      const l2list = selL1.children || [];
      const selL2obj = selL2 ? l2list.find(c=>c.id===selL2) : null;
      const l3list = selL2obj ? (selL2obj.children||[]) : [];
      const catId = selL3 || selL2 || selL1.id;

      let matHtml = '<div class="m-loading"><i class="ti ti-loader"></i>加载中…</div>';
      try{
        const r = await API.materials.list({ category_id: catId, page_size: 20 });
        const items = r.items || r || [];
        matHtml = items.length
          ? items.map(m=>`
              <div class="m-list-card" data-mid="${m.id}">
                <div class="m-list-thumb">${fileIcon(m.current_file&&m.current_file.extension)}</div>
                <div class="m-list-info">
                  <div class="m-list-title">${esc(m.title)}</div>
                  <div class="m-list-meta">
                    <span>${esc(m.version_no?'V'+m.version_no:'')}</span>
                    <span>↓${m.download_count||0}</span>
                    <span>${fmtRel(m.audited_at||m.created_at)}</span>
                  </div>
                  <div class="m-list-dl" data-mid="${m.id}"><i class="ti ti-download" style="font-size:11px"></i>下载</div>
                </div>
              </div>`).join('')
          : '<div class="m-empty"><i class="ti ti-inbox"></i><span>该分类暂无资料</span></div>';
      }catch(_){}

      page.innerHTML = `
        <div class="m-cat-view">
          <!-- 蓝色头部：返回 + 当前一级分类名 -->
          <div class="m-cat-hd">
            <i class="ti ti-arrow-left m-cat-back" id="m-cat-back"></i>
            <span class="m-cat-hd-title">${esc(selL1.name)}</span>
          </div>
          <!-- 二级/三级分类筛选栏（全宽） -->
          ${l2list.length?`
          <div class="m-cat-chips-bar">
            <div class="m-sub-chips">
              <div class="m-sub-chip${!selL2?' active':''}" data-l2="">全部</div>
              ${l2list.map(c=>`<div class="m-sub-chip${selL2===c.id?' active':''}" data-l2="${c.id}">${esc(c.name)}</div>`).join('')}
            </div>
            ${l3list.length?`
            <div class="m-sub-chips" style="border-top:1px solid var(--gray-100)">
              <div class="m-sub-chip${!selL3?' active':''}" data-l3="">全部</div>
              ${l3list.map(c=>`<div class="m-sub-chip${selL3===c.id?' active':''}" data-l3="${c.id}">${esc(c.name)}</div>`).join('')}
            </div>`:''}
          </div>`:''}
          <!-- 主体：左侧一级列表 + 右侧资料列表 -->
          <div class="m-cat-body">
            <div class="m-l2" id="m-l1-sidebar">
              ${roots.map(c=>`<div class="m-l2-item${c.id===selL1.id?' active':''}" data-l1="${c.id}">${esc(c.name)}</div>`).join('')}
            </div>
            <div class="m-l3" id="m-mat-list">${matHtml}</div>
          </div>
        </div>`;

      document.getElementById('m-cat-back').onclick = () => go('#/home');

      // L1 切换
      page.querySelectorAll('[data-l1]').forEach(el=>{
        el.onclick=()=>{
          selL1 = roots.find(c=>c.id===parseInt(el.dataset.l1)) || selL1;
          selL2 = null; selL3 = null;
          render();
        };
      });
      // L2 chip
      page.querySelectorAll('[data-l2]').forEach(el=>{
        el.onclick=()=>{
          selL2 = el.dataset.l2 ? parseInt(el.dataset.l2) : null;
          selL3 = null;
          render();
        };
      });
      // L3 chip
      page.querySelectorAll('[data-l3]').forEach(el=>{
        el.onclick=()=>{
          selL3 = el.dataset.l3 ? parseInt(el.dataset.l3) : null;
          render();
        };
      });
      // 资料跳转
      document.getElementById('m-mat-list').addEventListener('click', e=>{
        const mi = e.target.closest('[data-mid]');
        if(mi) go('#/detail/'+mi.dataset.mid);
      });
    };

    await render();
  },

  /* ══════════════════════════════
     搜索
  ══════════════════════════════ */
  async viewSearch(page, hash){
    page = page || document.getElementById('m-page');
    const params = new URLSearchParams((hash.split('?')[1]||''));
    const q = decodeURIComponent(params.get('q')||'');
    const mode = params.get('mode')||'keyword';

    page.innerHTML = `
      <div class="m-sub-top" style="background:var(--blue)">
        <div class="m-search-active" style="flex:1">
          <i class="ti ti-search"></i>
          <input id="m-sq" value="${esc(q)}" placeholder="搜索资料…" style="flex:1;background:none;border:none;outline:none;font-size:13px;color:#fff" />
        </div>
        <button id="m-sgo" class="m-search-go">搜索</button>
        <span id="m-scancel" class="m-search-cancel" style="color:rgba(255,255,255,.85);margin-left:8px">取消</span>
      </div>
      <div id="m-sresult" class="m-scroll" style="height:calc(100vh - 50px)">
        ${q ? '<div class="m-loading">检索中…</div>' : `
          <div class="m-hot-searches" style="padding:14px">
            <div class="m-hot-title">热门搜索</div>
            <div class="m-hot-tags" id="m-hot-tags"><div style="font-size:12px;color:#aaa">加载中…</div></div>
          </div>`}
      </div>`;

    document.getElementById('m-scancel').onclick=()=>history.back();
    const sqEl=document.getElementById('m-sq');
    const doSearch=()=>{
      const v=sqEl.value.trim();
      if(v) go('#/search?q='+encodeURIComponent(v)+'&mode=keyword');
    };
    document.getElementById('m-sgo').onclick=doSearch;
    sqEl.onkeydown=e=>{if(e.key==='Enter')doSearch();};
    sqEl.focus();

    // 热搜词
    if(!q){
      try{
        const hot=await API.ops.hot({days:7,limit:8});
        const box=document.getElementById('m-hot-tags');
        if(box&&hot.length){
          box.innerHTML=hot.map(m=>`<span class="m-hot-tag" data-q="${esc(m.title)}">${esc(m.title.slice(0,10))}</span>`).join('');
          box.querySelectorAll('.m-hot-tag').forEach(el=>{
            el.onclick=()=>go('#/search?q='+encodeURIComponent(el.dataset.q)+'&mode=keyword');
          });
        }
      }catch(_){}
      return;
    }

    // 执行搜索
    const box=document.getElementById('m-sresult');
    try{
      const res = await API.search.search({q, mode, limit:30});
      const items = res.items||[];
      const usedMode = res.mode||mode;

      if(!items.length){
        box.innerHTML=`<div class="m-empty" style="padding:48px 0"><i class="ti ti-search"></i><span>未找到相关资料</span></div>`;
        return;
      }

      box.innerHTML=`
        <div class="m-search-result-head">
          ${usedMode==='semantic'?'<span class="m-ai-badge">✨ AI 语义结果</span>':'<span style="font-size:12px;font-weight:600;color:var(--gray-600)">关键词结果</span>'}
          <span class="m-result-count">共${items.length}条</span>
        </div>
        <div style="padding:0 14px">
          ${items.map(m=>`
            <div class="m-list-card" data-mid="${m.id}">
              <div class="m-list-thumb">${fileIcon(m.current_file&&m.current_file.extension)}</div>
              <div class="m-list-info">
                <div class="m-list-title">${esc(m.title)}</div>
                <div class="m-list-meta">
                  ${m.score?`<span class="m-score-tag">相关度 ${Math.round(m.score*100)}%</span>`:''}
                  <span>${esc(this.catName(m.category_id)||'')}</span>
                  <span>↓${m.download_count||0}</span>
                </div>
                <div class="m-list-dl" data-mid="${m.id}"><i class="ti ti-download" style="font-size:11px"></i>下载</div>
              </div>
            </div>`).join('')}
        </div>`;

      box.querySelectorAll('[data-mid]').forEach(el=>el.onclick=()=>go('#/detail/'+el.dataset.mid));
    }catch(e){
      box.innerHTML=`<div class="m-empty"><i class="ti ti-alert-circle"></i><span>搜索失败：${esc(e.message)}</span></div>`;
    }
  },

  /* ══════════════════════════════
     资料详情
  ══════════════════════════════ */
  async viewDetail(page, id){
    page = page || document.getElementById('m-page');
    page.innerHTML=`<div class="m-sub-top"><i class="ti ti-arrow-left back" id="m-back"></i><span class="stitle">资料详情</span></div><div class="m-loading" style="padding-top:48px">加载中…</div>`;
    document.getElementById('m-back').onclick=()=>history.back();

    try{
      const m = await API.materials.detail(id);
      const file = m.current_file||{};
      const tags = m.tags||[];
      // 记录浏览
      API.materials.viewPing(id).catch(()=>{});
      // 是否已收藏
      let faved = m.is_favorited||false;

      const renderDetail=()=>{
        page.innerHTML=`
          <div class="m-sub-top">
            <i class="ti ti-arrow-left back" style="font-size:22px;color:#fff;cursor:pointer" id="m-back"></i>
            <span class="stitle">${esc(m.title.slice(0,16))}…</span>
            <i class="ti ti-share" style="font-size:20px;color:rgba(255,255,255,.85);cursor:pointer"></i>
          </div>
          <div style="flex:1;overflow:hidden;display:flex;flex-direction:column">
            <div class="m-detail-hero">${fileIcon(file.extension)}</div>
            <div class="m-detail-body">
              <div class="m-dtitle">${esc(m.title)}</div>
              <div class="m-dmeta">
                ${esc(this.catPath(m.category_id)||'')} · V${esc(m.version_no||'1.0')} · ${fmtDate(m.audited_at||m.created_at)} · ${file.size_mb?file.size_mb+'MB':''}${file.extension?' · '+file.extension.toUpperCase():''}
              </div>
              <div class="m-dtags">
                ${tags.map(t=>`<span class="m-dtag">${esc(t.name)}</span>`).join('')}
              </div>
              <div class="m-ddiv"></div>
              <div class="m-ddesc">${esc(m.description||m.intro||'暂无简介')}</div>
              <div class="m-dstats">
                <span class="m-dstat">👁 ${m.view_count||0}次浏览</span>
                <span class="m-dstat">⬇ ${m.download_count||0}次下载</span>
              </div>
              ${m.update_note?`<div class="m-dversion">📝 版本说明：${esc(m.update_note)}</div>`:''}
            </div>
          </div>
          <div class="m-detail-actions">
            <button class="m-action-main" id="m-dl-btn">
              <i class="ti ti-download" style="font-size:18px"></i>下载到本地
            </button>
            <div class="m-action-icon ${faved?'active':''}" id="m-fav-btn">
              <i class="ti ti-heart" style="color:${faved?'var(--orange)':'var(--gray-600)'}"></i>
            </div>
            <div class="m-action-icon" id="m-share-btn">
              <i class="ti ti-share"></i>
            </div>
          </div>`;

        document.getElementById('m-back').onclick=()=>history.back();

        // 下载
        document.getElementById('m-dl-btn').onclick=()=>{
          if(file.id){
            const url=API.files.downloadUrl(file.id);
            window.open(url,'_blank');
          } else { toast('暂无可下载文件'); }
        };

        // 收藏
        document.getElementById('m-fav-btn').onclick=async()=>{
          try{
            if(faved){ await API.me.delFav(m.id); faved=false; toast('已取消收藏'); }
            else{ await API.me.addFav(m.id); faved=true; toast('收藏成功'); }
            renderDetail();
          }catch(e){ toast(e.message); }
        };

        // 分享
        document.getElementById('m-share-btn').onclick=()=>{
          if(navigator.share){ navigator.share({title:m.title,url:location.href}).catch(()=>{}); }
          else{ toast('链接已复制'); }
        };
      };

      renderDetail();
    }catch(e){
      page.innerHTML=`<div class="m-sub-top"><i class="ti ti-arrow-left back" id="m-back" style="color:#fff;font-size:22px;cursor:pointer"></i><span class="stitle">资料详情</span></div><div class="m-empty" style="padding:48px 0"><i class="ti ti-alert-circle"></i><span>${esc(e.message)}</span></div>`;
      document.getElementById('m-back').onclick=()=>history.back();
    }
  },

  /* ══════════════════════════════
     上传资料
  ══════════════════════════════ */
  viewUpload(page){
    page = page || document.getElementById('m-page');
    const cats = this.cats;
    let selFile = null;

    const buildCatOptions = (nodes, indent=0) => {
      let html='';
      (nodes||[]).forEach(n=>{
        html+=`<option value="${n.id}">${'　'.repeat(indent)}${esc(n.name)}</option>`;
        if(n.children) html+=buildCatOptions(n.children,indent+1);
      });
      return html;
    };

    page.innerHTML=`
      <div class="m-sub-top">
        <i class="ti ti-arrow-left back" id="m-back" style="font-size:22px;color:#fff;cursor:pointer"></i>
        <span class="stitle">上传资料</span>
      </div>
      <div style="flex:1;overflow-y:auto">
        <div class="m-upload-zone" id="m-upzone">
          <i class="ti ti-cloud-upload"></i>
          <span class="tip">点击选择文件</span>
          <span class="sub">PDF / PPT / Word / Excel / 图片 / 视频</span>
          <input type="file" id="m-file-input" style="display:none" accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.mp4,.mov,.avi,.mkv,.mp3,.wav,.aac,.m4a,.flac,.zip,.rar">
        </div>
        <div class="m-form" id="m-upload-form">
          <div class="m-frow">
            <label class="m-flbl">资料名称 <span>*</span></label>
            <input id="m-ftitle" class="m-finp" placeholder="请输入资料名称">
          </div>
          <div class="m-frow">
            <label class="m-flbl">版本号 <span>*</span></label>
            <input id="m-fversion" class="m-finp" placeholder="如：V1.0 / V2.3">
          </div>
          <div class="m-frow">
            <label class="m-flbl">所属分类 <span>*</span></label>
            <select id="m-fcat" class="m-fsel">
              <option value="">请选择分类</option>
              ${buildCatOptions(cats)}
            </select>
          </div>
          <div class="m-frow">
            <label class="m-flbl">资料简介</label>
            <textarea id="m-fdesc" class="m-ftexta" placeholder="填写资料描述、使用场景…"></textarea>
          </div>
          <div class="m-frow">
            <label class="m-flbl">版本说明</label>
            <textarea id="m-fnote" class="m-ftexta" placeholder="本次版本更新了哪些内容…"></textarea>
          </div>
          <div class="m-fhint">💡 提交后由管理员审核，审核通过后对外发布</div>
          <button class="m-submit-btn" id="m-upload-submit" disabled>提交审核</button>
        </div>
      </div>`;

    document.getElementById('m-back').onclick=()=>history.back();

    const zone=document.getElementById('m-upzone');
    const fileInput=document.getElementById('m-file-input');
    const submitBtn=document.getElementById('m-upload-submit');

    zone.onclick=()=>fileInput.click();
    fileInput.onchange=()=>{
      selFile=fileInput.files[0];
      if(selFile){
        zone.classList.add('has-file');
        zone.querySelector('.tip').textContent=selFile.name;
        zone.querySelector('.sub').textContent=(selFile.size/1024/1024).toFixed(2)+'MB';
        submitBtn.disabled=false;
      }
    };

    submitBtn.onclick=async()=>{
      const title=document.getElementById('m-ftitle').value.trim();
      const version=document.getElementById('m-fversion').value.trim();
      const catId=document.getElementById('m-fcat').value;
      const desc=document.getElementById('m-fdesc').value.trim();
      const note=document.getElementById('m-fnote').value.trim();

      if(!selFile){toast('请选择文件');return;}
      if(!title){toast('请填写资料名称');return;}
      if(!version){toast('请填写版本号');return;}
      if(!catId){toast('请选择分类');return;}

      submitBtn.disabled=true;
      submitBtn.textContent='提交中…';
      try{
        // 先上传文件
        const fd=new FormData();
        fd.append('file',selFile);
        const fileRes=await API.files.upload(fd);
        // 再创建资料
        await API.materials.create({
          title, version_no:version, category_id:parseInt(catId),
          description:desc, update_note:note,
          file_id: fileRes.id
        });
        toast('提交成功，等待审核');
        setTimeout(()=>go('#/profile'),1500);
      }catch(e){
        toast('提交失败：'+e.message);
        submitBtn.disabled=false;
        submitBtn.textContent='提交审核';
      }
    };
  },

  /* ══════════════════════════════
     收藏
  ══════════════════════════════ */
  async viewFavorites(page){
    page = page || document.getElementById('m-page');
    page.innerHTML=`
      <div class="m-sub-top">
        <span class="stitle" style="margin-left:14px">我的收藏</span>
      </div>
      <div id="m-fav-list" class="m-scroll" style="height:calc(100vh - 50px - 56px);padding:0 14px">
        <div class="m-loading">加载中…</div>
      </div>`;

    try{
      const r=await API.me.favorites({page_size:50});
      const items=r.items||r||[];
      const list=document.getElementById('m-fav-list');
      if(!items.length){
        list.innerHTML='<div class="m-empty" style="padding:48px 0"><i class="ti ti-heart"></i><span>暂无收藏</span></div>';
        return;
      }
      list.innerHTML=items.map(m=>`
        <div class="m-fav-item" data-mid="${m.material_id||m.id}">
          <div class="m-fav-thumb">${fileIcon(m.extension)}</div>
          <div class="m-fav-info">
            <div class="m-fav-title">${esc(m.title||m.material_title)}</div>
            <div class="m-fav-meta">${esc(this.catName(m.category_id)||'')} · ${fmtDate(m.created_at||m.favorited_at)}</div>
          </div>
          <i class="ti ti-trash m-del-btn" data-del="${m.material_id||m.id}"></i>
        </div>`).join('');

      list.querySelectorAll('.m-fav-item').forEach(el=>{
        el.onclick=e=>{
          if(e.target.closest('.m-del-btn'))return;
          go('#/detail/'+el.dataset.mid);
        };
      });
      list.querySelectorAll('.m-del-btn').forEach(el=>{
        el.onclick=async()=>{
          try{await API.me.delFav(el.dataset.del);toast('已取消收藏');this.viewFavorites(page);}
          catch(e){toast(e.message);}
        };
      });
    }catch(e){
      document.getElementById('m-fav-list').innerHTML=`<div class="m-empty"><i class="ti ti-alert-circle"></i><span>${esc(e.message)}</span></div>`;
    }
  },

  /* ══════════════════════════════
     历史记录
  ══════════════════════════════ */
  async viewHistory(page){
    page = page || document.getElementById('m-page');
    page.innerHTML=`
      <div class="m-sub-top">
        <i class="ti ti-arrow-left back" id="m-back" style="font-size:22px;color:#fff;cursor:pointer"></i>
        <span class="stitle">历史记录</span>
        <span class="saction" id="m-hist-clear">清空</span>
      </div>
      <div id="m-hist-tabs" style="background:#fff;display:flex;border-bottom:1px solid #eee;flex-shrink:0">
        <div style="flex:1;height:40px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--blue);border-bottom:2px solid var(--blue);cursor:pointer" data-ht="dl">下载记录</div>
        <div style="flex:1;height:40px;display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--gray-400);cursor:pointer" data-ht="view">浏览历史</div>
      </div>
      <div id="m-hist-list" class="m-scroll" style="flex:1;padding:0 14px">
        <div class="m-loading">加载中…</div>
      </div>`;

    document.getElementById('m-back').onclick=()=>history.back();

    const loadHist = async (type) => {
      const list=document.getElementById('m-hist-list');
      list.innerHTML='<div class="m-loading">加载中…</div>';
      try{
        const r = type==='dl' ? await API.me.downloads({page_size:50}) : await API.me.views({page_size:50});
        const items=r.items||r||[];
        if(!items.length){
          list.innerHTML='<div class="m-empty" style="padding:48px 0"><i class="ti ti-clock"></i><span>暂无记录</span></div>';
          return;
        }
        // 按日期分组
        const groups={};
        items.forEach(m=>{
          const dt=fmtDate(m.downloaded_at||m.viewed_at||m.created_at);
          const today=fmtDate(new Date());
          const label=dt===today?'今天':dt===fmtDate(new Date(Date.now()-86400000))?'昨天':dt;
          if(!groups[label])groups[label]=[];
          groups[label].push(m);
        });
        list.innerHTML=Object.entries(groups).map(([label,ms])=>`
          <div class="m-section-date">${label}</div>
          ${ms.map(m=>`
            <div class="m-hist-item" data-mid="${m.material_id||m.id}">
              <div class="m-hist-thumb ${type==='dl'?'dl':''}">
                <i class="ti ${type==='dl'?'ti-download':'ti-eye'}" style="font-size:17px;color:${type==='dl'?'#15803D':'var(--gray-400)'}"></i>
              </div>
              <div class="m-hist-info">
                <div class="m-hist-title">${esc(m.title||m.material_title)}</div>
                <div class="m-hist-meta ${type==='dl'?'dl':''}">${type==='dl'?'已下载':'已浏览'} · ${fmtRel(m.downloaded_at||m.viewed_at||m.created_at)}</div>
              </div>
            </div>`).join('')}`).join('');
        list.querySelectorAll('[data-mid]').forEach(el=>el.onclick=()=>go('#/detail/'+el.dataset.mid));
      }catch(e){
        list.innerHTML=`<div class="m-empty"><i class="ti ti-alert-circle"></i><span>${esc(e.message)}</span></div>`;
      }
    };

    let curType='dl';
    document.getElementById('m-hist-tabs').addEventListener('click',e=>{
      const tab=e.target.closest('[data-ht]');
      if(!tab||tab.dataset.ht===curType)return;
      curType=tab.dataset.ht;
      document.querySelectorAll('[data-ht]').forEach(t=>{
        const active=t.dataset.ht===curType;
        t.style.color=active?'var(--blue)':'var(--gray-400)';
        t.style.fontWeight=active?'700':'400';
        t.style.borderBottom=active?'2px solid var(--blue)':'none';
      });
      loadHist(curType);
    });
    loadHist('dl');
  },

  /* ══════════════════════════════
     个人中心
  ══════════════════════════════ */
  async viewProfile(page){
    page = page || document.getElementById('m-page');
    // 统计数据
    let dlCount=0, upCount=0, favCount=0;
    try{
      const [dl,fav]=await Promise.all([API.me.downloads({page_size:1}),API.me.favorites({page_size:1})]);
      dlCount=(dl.total||0); favCount=(fav.total||0);
    }catch(_){}

    page.innerHTML=`
      <div class="m-profile-hero">
        <div class="m-avt">${esc((this.user.real_name||this.user.username||'U').slice(0,1))}</div>
        <div>
          <div class="m-pname">${esc(this.user.real_name||this.user.username)}</div>
          <div class="m-psub">${esc(this.user.department||'')} · ${esc(this.user.position||this.roleLabel(this.user.role))}</div>
          <span class="m-pbadge">企业微信已登录</span>
        </div>
        <i class="ti ti-settings m-settings-icon"></i>
      </div>
      <div class="m-stat-row">
        <div class="m-stat-c"><div class="m-stat-num">${dlCount}</div><div class="m-stat-lbl">下载记录</div></div>
        <div class="m-stat-c"><div class="m-stat-num">${upCount}</div><div class="m-stat-lbl">我的上传</div></div>
        <div class="m-stat-c"><div class="m-stat-num">${favCount}</div><div class="m-stat-lbl">我的收藏</div></div>
      </div>
      <div style="height:8px;background:var(--gray-100)"></div>
      <div class="m-menu-grp">
        <div class="m-menu-item" data-nav="upload">
          <div class="m-menu-ico" style="background:#EBF0FA"><i class="ti ti-upload" style="color:var(--blue)"></i></div>
          <span class="m-menu-lbl">我的上传</span>
          <i class="ti ti-chevron-right m-menu-arr"></i>
        </div>
        <div class="m-menu-item" data-nav="dl-hist">
          <div class="m-menu-ico" style="background:#EDE9FE"><i class="ti ti-download" style="color:#7C3AED"></i></div>
          <span class="m-menu-lbl">下载记录</span>
          <i class="ti ti-chevron-right m-menu-arr"></i>
        </div>
        <div class="m-menu-item" data-nav="view-hist">
          <div class="m-menu-ico" style="background:#FEF3C7"><i class="ti ti-history" style="color:#B45309"></i></div>
          <span class="m-menu-lbl">浏览历史</span>
          <i class="ti ti-chevron-right m-menu-arr"></i>
        </div>
        <div class="m-menu-item" data-nav="favorites">
          <div class="m-menu-ico" style="background:#FEE2E2"><i class="ti ti-heart" style="color:#C0392B"></i></div>
          <span class="m-menu-lbl">我的收藏</span>
          <i class="ti ti-chevron-right m-menu-arr"></i>
        </div>
        <div class="m-menu-item" data-nav="notify">
          <div class="m-menu-ico" style="background:var(--gray-100)"><i class="ti ti-bell" style="color:var(--gray-500)"></i></div>
          <span class="m-menu-lbl">消息通知</span>
          <i class="ti ti-chevron-right m-menu-arr"></i>
        </div>
        <div class="m-menu-item" data-nav="feedback">
          <div class="m-menu-ico" style="background:var(--gray-100)"><i class="ti ti-message-circle" style="color:var(--gray-500)"></i></div>
          <span class="m-menu-lbl">意见反馈</span>
          <i class="ti ti-chevron-right m-menu-arr"></i>
        </div>
      </div>
      <div class="m-menu-grp" style="margin-top:8px">
        <div class="m-menu-item" id="m-logout">
          <div class="m-menu-ico" style="background:#FEE2E2"><i class="ti ti-logout" style="color:#C0392B"></i></div>
          <span class="m-menu-lbl" style="color:#C0392B">退出登录</span>
        </div>
      </div>
      <div style="height:16px"></div>`;

    page.querySelectorAll('[data-nav]').forEach(el=>{
      el.onclick=()=>{
        const n=el.dataset.nav;
        if(n==='upload') go('#/upload');
        else if(n==='dl-hist') go('#/history?type=dl');
        else if(n==='view-hist') go('#/history?type=view');
        else if(n==='favorites') go('#/favorites');
        else if(n==='feedback') go('#/feedback');
        else toast('功能开发中');
      };
    });
    document.getElementById('m-logout').onclick=async()=>{
      try{await API.auth.logout();}catch(_){}
      location.href='/';
    };
  },

  roleLabel(r){ return {super_admin:'超级管理员',presales_admin:'售前管理员',user:'业务用户'}[r]||r; },
};

// 启动
document.addEventListener('DOMContentLoaded', ()=>App.init());
})();
