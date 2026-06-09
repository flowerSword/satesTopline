/* app.js - 售前头条 SPA 主程序 */

const App = {
  user: null,
  cats: [],         // 全部分类（含三级）
  tagsCache: null,  // 标签缓存
  catsTree: null,   // 树形分类缓存

  /* ===================== 入口 ===================== */
  async init() {
    window.addEventListener('app:logout', () => this.handleLogout());
    window.addEventListener('hashchange', () => this.route());
    try {
      const me = await API.auth.me();
      this.user = me;
      await this.loadMeta();
      this.renderShell();
      this.route();
    } catch (e) {
      this.renderLogin();
    }
  },

  async loadMeta() {
    try {
      const tree = await API.cats.list();
      // 后端 /api/categories/tree 已返回嵌套树结构，这里同时把它拍平存到 this.cats
      this.catsTree = tree || [];
      const flat = [];
      const walk = (nodes, parent_id) => {
        nodes.forEach(n => {
          flat.push({ ...n, parent_id: n.parent_id != null ? n.parent_id : parent_id });
          if (n.children && n.children.length) walk(n.children, n.id);
        });
      };
      walk(this.catsTree, null);
      this.cats = flat;
    } catch (e) {}
  },

  buildCatTree(flat) {
    const map = {};
    flat.forEach(c => { map[c.id] = { ...c, children: [] }; });
    const roots = [];
    flat.forEach(c => {
      if (c.parent_id && map[c.parent_id]) map[c.parent_id].children.push(map[c.id]);
      else if (!c.parent_id) roots.push(map[c.id]);
    });
    return roots;
  },

  /* ===================== 登录页 ===================== */
  renderLogin() {
    const root = document.getElementById('app-root');
    root.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div class="login-brand">
            <div class="login-logo">📰</div>
            <div class="login-title">售前头条</div>
            <div class="login-sub">SalesTopline · 售前资料协同平台</div>
          </div>
          <form id="login-form" class="login-form">
            <div class="form-group">
              <label>账号</label>
              <input type="text" name="username" required autocomplete="username" placeholder="请输入账号">
            </div>
            <div class="form-group">
              <label>密码</label>
              <input type="password" name="password" required autocomplete="current-password" placeholder="请输入密码">
            </div>
            <div id="login-err" class="form-err"></div>
            <button type="submit" class="btn btn-primary btn-block">登 录</button>
          </form>
          <div class="login-foot">内部使用 · 请使用企业账号登录</div>
        </div>
      </div>
    `;
    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const data = Utils.formData(e.target);
      const errEl = document.getElementById('login-err');
      errEl.textContent = '';
      try {
        const u = await API.auth.login(data.username.trim(), data.password);
        this.user = u;
        await this.loadMeta();
        this.renderShell();
        Utils.go('/home');
      } catch (err) {
        errEl.textContent = err.message || '登录失败';
      }
    };
  },

  /* ===================== 主框架 ===================== */
  renderShell() {
    const root = document.getElementById('app-root');
    const isAdmin = ['super_admin', 'presales_admin'].includes(this.user.role);
    const isSuper = this.user.role === 'super_admin';
    root.innerHTML = `
      <div class="layout">
        <header class="topbar">
          <div class="topbar-left">
            <div class="brand" onclick="Utils.go('/home')">
              <span class="brand-logo">📰</span>
              <span class="brand-name">售前头条</span>
            </div>
            <nav class="topnav" id="topnav">
              <a data-path="/home">首页</a>
              <a data-path="/materials">资料库</a>
              ${isAdmin ? `
                <a data-path="/admin/materials">资料管理</a>
                <div class="topnav-dropdown">
                  <a class="topnav-dd">管理 ▾</a>
                  <div class="topnav-menu">
                    <a data-path="/admin/categories">分类管理</a>
                    <a data-path="/admin/tags">标签管理</a>
                    <a data-path="/admin/announcements">公告 / 推荐</a>
                    <a data-path="/admin/feedbacks">反馈处理</a>
                    <a data-path="/admin/stats">数据看板</a>
                    <a data-path="/admin/download_logs">下载明细</a>
                    ${isSuper ? '<a data-path="/admin/users">用户管理</a>' : ''}
                  </div>
                </div>` : ''}
            </nav>
          </div>
          <div class="topbar-right">
            <div class="user-menu">
              <div class="user-avatar" id="user-avatar">${Utils.escape((this.user.real_name || this.user.username || 'U').slice(0,1))}</div>
              <div class="user-pop" id="user-pop">
                <div class="user-pop-head">
                  <div class="user-pop-name">${Utils.escape(this.user.real_name || this.user.username)}</div>
                  <div class="user-pop-role">${this.roleLabel(this.user.role)}</div>
                </div>
                <a data-path="/me/favorites">我的收藏</a>
                <a data-path="/me/history">浏览 / 下载历史</a>
                <a data-path="/me/feedbacks">我的反馈</a>
                <a id="change-pwd-btn">修改密码</a>
                <a id="logout-btn">退出登录</a>
              </div>
            </div>
          </div>
        </header>
        <main id="view-root" class="view-root"></main>
      </div>
    `;

    // 顶部导航高亮
    const setActive = () => {
      const cur = location.hash.replace('#','').split('?')[0] || '/home';
      document.querySelectorAll('#topnav a[data-path]').forEach(a => {
        a.classList.toggle('active', a.dataset.path === cur);
      });
    };
    document.querySelectorAll('#topnav a[data-path]').forEach(a => {
      a.onclick = (e) => {
        e.stopPropagation();
        Utils.go(a.dataset.path);
        setActive();
        // 关闭下拉菜单
        document.querySelectorAll('.topnav-menu').forEach(m => m.style.display = 'none');
        setTimeout(() => document.querySelectorAll('.topnav-menu').forEach(m => m.style.display = ''), 50);
      };
    });

    // 下拉菜单改为 click 触发（避免 hover 在移动/远程桌面环境失效）
    document.querySelectorAll('.topnav-dd').forEach(dd => {
      dd.onclick = (e) => {
        e.stopPropagation();
        const menu = dd.nextElementSibling;
        const isOpen = menu.style.display === 'block';
        document.querySelectorAll('.topnav-menu').forEach(m => m.style.display = 'none');
        if (!isOpen) menu.style.display = 'block';
      };
    });
    document.addEventListener('click', () => {
      document.querySelectorAll('.topnav-menu').forEach(m => m.style.display = 'none');
    });
    document.querySelectorAll('#user-pop a[data-path]').forEach(a => {
      a.onclick = () => Utils.go(a.dataset.path);
    });
    setActive();
    window.addEventListener('hashchange', setActive);

    document.getElementById('user-avatar').onclick = (e) => {
      e.stopPropagation();
      document.getElementById('user-pop').classList.toggle('show');
    };
    document.addEventListener('click', () => {
      const p = document.getElementById('user-pop');
      if (p) p.classList.remove('show');
    });
    document.getElementById('logout-btn').onclick = async () => {
      try { await API.auth.logout(); } catch (e) {}
      this.handleLogout();
    };
    document.getElementById('change-pwd-btn').onclick = () => this.openChangePwd();
  },


  roleLabel(r) {
    return { super_admin: '超级管理员', presales_admin: '售前管理员', user: '业务用户' }[r] || r;
  },

  handleLogout() {
    this.user = null;
    this.renderLogin();
  },

  openChangePwd() {
    const m = Utils.modal({
      title: '修改密码',
      width: 420,
      body: `
        <form id="cp-form" class="form">
          <div class="form-group"><label>原密码</label><input type="password" name="old_password" required></div>
          <div class="form-group"><label>新密码（至少 6 位）</label><input type="password" name="new_password" minlength="6" required></div>
          <div class="form-group"><label>确认新密码</label><input type="password" name="new_password2" minlength="6" required></div>
          <div class="form-err" id="cp-err"></div>
        </form>
      `,
      footer: `<button class="btn btn-ghost" data-act="cancel">取消</button><button class="btn btn-primary" data-act="ok">保存</button>`
    });
    m.el.querySelector('[data-act="cancel"]').onclick = m.close;
    m.el.querySelector('[data-act="ok"]').onclick = async () => {
      const d = Utils.formData(m.el.querySelector('#cp-form'));
      const errEl = m.el.querySelector('#cp-err');
      errEl.textContent = '';
      if (d.new_password !== d.new_password2) { errEl.textContent = '两次输入不一致'; return; }
      try {
        await API.auth.changePwd(d.old_password, d.new_password);
        Utils.toast('密码已修改，请重新登录', 'ok');
        m.close();
        await API.auth.logout().catch(() => {});
        this.handleLogout();
      } catch (e) {
        errEl.textContent = e.message;
      }
    };
  },

  /* ===================== 路由 ===================== */
  route() {
    const { path, params } = Utils.parseHash();
    // 高亮当前导航
    document.querySelectorAll('#topnav a[data-path]').forEach(a => {
      a.classList.toggle('active', path === a.dataset.path || path.startsWith(a.dataset.path + '/'));
    });
    const view = document.getElementById('view-root');
    if (!view) return;
    view.innerHTML = '<div class="loading">加载中…</div>';
    const handlers = {
      '/home': () => this.viewHome(view),
      '/materials': () => this.viewMaterials(view, params),
      '/search': () => this.viewSearch(view, params),
      '/me/favorites': () => this.viewMyFavorites(view, params),
      '/me/history': () => this.viewMyHistory(view, params),
      '/me/feedbacks': () => this.viewMyFeedbacks(view, params),
      '/admin/materials': () => this.viewAdminMaterials(view, params),
      '/admin/categories': () => this.viewAdminCategories(view),
      '/admin/tags': () => this.viewAdminTags(view),
      '/admin/announcements': () => this.viewAdminAnnouncements(view),
      '/admin/feedbacks': () => this.viewAdminFeedbacks(view, params),
      '/admin/stats': () => this.viewAdminStats(view),
      '/admin/download_logs': () => this.viewAdminDownloadLogs(view, params),
      '/admin/users': () => this.viewAdminUsers(view),
    };
    if (path.startsWith('/materials/')) {
      const id = parseInt(path.split('/')[2], 10);
      return this.viewMaterialDetail(view, id);
    }
    const fn = handlers[path] || handlers['/home'];
    fn();
  },

  /* ===================== 首页 ===================== */
  renderCatNav() {
    // cat-nav is now hidden (integrated into topbar); kept for API compatibility
  },

  async viewHome(view) {
    const isAdmin = ['super_admin', 'presales_admin'].includes(this.user.role);
    try {
      // parallel fetch
      const [anns, hot, recent] = await Promise.all([
        API.ops.anns({ active: true }).catch(() => []),
        API.ops.hot({ days: 7, limit: 15 }).catch(() => []),
        API.ops.recent({ limit: 12 }).catch(() => []),
      ]);
      const [recs_pin, recs_smart] = await Promise.all([
        API.ops.recsHome({ pin: true,  limit: 4 }).catch(() => []),
        API.ops.recsHome({ pin: false, limit: 4 }).catch(() => []),
      ]);
      const stats = isAdmin ? await API.stats.overview().catch(() => null) : null;

      // 榜单：全部 / 产品 / 方案
      const hotAll = hot;
      const hotProd = hot.filter(m => (m.category_level1 || '').includes('产品'));
      const hotPlan = hot.filter(m => (m.category_level1 || '').includes('方案'));

      const rankHtml = (list) => list.length
        ? list.slice(0, 10).map((m, i) => `
            <div class="rank-item" data-mid="${m.id}">
              <span class="rank-no ${i===0?'r1':i===1?'r2':i===2?'r3':''}">${i+1}</span>
              <span class="rank-title">${Utils.escape(m.title)}</span>
              <span class="rank-dl">↓${m.download_count||0}</span>
            </div>`).join('')
        : '<div class="empty" style="padding:10px 0">暂无数据</div>';

      const matCardFull = (m) => `
        <div class="home-mat-card" data-mid="${m.id}">
          <div class="hmc-title">${Utils.escape(m.title)}</div>
          <div class="hmc-sub">${Utils.escape(this.catPath(m.category_id))} · V${Utils.escape(m.version_no || '1.0')}</div>
          <div class="hmc-footer">
            <div class="hmc-tags">
              ${(m.tags||[]).slice(0,2).map(t=>`<span class="hmc-tag">${Utils.escape(t.name)}</span>`).join('')}
            </div>
            <div class="hmc-dl-btn" data-mid="${m.id}">
              <i class="ti ti-download" style="font-size:11px"></i>下载
            </div>
          </div>
        </div>`;

      const recentHtml = recent.length
        ? recent.map(m => `
            <div class="home-recent-item" data-mid="${m.id}">
              <span class="recent-dot"></span>
              <span class="recent-ttl">${Utils.escape(m.title)}</span>
              <span class="recent-badge">${Utils.escape(this.catPath(m.category_id) || '资料')}</span>
              <span class="recent-date">${Utils.fmtRelative(m.audited_at||m.created_at)}</span>
            </div>`).join('')
        : '<div class="empty" style="padding:10px 0">暂无动态</div>';

      const noticeHtml = anns.length ? (() => {
        const a = anns[0];
        const tag = a.level==='urgent'?'紧急':a.level==='important'?'重要':'通知';
        const others = anns.length > 1 ? anns.slice(1).map(x=>Utils.escape(x.title)).join(' | ') : '';
        return `
          <div class="home-notice" id="home-notice" data-aid="${a.id}">
            <span class="notice-tag">【${tag}】</span>
            <span class="notice-text">${Utils.escape(a.title)}${others?' | '+others:''}</span>
            <i class="ti ti-chevron-right notice-arr"></i>
          </div>`;
      })() : '';

      view.innerHTML = `
        <div class="home-page">

          ${stats ? `
          <!-- 管理员专属看板 -->
          <div class="home-board">
            <div class="home-board-head">
              <div class="home-board-title">管理员专属数据看板</div>
              <a class="home-board-link" onclick="Utils.go('/admin/stats')">→ 跳转数据统计后台</a>
            </div>
            <div class="board-cells">
              <div class="board-cell"><div class="num">${stats.total_materials||0}</div><div class="lbl">平台总资料</div></div>
              <div class="board-cell"><div class="num">${stats.new_this_month||0}</div><div class="lbl">本月新增</div></div>
              <div class="board-cell"><div class="num">${stats.downloads_this_month||0}</div><div class="lbl">本月下载量</div></div>
              <div class="board-cell"><div class="num">${stats.active_users_month||stats.total_users||0}</div><div class="lbl">本月活跃用户</div></div>
              <div class="board-cell warn"><div class="num">${stats.pending_review||0}</div><div class="lbl">待审核资料</div></div>
            </div>
          </div>` : ''}

          <!-- 左：搜索 + 右：7日热榜 -->
          <div class="home-dual-row">
            <div class="home-search-card">
              <div class="sb-row">
                <input id="home-kw" class="sb-input" placeholder="支持关键词、拼音、全称搜索 | 例：智慧园区招投标资料">
                <button id="home-kw-btn" class="sb-btn">搜索</button>
              </div>
              <div class="home-ai-row">
                <button id="home-ai-btn" class="home-ai-btn">✨ AI智能检索</button>
                <span class="home-ai-tip">检索范围：资料名称、标签、产品型号、行业关键词、简介内容</span>
              </div>
              <div class="home-search-tags" id="home-stags"></div>
            </div>
            <div class="home-rank-card">
              <div class="rank-card-head">
                <div class="rank-card-title">🔥 7日热门下载</div>
                <div class="rank-tabs">
                  <button class="rank-tab active" data-rank="all">全部</button>
                  <button class="rank-tab" data-rank="prod">产品</button>
                  <button class="rank-tab" data-rank="plan">方案</button>
                </div>
              </div>
              <div id="rank-list-all">${rankHtml(hotAll)}</div>
              <div id="rank-list-prod" style="display:none">${rankHtml(hotProd)}</div>
              <div id="rank-list-plan" style="display:none">${rankHtml(hotPlan)}</div>
            </div>
          </div>

          <!-- 公告横幅 -->
          ${noticeHtml}

          <!-- 管理员置顶专区 -->
          ${recs_pin.length ? `
          <div class="home-section">
            <div class="home-sec-head">
              <div class="home-sec-bar"></div>
              <div class="home-sec-title">管理员置顶专区</div>
              <a class="home-sec-more" onclick="Utils.go('/materials')">更多 →</a>
            </div>
            <div class="home-mat-grid">
              ${recs_pin.map(m => matCardFull(m)).join('')}
            </div>
          </div>` : ''}

          <!-- 智能推荐专区 -->
          ${recs_smart.length ? `
          <div class="home-section">
            <div class="home-sec-head">
              <div class="home-sec-bar"></div>
              <div class="home-sec-title">智能推荐专区</div>
              <a class="home-sec-more" onclick="Utils.go('/materials')">更多 →</a>
            </div>
            <div class="home-mat-grid">
              ${recs_smart.map(m => matCardFull(m)).join('')}
            </div>
          </div>` : ''}

          <!-- 无推荐时的备用展示 -->
          ${!recs_pin.length && !recs_smart.length ? `
          <div class="home-section">
            <div class="home-sec-head">
              <div class="home-sec-bar"></div>
              <div class="home-sec-title">精选推荐</div>
              <a class="home-sec-more" onclick="Utils.go('/materials')">更多 →</a>
            </div>
            <div class="empty" style="padding:24px 0">暂无推荐内容，管理员可在「公告/推荐」中添加</div>
          </div>` : ''}

          <!-- 最新动态 -->
          <div class="home-section" style="margin-bottom:0">
            <div class="home-sec-head">
              <div class="home-sec-bar"></div>
              <div class="home-sec-title">最新资料动态</div>
              <a class="home-sec-more" onclick="Utils.go('/materials', { sort: 'latest' })">更多 →</a>
            </div>
            <div class="home-recent-list">
              ${recentHtml}
            </div>
          </div>

        </div>
      `;

      // ── 事件绑定 ──

      // 搜索
      const kwInput = document.getElementById('home-kw');
      document.getElementById('home-kw-btn').onclick = () => {
        const v = kwInput.value.trim();
        if (v) Utils.go('/materials', { kw: v });
      };
      kwInput.onkeydown = (e) => { if (e.key === 'Enter' && kwInput.value.trim()) Utils.go('/materials', { kw: kwInput.value.trim() }); };
      document.getElementById('home-ai-btn').onclick = () => {
        const v = kwInput.value.trim();
        if (!v) { Utils.toast('请输入检索内容', 'warn'); return; }
        Utils.go('/search', { kw: v, mode: 'semantic' });
      };

      // 热搜标签异步填充
      try {
        const hotTags = await API.ops.hot({ days: 7, limit: 6 });
        const box = document.getElementById('home-stags');
        if (box && hotTags.length) {
          box.innerHTML = hotTags.map(m =>
            `<span class="home-stag" data-mid="${m.id}">${Utils.escape(m.title.slice(0,10))}</span>`
          ).join('');
          box.querySelectorAll('.home-stag').forEach(el =>
            el.onclick = () => Utils.go('/materials/' + el.dataset.mid)
          );
        }
      } catch (_) {}

      // 榜单 tab 切换
      view.querySelectorAll('.rank-tab').forEach(btn => {
        btn.onclick = () => {
          view.querySelectorAll('.rank-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          ['all','prod','plan'].forEach(k => {
            const el = document.getElementById('rank-list-'+k);
            if (el) el.style.display = btn.dataset.rank === k ? '' : 'none';
          });
        };
      });

      // 公告点击
      const noticeEl = document.getElementById('home-notice');
      if (noticeEl) noticeEl.onclick = () => Utils.go('/announcements');

      // 资料卡片下载
      view.querySelectorAll('.hmc-dl-btn').forEach(el => {
        el.onclick = (e) => {
          e.stopPropagation();
          const mid = el.dataset.mid;
          if (mid) Utils.go('/materials/' + mid);
        };
      });

      // 全局 data-mid 跳转
      view.querySelectorAll('[data-mid]').forEach(el => {
        if (!el.classList.contains('hmc-dl-btn'))
          el.onclick = () => Utils.go('/materials/' + el.dataset.mid);
      });

    } catch (e) {
      view.innerHTML = `<div class="err-box">加载失败：${Utils.escape(e.message)}</div>`;
    }
  },


    matCardHtml(m) {
    const tags = (m.tags || []).slice(0, 3);
    return `
      <div class="mat-card" data-mid="${m.id}">
        <div class="mat-head">
          <span class="mat-icon">${Utils.fileIcon(m.current_file && m.current_file.extension)}</span>
          <span class="mat-title" title="${Utils.escape(m.title)}">${Utils.escape(m.title)}</span>
        </div>
        <div class="mat-desc">${Utils.escape((m.summary || '').slice(0, 80))}</div>
        <div class="mat-tags">
          ${tags.map(t => `<span class="tag ${Utils.tagClass(t.dimension)}">${Utils.escape(t.name)}</span>`).join('')}
        </div>
        <div class="mat-meta">
          <span>👁 ${m.view_count || 0}</span>
          <span>⬇ ${m.download_count || 0}</span>
          <span class="mat-date">${Utils.fmtRelative(m.audited_at || m.created_at)}</span>
        </div>
      </div>
    `;
  },

  /* ===================== 资料列表 ===================== */
  async viewMaterials(view, params) {
    const page = parseInt(params.page || '1', 10);
    const filters = {
      page,
      page_size: 20,
      keyword:     params.kw  || '',
      category_id: params.cat || '',
      tag_id:      params.tag || '',
      extension:   params.ext || '',
      sort:        params.sort === 'hot' ? 'views' : params.sort === 'download' ? 'downloads' : 'created_at',
    };

    view.innerHTML = `
      <div class="list-page">
        <aside class="filter-side">
          <div class="filter-block">
            <div class="filter-title">分类</div>
            <div id="cat-tree-filter" class="cat-tree-filter"></div>
          </div>
          <div class="filter-block">
            <div class="filter-title">文件格式</div>
            <div id="ext-filter" class="chip-group"></div>
          </div>
          <div class="filter-block">
            <div class="filter-title">标签</div>
            <div id="tag-filter" class="tag-filter"></div>
          </div>
        </aside>
        <section class="list-main">
          <div class="list-toolbar">
            <div class="list-kw">
              <input id="list-kw" placeholder="搜索标题 / 描述 / 标签" value="${Utils.escape(filters.kw)}">
              <button id="list-kw-btn" class="btn btn-primary btn-sm">搜索</button>
              <button id="list-ai-btn" class="btn btn-sm" style="background:var(--accent);color:#fff;white-space:nowrap">✨ AI 检索</button>
            </div>
            <div class="list-sort">
              <label>排序</label>
              <select id="list-sort">
                <option value="latest" ${filters.sort === 'latest' ? 'selected' : ''}>最新发布</option>
                <option value="hot" ${filters.sort === 'hot' ? 'selected' : ''}>最多浏览</option>
                <option value="download" ${filters.sort === 'download' ? 'selected' : ''}>最多下载</option>
              </select>
              ${['super_admin', 'presales_admin', 'user'].includes(this.user.role) ? '<button id="upload-btn" class="btn btn-primary btn-sm">＋ 上传资料</button>' : ''}
            </div>
          </div>
          <div id="active-filters" class="active-filters"></div>
          <div id="mat-list" class="mat-grid"></div>
          <div id="mat-pager"></div>
        </section>
      </div>
    `;

    // ── 立刻同步设置所有 onclick（必须在任何 await 之前，防止异步竞争导致 onclick 丢失）──
    const doSearch = () => {
      const v = document.getElementById('list-kw').value.trim();
      Utils.go('/materials', { ...params, kw: v, page: 1 });
    };
    document.getElementById('list-kw-btn').onclick = doSearch;
    document.getElementById('list-kw').onkeydown = (e) => {
      if (e.key === 'Enter') doSearch();
    };
    document.getElementById('list-ai-btn').onclick = () => {
      const v = document.getElementById('list-kw').value.trim();
      if (!v) { Utils.toast('请输入检索内容', 'warn'); return; }
      Utils.go('/search', { kw: v, mode: 'semantic' });
    };
    document.getElementById('list-sort').onchange = (e) => {
      Utils.go('/materials', { ...params, sort: e.target.value, page: 1 });
    };
    const uploadBtn = document.getElementById('upload-btn');
    if (uploadBtn) {
      uploadBtn.onclick = () => {
        try { this.openUpload(); }
        catch (e) { Utils.toast('错误: ' + e.message, 'err', 6000); console.error(e); }
      };
    }

    // 渲染分类树（支持折叠）
    this.renderCatTreeFilter(document.getElementById('cat-tree-filter'), params.cat, (cid) => {
      Utils.go('/materials', { ...params, cat: cid || '', page: 1 });
    });

    // 文件格式 chips
    const exts = ['pdf', 'docx', 'xlsx', 'pptx', 'zip', 'mp4', 'png'];
    document.getElementById('ext-filter').innerHTML = exts.map(e =>
      `<span class="chip ${filters.extension === e ? 'on' : ''}" data-ext="${e}">${e.toUpperCase()}</span>`
    ).join('');
    document.querySelectorAll('#ext-filter .chip').forEach(c => {
      c.onclick = () => Utils.go('/materials', { ...params, ext: filters.extension === c.dataset.ext ? '' : c.dataset.ext, page: 1 });
    });

    // 异步加载标签（不阻塞 onclick）
    if (!this.tagsCache) this.tagsCache = await API.tags.list().catch(() => []);
    this.renderTagFilter(document.getElementById('tag-filter'), params.tag, this.tagsCache, (tid) => {
      Utils.go('/materials', { ...params, tag: tid || '', page: 1 });
    });

    // 加载列表
    try {
      const r = await API.materials.list(filters);
      const listEl = document.getElementById('mat-list');
      if (!r.items.length) {
        listEl.innerHTML = '<div class="empty">未找到匹配的资料</div>';
      } else {
        listEl.innerHTML = r.items.map(m => this.matCardHtml(m)).join('');
        listEl.querySelectorAll('.mat-card').forEach(el => {
          el.onclick = () => Utils.go('/materials/' + el.dataset.mid);
        });
      }
      Utils.renderPager(document.getElementById('mat-pager'), r, (p) => {
        Utils.go('/materials', { ...params, page: p });
      });
    } catch (e) {
      document.getElementById('mat-list').innerHTML = `<div class="err-box">${Utils.escape(e.message)}</div>`;
    }
  },

  renderCatTreeFilter(container, activeCid, onChange) {
    const tree = this.catsTree || [];
    // 记录哪些节点是展开的（默认全部折叠，只展开包含 activeCid 的路径）
    const openIds = new Set();
    const markOpen = (nodes, target) => {
      for (const n of nodes) {
        if (String(n.id) === String(target)) return true;
        if (n.children && n.children.length && markOpen(n.children, target)) {
          openIds.add(n.id); return true;
        }
      }
      return false;
    };
    if (activeCid) markOpen(tree, activeCid);

    const render = (nodes, depth) => nodes.map(n => {
      const hasKids = n.children && n.children.length;
      const isOpen = openIds.has(n.id);
      const isActive = String(n.id) === String(activeCid);
      return `
        <div class="cat-node depth-${depth} ${isActive ? 'active' : ''}" data-cid="${n.id}">
          ${hasKids
            ? `<span class="cat-toggle" data-tid="${n.id}">${isOpen ? '▾' : '▸'}</span>`
            : '<span class="cat-toggle-ph"></span>'}
          <span class="cat-node-label">${n.icon || ''} ${Utils.escape(n.name)}</span>
        </div>
        ${hasKids ? `<div class="cat-children" data-pid="${n.id}" style="${isOpen ? '' : 'display:none'}">${render(n.children, depth + 1)}</div>` : ''}
      `;
    }).join('');

    container.innerHTML = `
      <div class="cat-node depth-0 ${!activeCid ? 'active' : ''}" data-cid="">
        <span class="cat-toggle-ph"></span>
        <span class="cat-node-label">全部</span>
      </div>
      ${render(tree, 0)}
    `;

    // 点击折叠箭头：展开/折叠子树
    container.querySelectorAll('.cat-toggle').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const pid = btn.dataset.tid;
        const kids = container.querySelector(`.cat-children[data-pid="${pid}"]`);
        if (!kids) return;
        const collapsed = kids.style.display === 'none';
        kids.style.display = collapsed ? '' : 'none';
        btn.textContent = collapsed ? '▾' : '▸';
      };
    });

    // 点击分类名：筛选资料
    container.querySelectorAll('.cat-node').forEach(n => {
      n.querySelector('.cat-node-label').onclick = (e) => {
        e.stopPropagation();
        onChange(n.dataset.cid);
      };
    });
  },

  renderTagFilter(container, activeTid, tags, onChange) {
    const byDim = {};
    tags.forEach(t => {
      const d = t.dimension || 'other';
      (byDim[d] = byDim[d] || []).push(t);
    });
    const dimLabel = { product: '产品', industry: '行业', format: '格式', status: '状态', scene: '场景', other: '其他' };
    container.innerHTML = Object.keys(byDim).map(d => `
      <div class="tag-dim">
        <div class="tag-dim-label">${dimLabel[d] || d}</div>
        <div class="tag-dim-list">
          ${byDim[d].map(t =>
            `<span class="tag ${Utils.tagClass(t.dimension)} ${String(t.id) === String(activeTid) ? 'on' : ''}" data-tid="${t.id}">${Utils.escape(t.name)}</span>`
          ).join('')}
        </div>
      </div>
    `).join('');
    container.querySelectorAll('.tag').forEach(el => {
      el.onclick = () => onChange(el.dataset.tid === activeTid ? '' : el.dataset.tid);
    });
  },

  /* ===================== 资料详情 ===================== */
  async viewMaterialDetail(view, id) {
    try {
      const m = await API.materials.detail(id);
      const canEdit = ['super_admin', 'presales_admin'].includes(this.user.role) || m.created_by === this.user.id;
      const tags = m.tags || [];
      const versions = m.versions || [];
      const files = (m.current_file ? [m.current_file] : []);

      view.innerHTML = `
        <div class="detail-page">
          <div class="detail-head">
            <a class="back-link" onclick="history.back()">← 返回</a>
            <div class="detail-title-row">
              <div class="detail-icon">${Utils.fileIcon(m.current_file && m.current_file.extension)}</div>
              <div class="detail-title-wrap">
                <h1 class="detail-title">${Utils.escape(m.title)}</h1>
                <div class="detail-meta">
                  <span>分类：${Utils.escape(this.catPath(m.category_id))}</span>
                  <span>上传：${Utils.escape(m.creator_name || '')}</span>
                  <span>发布：${Utils.fmtDate(m.audited_at || m.created_at)}</span>
                  <span class="badge badge-${m.status}">${this.statusLabel(this.derivedStatus(m))}</span>
                </div>
              </div>
              <div class="detail-actions">
                <button class="btn btn-ghost" id="fav-btn">${m.is_favorited ? '★ 已收藏' : '☆ 收藏'}</button>
                ${files.length ? `<button class="btn btn-primary" id="download-btn">⬇ 下载</button>` : ''}
                ${canEdit ? `<button class="btn btn-ghost" id="edit-btn">编辑</button>` : ''}
                ${canEdit ? `<button class="btn btn-ghost" id="new-ver-btn">新版本</button>` : ''}
              </div>
            </div>
            <div class="detail-tags">
              ${tags.map(t => `<span class="tag ${Utils.tagClass(t.dimension)}">${Utils.escape(t.name)}</span>`).join('')}
            </div>
          </div>
          <div class="detail-body">
            <div class="detail-main">
              <section class="card">
                <div class="card-head"><span class="card-title">资料介绍</span></div>
                <div class="detail-desc">${Utils.escape(m.summary || '（暂无描述）').replace(/\n/g, '<br>')}</div>
              </section>
              ${files.length ? `
                <section class="card">
                  <div class="card-head"><span class="card-title">文件预览</span></div>
                  <div id="preview-box" class="preview-box"></div>
                </section>` : ''}
              <section class="card">
                <div class="card-head"><span class="card-title">反馈</span></div>
                <div id="feedback-area"></div>
              </section>
            </div>
            <aside class="detail-side">
              <div class="card">
                <div class="card-head"><span class="card-title">统计</span></div>
                <div class="stat-line"><span>浏览</span><span>${m.view_count || 0}</span></div>
                <div class="stat-line"><span>下载</span><span>${m.download_count || 0}</span></div>
                <div class="stat-line"><span>收藏</span><span>${m.favorite_count || 0}</span></div>
                <div class="stat-line"><span>文件大小</span><span>${Utils.fmtSize((m.current_file && m.current_file.file_size))}</span></div>
              </div>
              ${versions.length > 1 ? `
                <div class="card">
                  <div class="card-head"><span class="card-title">版本历史</span></div>
                  <div class="ver-list">
                    ${versions.map(v => `
                      <div class="ver-item ${v.is_current ? 'current' : ''}" data-vid="${v.id}">
                        <span class="ver-no">v${v.version_no}</span>
                        <span class="ver-note">${Utils.escape(v.update_note || '')}</span>
                        <span class="ver-date">${Utils.fmtDate(v.created_at, false)}</span>
                      </div>`).join('')}
                  </div>
                </div>` : ''}
            </aside>
          </div>
        </div>
      `;

      // 预览
      const fileObj = files[0];
      if (fileObj) this.renderPreview(document.getElementById('preview-box'), fileObj);

      // 反馈
      this.renderFeedbackArea(document.getElementById('feedback-area'), m);

      // 按钮
      document.getElementById('fav-btn').onclick = async () => {
        try {
          if (m.is_favorited) {
            await API.materials.unfavorite(m.id);
            Utils.toast('已取消收藏');
          } else {
            await API.materials.favorite(m.id);
            Utils.toast('已收藏', 'ok');
          }
          this.route();
        } catch (e) { Utils.toast(e.message, 'err'); }
      };
      const dlBtn = document.getElementById('download-btn');
      if (dlBtn) dlBtn.onclick = () => {
        if (fileObj) window.open(`/api/files/${fileObj.file_id || fileObj.id}/download`, '_blank');
      };
      const editBtn = document.getElementById('edit-btn');
      if (editBtn) editBtn.onclick = () => this.openMaterialEdit(m);
      const nvBtn = document.getElementById('new-ver-btn');
      if (nvBtn) nvBtn.onclick = () => this.openNewVersion(m);
    } catch (e) {
      view.innerHTML = `<div class="err-box">加载失败：${Utils.escape(e.message)}</div>`;
    }
  },

  renderPreview(box, file) {
    const ext = ((file.extension || file.ext) || '').toLowerCase().replace('.', '');
    if (['pdf'].includes(ext)) {
      box.innerHTML = `<iframe class="preview-iframe" src="/api/files/${file.file_id || file.id}/preview"></iframe>`;
    } else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
      box.innerHTML = `<img class="preview-img" src="/api/files/${file.file_id || file.id}/preview" alt="">`;
    } else {
      box.innerHTML = `
        <div class="preview-fallback">
          <div class="pf-icon">${Utils.fileIcon(ext)}</div>
          <div class="pf-text">${ext.toUpperCase()} 文件不支持在线预览，请下载后查看</div>
        </div>`;
    }
  },

  renderFeedbackArea(box, m) {
    box.innerHTML = `
      <div class="fb-input">
        <textarea id="fb-text" rows="3" placeholder="提交对该资料的反馈（如内容错误、补充建议等）"></textarea>
        <select id="fb-type">
          <option value="suggestion">建议</option>
          <option value="error">错误</option>
          <option value="question">提问</option>
        </select>
        <button id="fb-submit" class="btn btn-primary btn-sm">提交反馈</button>
      </div>
    `;
    document.getElementById('fb-submit').onclick = async () => {
      const text = document.getElementById('fb-text').value.trim();
      if (!text) { Utils.toast('请输入反馈内容', 'warn'); return; }
      try {
        await API.feedbacks.create({
          material_id: m.id,
          fb_type: document.getElementById('fb-type').value,
          content: text,
        });
        Utils.toast('反馈已提交，感谢！', 'ok');
        document.getElementById('fb-text').value = '';
      } catch (e) { Utils.toast(e.message, 'err'); }
    };
  },

  catPath(cid) {
    if (!cid) return '-';
    const map = {};
    this.cats.forEach(c => { map[c.id] = c; });
    const parts = [];
    let cur = map[cid];
    while (cur) { parts.unshift(cur.name); cur = cur.parent_id ? map[cur.parent_id] : null; }
    return parts.join(' / ');
  },

  derivedStatus(m) {
    if (m.audit_status === 'pending') return 'pending';
    if (m.audit_status === 'rejected') return 'rejected';
    if (m.publish_status === 'offline') return 'offline';
    if (m.publish_status === 'archived') return 'archived';
    if (m.publish_status === 'online') return 'published';
    return m.publish_status || 'draft';
  },

  statusLabel(s) {
    return { draft: '草稿', pending: '待审核', published: '已发布', rejected: '已驳回', archived: '已归档', offline: '已下架' }[s] || s;
  },
};

/* ============================================================
   App 扩展：上传 / 编辑 / 搜索 / 个人中心 / 管理后台
   ============================================================ */
Object.assign(App, {

  /* ===================== 上传弹窗 ===================== */
  openUpload() {
    // 先确保分类已加载
    if (!this.catsTree || !this.catsTree.length) {
      Utils.toast('分类数据未加载，请刷新页面重试', 'warn');
      return;
    }

    const m = Utils.modal({
      title: '上传资料',
      width: 720,
      body: `
        <form id="up-form" class="form upload-form">
          <div class="form-group">
            <label>选择文件 *</label>
            <input type="file" id="up-file" accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.aac,.m4a,.flac,.zip,.rar,.txt,.md,.csv" required>
            <div class="form-tip">单文件 ≤ 500MB；支持 pdf/doc/xls/ppt/zip/图片/视频等常见格式</div>
          </div>
          <div class="form-group">
            <label>资料标题 *</label>
            <input name="title" required maxlength="120" placeholder="简明、准确，便于检索">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>所属分类 *</label>
              <select name="category_id" id="up-cat" required></select>
            </div>
            <div class="form-group">
              <label>版本号</label>
              <input name="version_no" placeholder="如 1.0" value="1.0">
            </div>
          </div>
          <div class="form-group">
            <label>资料描述</label>
            <textarea name="summary" rows="3" placeholder="说明资料用途、适用场景、关键信息"></textarea>
          </div>
          <div class="form-group">
            <label>标签（可多选）</label>
            <div id="up-tags" class="tag-picker"><div style="color:#999;font-size:12px">标签加载中…</div></div>
          </div>
          <div class="form-err" id="up-err"></div>
        </form>
      `,
      footer: `<button class="btn btn-ghost" data-act="cancel">取消</button><button class="btn btn-primary" data-act="ok">提交</button>`
    });

    // 填充分类（递归所有叶子节点）
    const leaves = [];
    const walkLeaves = (nodes, path) => {
      (nodes || []).forEach(n => {
        const p = path.concat(n.name || '');
        const kids = n.children || [];
        if (!kids.length) {
          leaves.push({ id: n.id, label: p.join(' / ') });
        } else {
          walkLeaves(kids, p);
        }
      });
    };
    walkLeaves(this.catsTree, []);

    const catSelect = document.getElementById('up-cat');
    if (catSelect) {
      catSelect.innerHTML = '<option value="">请选择分类</option>' +
        leaves.map(l => `<option value="${l.id}">${Utils.escape(l.label)}</option>`).join('');
    }

    // 异步加载标签
    const tagBox = document.getElementById('up-tags');
    this.renderTagPicker(tagBox, []).catch(() => {
      if (tagBox) tagBox.innerHTML = '<span style="color:#999;font-size:12px">标签加载失败</span>';
    });

    // 按钮事件
    m.el.querySelector('[data-act="cancel"]').onclick = m.close;
    m.el.querySelector('[data-act="ok"]').onclick = async () => {
      const fileEl = document.getElementById('up-file');
      const errEl = document.getElementById('up-err');
      errEl.textContent = '';

      if (!fileEl || !fileEl.files.length) { errEl.textContent = '请选择文件'; return; }
      const data = Utils.formData(m.el.querySelector('#up-form'));
      if (!data.title || !data.title.trim()) { errEl.textContent = '请填写资料标题'; return; }
      if (!data.category_id) { errEl.textContent = '请选择所属分类'; return; }

      const tag_ids = this.collectPickedTags(document.getElementById('up-tags'));
      const okBtn = m.el.querySelector('[data-act="ok"]');
      okBtn.disabled = true;
      okBtn.textContent = '上传中…';

      try {
        const fd = new FormData();
        fd.append('file', fileEl.files[0]);
        const f = await API.files.upload(fd);
        await API.materials.create({
          title: data.title.trim(),
          summary: data.summary || '',
          category_id: parseInt(data.category_id, 10),
          version_no: data.version_no || '1.0',
          tag_ids,
          file_id: f.file_id || f.id,
        });
        Utils.toast('已提交，等待管理员审核', 'ok');
        m.close();
        this.route();
      } catch (e) {
        errEl.textContent = e.message || '提交失败，请重试';
      } finally {
        okBtn.disabled = false;
        okBtn.textContent = '提交';
      }
    };
  },


  openMaterialEdit(m) {
    const md = Utils.modal({
      title: '编辑资料信息',
      width: 680,
      body: `
        <form id="me-form" class="form">
          <div class="form-group"><label>标题</label><input name="title" value="${Utils.escape(m.title)}" required></div>
          <div class="form-group"><label>分类</label><select name="category_id" id="me-cat" required></select></div>
          <div class="form-group"><label>描述</label><textarea name="summary" rows="3">${Utils.escape(m.summary || '')}</textarea></div>
          <div class="form-group"><label>标签</label><div id="me-tags" class="tag-picker"></div></div>
          <div class="form-err" id="me-err"></div>
        </form>
      `,
      footer: `<button class="btn btn-ghost" data-act="cancel">取消</button><button class="btn btn-primary" data-act="ok">保存</button>`
    });
    const leaves = [];
    const walk = (nodes, path) => {
      nodes.forEach(n => {
        const p = path.concat(n.name);
        if (!n.children || !n.children.length) {
          if (n.level >= 2) leaves.push({ id: n.id, label: p.join(' / ') });
        } else walk(n.children, p);
      });
    };
    walk(this.catsTree || [], []);
    document.getElementById('me-cat').innerHTML = leaves.map(l =>
      `<option value="${l.id}" ${l.id === m.category_id ? 'selected' : ''}>${Utils.escape(l.label)}</option>`).join('');
    this.renderTagPicker(document.getElementById('me-tags'), (m.tags || []).map(t => t.id));
    md.el.querySelector('[data-act="cancel"]').onclick = md.close;
    md.el.querySelector('[data-act="ok"]').onclick = async () => {
      const d = Utils.formData(md.el.querySelector('#me-form'));
      const tag_ids = this.collectPickedTags(document.getElementById('me-tags'));
      try {
        await API.materials.update(m.id, { ...d, category_id: parseInt(d.category_id, 10), tag_ids });
        Utils.toast('已保存', 'ok');
        md.close();
        this.route();
      } catch (e) { md.el.querySelector('#me-err').textContent = e.message; }
    };
  },

  openNewVersion(m) {
    const md = Utils.modal({
      title: '上传新版本',
      width: 560,
      body: `
        <form id="nv-form" class="form">
          <div class="form-group"><label>新文件 *</label><input type="file" id="nv-file" accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.aac,.m4a,.flac,.zip,.rar,.txt,.md,.csv" required></div>
          <div class="form-group"><label>版本号</label><input name="version_no" placeholder="如 1.1 / 2.0"></div>
          <div class="form-group"><label>更新说明</label><textarea name="update_note" rows="3" placeholder="本次更新的主要变化"></textarea></div>
          <div class="form-err" id="nv-err"></div>
        </form>
      `,
      footer: `<button class="btn btn-ghost" data-act="cancel">取消</button><button class="btn btn-primary" data-act="ok">提交</button>`
    });
    md.el.querySelector('[data-act="cancel"]').onclick = md.close;
    md.el.querySelector('[data-act="ok"]').onclick = async () => {
      const f = document.getElementById('nv-file');
      const err = document.getElementById('nv-err');
      if (!f.files.length) { err.textContent = '请选择文件'; return; }
      const d = Utils.formData(md.el.querySelector('#nv-form'));
      try {
        const fd = new FormData();
        fd.append('file', f.files[0]);
        const up = await API.files.upload(fd);
        await API.materials.newVersion(m.id, { file_id: up.file_id || up.id, version_no: d.version_no, update_note: d.update_note });
        Utils.toast('新版本已提交', 'ok');
        md.close();
        this.route();
      } catch (e) { err.textContent = e.message; }
    };
  },

  /* ===================== 搜索结果（AI） ===================== */
  async viewSearch(view, params) {
    const kw = params.kw || '';
    const mode = params.mode || 'semantic';
    view.innerHTML = `
      <div class="search-page">
        <div class="search-head">
          <h2>${mode === 'semantic' ? '✨ AI 语义检索' : '🔍 关键词检索'} ：${Utils.escape(kw)}</h2>
          <div class="search-tabs">
            <a class="${mode === 'semantic' ? 'on' : ''}" id="tab-semantic">AI 语义</a>
            <a class="${mode === 'keyword' ? 'on' : ''}" id="tab-keyword">关键词</a>
          </div>
        </div>
        <div id="search-result"></div>
      </div>
    `;
    document.getElementById('tab-semantic').onclick = () => Utils.go('/search', { kw, mode: 'semantic' });
    document.getElementById('tab-keyword').onclick = () => Utils.go('/search', { kw, mode: 'keyword' });
    if (!kw.trim()) { document.getElementById('search-result').innerHTML = '<div class="empty">请输入检索内容</div>'; return; }
    try {
      const r = await API.search.search({ q: kw, mode, limit: 30 });
      const box = document.getElementById('search-result');
      const items = r.items || [];
      const note = r.mode === 'keyword_fallback' ? '<div class="search-note">🔍 已使用关键词检索</div>' : '';
      if (!items.length) { box.innerHTML = note + '<div class="empty">未找到匹配结果</div>'; return; }
      box.innerHTML = note + `
        <div class="search-list">
          ${items.map(m => `
            <div class="search-item" data-mid="${m.id}">
              <div class="si-head">
                <span class="si-icon">${Utils.fileIcon(m.current_file && m.current_file.extension)}</span>
                <span class="si-title">${Utils.escape(m.title)}</span>
                ${m.score != null ? `<span class="si-score">相关度 ${(m.score * 100).toFixed(0)}%</span>` : ''}
              </div>
              <div class="si-desc">${Utils.escape((m.summary || '').slice(0, 200))}</div>
              <div class="si-meta">
                <span>${Utils.escape(this.catPath(m.category_id))}</span>
                <span>浏览 ${m.view_count || 0}</span>
                <span>下载 ${m.download_count || 0}</span>
              </div>
            </div>`).join('')}
        </div>
      `;
      box.querySelectorAll('[data-mid]').forEach(el => {
        el.onclick = () => Utils.go('/materials/' + el.dataset.mid);
      });
    } catch (e) {
      document.getElementById('search-result').innerHTML = `<div class="err-box">${Utils.escape(e.message)}</div>`;
    }
  },

  /* ===================== 个人中心 ===================== */
  async viewMyFavorites(view, params) {
    const page = parseInt(params.page || '1', 10);
    view.innerHTML = `<div class="me-page"><h2>我的收藏</h2><div id="me-list" class="mat-grid"></div><div id="me-pager"></div></div>`;
    const r = await API.me.favorites({ page, page_size: 20 });
    if (!r.items.length) document.getElementById('me-list').innerHTML = '<div class="empty">暂无收藏</div>';
    else {
      document.getElementById('me-list').innerHTML = r.items.map(m => this.matCardHtml(m)).join('');
      document.querySelectorAll('#me-list .mat-card').forEach(el => el.onclick = () => Utils.go('/materials/' + el.dataset.mid));
    }
    Utils.renderPager(document.getElementById('me-pager'), r, p => Utils.go('/me/favorites', { page: p }));
  },

  async viewMyHistory(view, params) {
    const tab = params.tab || 'views';
    const page = parseInt(params.page || '1', 10);
    view.innerHTML = `
      <div class="me-page">
        <h2>历史记录</h2>
        <div class="tabs">
          <a class="${tab === 'views' ? 'on' : ''}" data-tab="views">浏览历史</a>
          <a class="${tab === 'downloads' ? 'on' : ''}" data-tab="downloads">下载历史</a>
        </div>
        <div id="me-list" class="rank-list"></div>
        <div id="me-pager"></div>
      </div>
    `;
    document.querySelectorAll('.tabs a').forEach(a => a.onclick = () => Utils.go('/me/history', { tab: a.dataset.tab, page: 1 }));
    const fn = tab === 'downloads' ? API.me.downloads : API.me.views;
    const r = await fn({ page, page_size: 30 });
    const box = document.getElementById('me-list');
    if (!r.items.length) box.innerHTML = '<div class="empty">暂无记录</div>';
    else {
      box.innerHTML = r.items.map(m => `
        <div class="rank-item" data-mid="${m.material_id || m.id}">
          <span class="recent-icon">${Utils.fileIcon(m.current_file && m.current_file.extension)}</span>
          <span class="rank-title">${Utils.escape(m.title || '')}</span>
          <span class="rank-meta">${Utils.fmtDate(m.viewed_at || m.downloaded_at)}</span>
        </div>`).join('');
      box.querySelectorAll('[data-mid]').forEach(el => el.onclick = () => Utils.go('/materials/' + el.dataset.mid));
    }
    Utils.renderPager(document.getElementById('me-pager'), r, p => Utils.go('/me/history', { tab, page: p }));
  },

  async viewMyFeedbacks(view, params) {
    const page = parseInt(params.page || '1', 10);
    const r = await API.me.feedbacks({ page, page_size: 20 });
    view.innerHTML = `
      <div class="me-page">
        <h2>我的反馈</h2>
        ${r.items.length ? `
          <table class="data-table">
            <thead><tr><th>资料</th><th>类型</th><th>内容</th><th>状态</th><th>提交时间</th><th>回复</th></tr></thead>
            <tbody>
              ${r.items.map(f => `
                <tr>
                  <td><a onclick="Utils.go('/materials/${f.material_id}')">${Utils.escape(f.material_title || '')}</a></td>
                  <td>${this.fbTypeLabel(f.fb_type)}</td>
                  <td class="td-text">${Utils.escape(f.content)}</td>
                  <td><span class="badge badge-${f.status}">${this.fbStatusLabel(f.status)}</span></td>
                  <td>${Utils.fmtDate(f.created_at, false)}</td>
                  <td class="td-text">${Utils.escape(f.reply || '-')}</td>
                </tr>`).join('')}
            </tbody>
          </table>` : '<div class="empty">暂无反馈</div>'}
        <div id="me-pager"></div>
      </div>
    `;
    Utils.renderPager(document.getElementById('me-pager'), r, p => Utils.go('/me/feedbacks', { page: p }));
  },

  fbTypeLabel(t) { return { suggestion: '建议', error: '错误', question: '提问' }[t] || t; },
  fbStatusLabel(s) { return { open: '待处理', replied: '已回复', closed: '已关闭' }[s] || s; },

  /* ===================== 管理后台 - 资料 ===================== */
  async viewAdminMaterials(view, params) {
    const status  = params.status  || '';
    const keyword = params.keyword || '';
    const catId   = params.cat_id  || '';
    const page    = parseInt(params.page || '1', 10);

    // build category options
    const catOpts = (this.cats || [])
      .filter(c => !c.parent_id)
      .map(c => `<option value="${c.id}" ${catId == c.id ? 'selected' : ''}>${Utils.escape(c.name)}</option>`)
      .join('');

    view.innerHTML = `
      <div class="admin-page">
        <div class="admin-head">
          <h2>资料管理</h2>
          <button class="btn btn-primary btn-sm" id="adm-upload-btn">+ 上传资料</button>
        </div>

        <!-- 搜索筛选栏 -->
        <div class="dl-filters" style="margin-bottom:12px">
          <input id="adm-kw" placeholder="搜索资料名称…" value="${Utils.escape(keyword)}" style="width:220px">
          <select id="adm-cat" style="height:32px;padding:0 8px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px">
            <option value="">全部分类</option>${catOpts}
          </select>
          <select id="adm-status" style="height:32px;padding:0 8px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px">
            <option value=""  ${status===''       ?'selected':''}>全部状态</option>
            <option value="pending"   ${status==='pending'  ?'selected':''}>待审核</option>
            <option value="published" ${status==='published'?'selected':''}>已发布</option>
            <option value="rejected"  ${status==='rejected' ?'selected':''}>已驳回</option>
            <option value="offline"   ${status==='offline'  ?'selected':''}>已下架</option>
            <option value="archived"  ${status==='archived' ?'selected':''}>已归档</option>
          </select>
          <button id="adm-search-btn" class="btn btn-primary btn-sm">筛选</button>
          <button id="adm-rebuild-btn" class="btn btn-ghost btn-sm" title="重建 AI 索引">🔄 重建 AI 索引</button>
        </div>

        <!-- 快捷状态 tabs -->
        <div class="admin-tabs" style="margin-bottom:12px">
          ${[['', '全部'], ['pending', '⏳ 待审核'], ['published', '✓ 已发布'], ['rejected', '✗ 已驳回'], ['offline', '已下架'], ['archived', '已归档']]
            .map(([v, l]) => `<a class="${status === v ? 'on' : ''}" data-s="${v}">${l}</a>`).join('')}
        </div>

        <table class="data-table">
          <thead><tr>
            <th>资料名称</th><th>分类</th><th>上传者</th>
            <th>审核状态</th><th>发布状态</th>
            <th>下载</th><th>更新时间</th><th>操作</th>
          </tr></thead>
          <tbody id="adm-tbody"><tr><td colspan="8">加载中…</td></tr></tbody>
        </table>
        <div id="adm-pager"></div>
      </div>
    `;

    // 事件绑定
    document.getElementById('adm-upload-btn').onclick = () => Utils.go('/upload');
    const doFilter = () => Utils.go('/admin/materials', {
      keyword: document.getElementById('adm-kw').value.trim(),
      cat_id:  document.getElementById('adm-cat').value,
      status:  document.getElementById('adm-status').value,
      page: 1,
    });
    document.getElementById('adm-search-btn').onclick = doFilter;
    document.getElementById('adm-kw').onkeydown = e => { if (e.key === 'Enter') doFilter(); };
    document.querySelectorAll('.admin-tabs a').forEach(a => a.onclick = () => {
      Utils.go('/admin/materials', { keyword, cat_id: catId, status: a.dataset.s, page: 1 });
    });
    document.getElementById('adm-rebuild-btn').onclick = async () => {
      const btn = document.getElementById('adm-rebuild-btn');
      btn.disabled = true; btn.textContent = '重建中…';
      try {
        const r = await API.search.rebuildIndex();
        Utils.toast(`AI 索引重建完成，共处理 ${r.indexed || 0} 条`, 'ok');
      } catch (e) { Utils.toast(e.message, 'err'); }
      finally { btn.disabled = false; btn.textContent = '🔄 重建 AI 索引'; }
    };

    // 构建查询参数
    const adminFilter = { admin: true, page, page_size: 20 };
    if (keyword) adminFilter.kw = keyword;
    if (catId)   adminFilter.cat_id = catId;
    if (status === 'pending')    adminFilter.audit_status = 'pending';
    else if (status === 'rejected')  adminFilter.audit_status = 'rejected';
    else if (status === 'published') { adminFilter.audit_status = 'approved'; adminFilter.publish_status = 'online'; }
    else if (status === 'offline')   adminFilter.publish_status = 'offline';
    else if (status === 'archived')  adminFilter.publish_status = 'archived';

    const auditLabel = { pending:'⏳ 待审核', approved:'✓ 已通过', rejected:'✗ 已驳回' };
    const auditColor = { pending:'#D97706', approved:'#15803D', rejected:'#B91C1C' };
    const pubLabel   = { draft:'草稿', online:'✓ 已上架', offline:'已下架', archived:'已归档' };
    const pubColor   = { draft:'#9CA3AF', online:'#1D9E75', offline:'#6B7280', archived:'#9CA3AF' };

    try {
      const r = await API.materials.list(adminFilter);
      const tb = document.getElementById('adm-tbody');
      if (!r.items.length) { tb.innerHTML = '<tr><td colspan="8" class="empty">暂无数据</td></tr>'; return; }
      tb.innerHTML = r.items.map(m => `
        <tr>
          <td><a onclick="Utils.go('/materials/${m.id}')">${Utils.escape(m.title)}</a></td>
          <td>${Utils.escape(this.catPath(m.category_id))}</td>
          <td>${Utils.escape(m.creator_name || '')}</td>
          <td><span style="color:${auditColor[m.audit_status]||'#6B7280'};font-weight:600">${auditLabel[m.audit_status]||m.audit_status}</span></td>
          <td><span style="color:${pubColor[m.publish_status]||'#6B7280'};font-weight:600">${pubLabel[m.publish_status]||m.publish_status}</span></td>
          <td>${m.download_count || 0}</td>
          <td>${Utils.fmtDate(m.updated_at, false)}</td>
          <td class="row-act">
            ${m.audit_status === 'pending' ? `<a data-act="approve" data-id="${m.id}" style="color:#15803D;font-weight:600">通过</a> <a data-act="reject" data-id="${m.id}" style="color:#B91C1C">驳回</a>` : ''}
            ${m.audit_status === 'approved' && m.publish_status === 'online' ? `<a data-act="offline" data-id="${m.id}">下架</a> <a data-act="pin" data-id="${m.id}">${m.is_pinned ? '取消置顶' : '置顶'}</a>` : ''}
            ${m.publish_status === 'offline' ? `<a data-act="republish" data-id="${m.id}" style="color:#1D9E75;font-weight:600">重新上架</a>` : ''}
            ${['online','offline'].includes(m.publish_status) ? ` <a data-act="archive" data-id="${m.id}" style="color:#9CA3AF">归档</a>` : ''}
            <a data-act="edit" data-id="${m.id}">编辑</a>
          </td>
        </tr>
      `).join('');
      tb.querySelectorAll('a[data-act]').forEach(a => {
        a.onclick = () => {
          if (a.dataset.act === 'edit') Utils.go('/materials/' + a.dataset.id + '/edit');
          else this.adminMatAction(a.dataset.act, parseInt(a.dataset.id, 10));
        };
      });
      Utils.renderPager(document.getElementById('adm-pager'), r, p =>
        Utils.go('/admin/materials', { keyword, cat_id: catId, status, page: p }));
    } catch (e) {
      document.getElementById('adm-tbody').innerHTML = `<tr><td colspan="8" class="err-box">${Utils.escape(e.message)}</td></tr>`;
    }
  },

  async adminMatAction(act, id) {
    try {
      if (act === 'approve') { await API.materials.approve(id); Utils.toast('已通过', 'ok'); }
      else if (act === 'reject') {
        const reason = prompt('驳回原因');
        if (reason == null) return;
        await API.materials.reject(id, reason || '');
        Utils.toast('已驳回');
      }
      else if (act === 'offline') { await API.materials.offline(id); Utils.toast('已下架'); }
      else if (act === 'republish') { await API.materials.republish(id); Utils.toast('已重新上架', 'ok'); }
      else if (act === 'archive') {
        if (!await Utils.confirm('确认归档此资料？')) return;
        await API.materials.archive(id);
        Utils.toast('已归档');
      }
      else if (act === 'pin') { await API.materials.pin(id); Utils.toast('已更新置顶'); }
      this.route();
    } catch (e) { Utils.toast(e.message, 'err'); }
  },

  /* ===================== 管理后台 - 分类 ===================== */
  async viewAdminCategories(view) {
    view.innerHTML = `
      <div class="admin-page">
        <div class="admin-head"><h2>分类管理</h2></div>
        <div id="cat-mgr"></div>
      </div>
    `;
    this.renderCatMgr(document.getElementById('cat-mgr'));
  },

  async renderCatMgr(box) {
    const cats = await API.cats.list();
    this.cats = cats;
    this.catsTree = this.buildCatTree(cats);
    const render = (nodes, depth) => {
      return nodes.map(n => `
        <div class="cat-row depth-${depth}">
          <span class="cat-row-name">${'　'.repeat(depth)}${n.icon || ''} ${Utils.escape(n.name)}
            ${n.is_builtin ? '<span class="badge badge-gray">内置</span>' : ''}
            ${n.is_locked ? '<span class="badge badge-gray">锁定</span>' : ''}
          </span>
          <span class="cat-row-act">
            ${depth < 2 ? `<a data-act="add" data-pid="${n.id}" data-level="${depth + 1}">+ 子分类</a>` : ''}
            ${!n.is_builtin && !n.is_locked ? `<a data-act="edit" data-id="${n.id}">编辑</a><a data-act="del" data-id="${n.id}">删除</a>` : ''}
          </span>
        </div>
        ${n.children && n.children.length ? `<div class="cat-sub">${render(n.children, depth + 1)}</div>` : ''}
      `).join('');
    };
    box.innerHTML = `
      <div class="cat-mgr-toolbar">
        <button class="btn btn-primary btn-sm" id="cat-add-root">+ 新增一级分类</button>
        <span class="form-tip">说明：内置一级分类不可删除/重命名；二级锁定分类不可删除</span>
      </div>
      ${render(this.catsTree, 0)}
    `;
    box.querySelector('#cat-add-root').onclick = () => this.openCatEdit({ level: 0 });
    box.querySelectorAll('a[data-act]').forEach(a => {
      a.onclick = () => {
        const act = a.dataset.act;
        if (act === 'add') this.openCatEdit({ parent_id: parseInt(a.dataset.pid, 10), level: parseInt(a.dataset.level, 10) });
        else if (act === 'edit') {
          const c = this.cats.find(x => x.id === parseInt(a.dataset.id, 10));
          this.openCatEdit(c);
        } else if (act === 'del') this.adminCatDelete(parseInt(a.dataset.id, 10));
      };
    });
  },

  openCatEdit(c) {
    const isNew = !c.id;
    const md = Utils.modal({
      title: isNew ? '新增分类' : '编辑分类',
      width: 420,
      body: `
        <form id="ce-form" class="form">
          <div class="form-group"><label>名称 *</label><input name="name" required maxlength="40" value="${Utils.escape(c.name || '')}"></div>
          <div class="form-group"><label>图标 emoji</label><input name="icon" maxlength="4" value="${Utils.escape(c.icon || '')}" placeholder="如 📁"></div>
          <div class="form-group"><label>描述</label><input name="summary" maxlength="120" value="${Utils.escape(c.description || '')}"></div>
          <div class="form-group"><label>排序</label><input name="sort_order" type="number" value="${c.sort_order || 0}"></div>
          <div class="form-err" id="ce-err"></div>
        </form>
      `,
      footer: `<button class="btn btn-ghost" data-act="cancel">取消</button><button class="btn btn-primary" data-act="ok">保存</button>`
    });
    md.el.querySelector('[data-act="cancel"]').onclick = md.close;
    md.el.querySelector('[data-act="ok"]').onclick = async () => {
      const d = Utils.formData(md.el.querySelector('#ce-form'));
      d.sort_order = parseInt(d.sort_order, 10) || 0;
      try {
        if (isNew) await API.cats.create({ ...d, parent_id: c.parent_id || null, level: c.level || 0 });
        else await API.cats.update(c.id, d);
        Utils.toast('已保存', 'ok');
        md.close();
        this.renderCatMgr(document.getElementById('cat-mgr'));
      } catch (e) { md.el.querySelector('#ce-err').textContent = e.message; }
    };
  },

  async adminCatDelete(id) {
    if (!await Utils.confirm('确认删除该分类？该分类下若有资料将无法删除。')) return;
    try { await API.cats.delete(id); Utils.toast('已删除'); this.renderCatMgr(document.getElementById('cat-mgr')); }
    catch (e) { Utils.toast(e.message, 'err'); }
  },

  /* ===================== 管理后台 - 标签 ===================== */
  async viewAdminTags(view) {
    view.innerHTML = `
      <div class="admin-page">
        <div class="admin-head">
          <h2>标签管理</h2>
          <button class="btn btn-primary btn-sm" id="tag-new">+ 新增标签</button>
        </div>
        <div id="tag-mgr"></div>
      </div>
    `;
    document.getElementById('tag-new').onclick = () => this.openTagEdit({});
    this.renderTagMgr(document.getElementById('tag-mgr'));
  },

  async renderTagMgr(box) {
    const tags = await API.tags.list();
    this.tagsCache = tags;
    const byDim = {};
    tags.forEach(t => { (byDim[t.dimension || 'other'] = byDim[t.dimension || 'other'] || []).push(t); });
    const dimLabel = { product: '产品', industry: '行业', format: '格式', status: '状态', scene: '场景', other: '其他' };
    box.innerHTML = Object.keys(byDim).map(d => `
      <div class="tag-dim-mgr">
        <div class="tag-dim-head">${dimLabel[d] || d}</div>
        <div class="tag-dim-body">
          ${byDim[d].map(t => `
            <div class="tag-row">
              <span class="tag ${Utils.tagClass(t.dimension)}">${Utils.escape(t.name)}</span>
              <span class="tag-row-count">使用 ${t.usage_count || 0}</span>
              <span class="tag-row-act">
                <a data-act="edit" data-id="${t.id}">编辑</a>
                <a data-act="del" data-id="${t.id}">删除</a>
              </span>
            </div>`).join('')}
        </div>
      </div>
    `).join('');
    box.querySelectorAll('a[data-act]').forEach(a => {
      a.onclick = () => {
        const t = tags.find(x => x.id === parseInt(a.dataset.id, 10));
        if (a.dataset.act === 'edit') this.openTagEdit(t);
        else this.adminTagDelete(t.id);
      };
    });
  },

  openTagEdit(t) {
    const isNew = !t.id;
    const md = Utils.modal({
      title: isNew ? '新增标签' : '编辑标签',
      width: 420,
      body: `
        <form id="te-form" class="form">
          <div class="form-group"><label>名称 *</label><input name="name" required maxlength="30" value="${Utils.escape(t.name || '')}"></div>
          <div class="form-group"><label>维度</label>
            <select name="dimension">
              ${['product','industry','format','status','scene','other']
                .map(d => `<option value="${d}" ${t.dimension === d ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-err" id="te-err"></div>
        </form>
      `,
      footer: `<button class="btn btn-ghost" data-act="cancel">取消</button><button class="btn btn-primary" data-act="ok">保存</button>`
    });
    md.el.querySelector('[data-act="cancel"]').onclick = md.close;
    md.el.querySelector('[data-act="ok"]').onclick = async () => {
      const d = Utils.formData(md.el.querySelector('#te-form'));
      try {
        if (isNew) await API.tags.create(d);
        else await API.tags.update(t.id, d);
        Utils.toast('已保存', 'ok');
        md.close();
        this.tagsCache = null;
        this.renderTagMgr(document.getElementById('tag-mgr'));
      } catch (e) { md.el.querySelector('#te-err').textContent = e.message; }
    };
  },

  async adminTagDelete(id) {
    if (!await Utils.confirm('确认删除该标签？关联资料将自动解除关联。')) return;
    try { await API.tags.delete(id); Utils.toast('已删除'); this.tagsCache = null; this.renderTagMgr(document.getElementById('tag-mgr')); }
    catch (e) { Utils.toast(e.message, 'err'); }
  },

  /* ===================== 管理后台 - 公告/推荐 ===================== */
  async viewAdminAnnouncements(view) {
    view.innerHTML = `
      <div class="admin-page">
        <div class="admin-head">
          <h2>公告与推荐</h2>
          <button class="btn btn-primary btn-sm" id="ann-new">+ 新增公告</button>
        </div>
        <h3 class="sub-title">公告列表</h3>
        <table class="data-table" id="ann-table">
          <thead><tr><th>标题</th><th>级别</th><th>状态</th><th>有效期</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody><tr><td colspan="6">加载中…</td></tr></tbody>
        </table>
        <h3 class="sub-title">首页推荐位</h3>
        <div id="rec-list"></div>
        <button class="btn btn-primary btn-sm" id="rec-add">+ 添加推荐</button>
      </div>
    `;
    document.getElementById('ann-new').onclick = () => this.openAnnEdit({});
    document.getElementById('rec-add').onclick = () => this.openRecAdd();
    this.renderAnnList();
    this.renderRecList();
  },

  async renderAnnList() {
    const items = await API.ops.anns({});
    const tb = document.querySelector('#ann-table tbody');
    if (!items.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">暂无公告</td></tr>'; return; }
    tb.innerHTML = items.map(a => `
      <tr>
        <td>${Utils.escape(a.title)}</td>
        <td><span class="badge badge-${a.level}">${a.level === 'urgent' ? '紧急' : a.level === 'important' ? '重要' : '通知'}</span></td>
        <td>${a.is_active ? '已发布' : '已隐藏'}</td>
        <td>${a.start_at ? Utils.fmtDate(a.start_at, false) : '-'} 至 ${a.end_at ? Utils.fmtDate(a.end_at, false) : '-'}</td>
        <td>${Utils.fmtDate(a.created_at, false)}</td>
        <td class="row-act">
          <a data-act="edit" data-id="${a.id}">编辑</a>
          <a data-act="toggle" data-id="${a.id}">${a.is_active ? '隐藏' : '发布'}</a>
          <a data-act="del" data-id="${a.id}">删除</a>
        </td>
      </tr>`).join('');
    tb.querySelectorAll('a[data-act]').forEach(a => {
      a.onclick = async () => {
        const id = parseInt(a.dataset.id, 10);
        const item = items.find(x => x.id === id);
        if (a.dataset.act === 'edit') this.openAnnEdit(item);
        else if (a.dataset.act === 'toggle') {
          await API.ops.annUpdate(id, { is_active: !item.is_active });
          this.renderAnnList();
        } else if (a.dataset.act === 'del') {
          if (await Utils.confirm('确认删除该公告？')) {
            await API.ops.annDelete(id);
            this.renderAnnList();
          }
        }
      };
    });
  },

  openAnnEdit(a) {
    const isNew = !a.id;
    const md = Utils.modal({
      title: isNew ? '新增公告' : '编辑公告',
      width: 600,
      body: `
        <form id="ae-form" class="form">
          <div class="form-group"><label>标题 *</label><input name="title" required maxlength="120" value="${Utils.escape(a.title || '')}"></div>
          <div class="form-group"><label>正文</label><textarea name="content" rows="5">${Utils.escape(a.content || '')}</textarea></div>
          <div class="form-row">
            <div class="form-group"><label>级别</label>
              <select name="level">
                ${['normal','important','urgent'].map(l => `<option value="${l}" ${a.level === l ? 'selected' : ''}>${l === 'urgent' ? '紧急' : l === 'important' ? '重要' : '通知'}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>立即发布</label><select name="is_active"><option value="true" ${a.is_active !== false ? 'selected' : ''}>是</option><option value="false" ${a.is_active === false ? 'selected' : ''}>否</option></select></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>开始</label><input type="datetime-local" name="start_at" value="${a.start_at ? a.start_at.replace(' ', 'T').slice(0,16) : ''}"></div>
            <div class="form-group"><label>结束</label><input type="datetime-local" name="end_at" value="${a.end_at ? a.end_at.replace(' ', 'T').slice(0,16) : ''}"></div>
          </div>
          <div class="form-err" id="ae-err"></div>
        </form>
      `,
      footer: `<button class="btn btn-ghost" data-act="cancel">取消</button><button class="btn btn-primary" data-act="ok">保存</button>`
    });
    md.el.querySelector('[data-act="cancel"]').onclick = md.close;
    md.el.querySelector('[data-act="ok"]').onclick = async () => {
      const d = Utils.formData(md.el.querySelector('#ae-form'));
      d.is_active = d.is_active === 'true';
      try {
        if (isNew) await API.ops.annCreate(d);
        else await API.ops.annUpdate(a.id, d);
        Utils.toast('已保存', 'ok'); md.close(); this.renderAnnList();
      } catch (e) { md.el.querySelector('#ae-err').textContent = e.message; }
    };
  },

  async renderRecList() {
    const items = await API.ops.recsHome({ admin: true }).catch(() => []);
    const box = document.getElementById('rec-list');
    if (!items.length) { box.innerHTML = '<div class="empty">暂未设置推荐</div>'; return; }
    box.innerHTML = `
      <table class="data-table">
        <thead><tr><th>资料</th><th>位置</th><th>排序</th><th>操作</th></tr></thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td><a onclick="Utils.go('/materials/${r.material_id}')">${Utils.escape(r.material_title || '')}</a></td>
              <td>${r.position || 'home'}</td>
              <td>${r.sort_order || 0}</td>
              <td class="row-act"><a data-act="del" data-id="${r.id}">移除</a></td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;
    box.querySelectorAll('a[data-act="del"]').forEach(a => {
      a.onclick = async () => {
        if (await Utils.confirm('从推荐位移除？')) {
          await API.ops.recDelete(parseInt(a.dataset.id, 10));
          this.renderRecList();
        }
      };
    });
  },

  openRecAdd() {
    const md = Utils.modal({
      title: '添加推荐',
      width: 480,
      body: `
        <form id="ra-form" class="form">
          <div class="form-group"><label>资料 ID *</label><input name="material_id" type="number" required></div>
          <div class="form-group"><label>排序</label><input name="sort_order" type="number" value="0"></div>
          <div class="form-err" id="ra-err"></div>
        </form>
      `,
      footer: `<button class="btn btn-ghost" data-act="cancel">取消</button><button class="btn btn-primary" data-act="ok">保存</button>`
    });
    md.el.querySelector('[data-act="cancel"]').onclick = md.close;
    md.el.querySelector('[data-act="ok"]').onclick = async () => {
      const d = Utils.formData(md.el.querySelector('#ra-form'));
      try {
        await API.ops.recCreate({
          material_id: parseInt(d.material_id, 10),
          sort_order: parseInt(d.sort_order, 10) || 0,
          position: 'home',
        });
        Utils.toast('已添加', 'ok'); md.close(); this.renderRecList();
      } catch (e) { md.el.querySelector('#ra-err').textContent = e.message; }
    };
  },

  /* ===================== 管理后台 - 反馈 ===================== */
  async viewAdminFeedbacks(view, params) {
    const status = params.status || '';
    const page = parseInt(params.page || '1', 10);
    view.innerHTML = `
      <div class="admin-page">
        <div class="admin-head">
          <h2>反馈处理</h2>
          <div class="admin-tabs">
            ${[['', '全部'], ['open', '待处理'], ['replied', '已回复'], ['closed', '已关闭']]
              .map(([v, l]) => `<a class="${status === v ? 'on' : ''}" data-s="${v}">${l}</a>`).join('')}
          </div>
        </div>
        <table class="data-table">
          <thead><tr><th>资料</th><th>提交人</th><th>类型</th><th>内容</th><th>状态</th><th>提交时间</th><th>操作</th></tr></thead>
          <tbody id="fb-tbody"><tr><td colspan="7">加载中…</td></tr></tbody>
        </table>
        <div id="fb-pager"></div>
      </div>
    `;
    document.querySelectorAll('.admin-tabs a').forEach(a => a.onclick = () => Utils.go('/admin/feedbacks', { status: a.dataset.s, page: 1 }));
    const r = await API.feedbacks.adminList({ status, page, page_size: 20 });
    const tb = document.getElementById('fb-tbody');
    if (!r.items.length) { tb.innerHTML = '<tr><td colspan="7" class="empty">暂无</td></tr>'; }
    else {
      tb.innerHTML = r.items.map(f => `
        <tr>
          <td><a onclick="Utils.go('/materials/${f.material_id}')">${Utils.escape(f.material_title || '')}</a></td>
          <td>${Utils.escape(f.creator_name || '')}</td>
          <td>${this.fbTypeLabel(f.fb_type)}</td>
          <td class="td-text">${Utils.escape(f.content)}</td>
          <td><span class="badge badge-${f.status}">${this.fbStatusLabel(f.status)}</span></td>
          <td>${Utils.fmtDate(f.created_at, false)}</td>
          <td class="row-act"><a data-act="reply" data-id="${f.id}">${f.status === 'open' ? '回复' : '查看'}</a></td>
        </tr>`).join('');
      tb.querySelectorAll('a[data-act="reply"]').forEach(a => {
        const fb = r.items.find(x => x.id === parseInt(a.dataset.id, 10));
        a.onclick = () => this.openFbReply(fb);
      });
    }
    Utils.renderPager(document.getElementById('fb-pager'), r, p => Utils.go('/admin/feedbacks', { status, page: p }));
  },

  openFbReply(f) {
    const md = Utils.modal({
      title: '反馈详情',
      width: 560,
      body: `
        <div class="fb-detail">
          <div class="fb-d-row"><b>资料：</b>${Utils.escape(f.material_title || '')}</div>
          <div class="fb-d-row"><b>提交人：</b>${Utils.escape(f.creator_name || '')}</div>
          <div class="fb-d-row"><b>类型：</b>${this.fbTypeLabel(f.fb_type)}</div>
          <div class="fb-d-row"><b>内容：</b><div class="fb-content">${Utils.escape(f.content)}</div></div>
        </div>
        <form id="fr-form" class="form">
          <div class="form-group"><label>回复</label><textarea name="reply" rows="3">${Utils.escape(f.reply || '')}</textarea></div>
          <div class="form-group"><label>状态</label>
            <select name="status">
              ${['open','replied','closed'].map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${this.fbStatusLabel(s)}</option>`).join('')}
            </select>
          </div>
          <div class="form-err" id="fr-err"></div>
        </form>
      `,
      footer: `<button class="btn btn-ghost" data-act="cancel">取消</button><button class="btn btn-primary" data-act="ok">保存</button>`
    });
    md.el.querySelector('[data-act="cancel"]').onclick = md.close;
    md.el.querySelector('[data-act="ok"]').onclick = async () => {
      const d = Utils.formData(md.el.querySelector('#fr-form'));
      try {
        await API.feedbacks.adminReply(f.id, d);
        Utils.toast('已保存', 'ok'); md.close(); this.route();
      } catch (e) { md.el.querySelector('#fr-err').textContent = e.message; }
    };
  },

  /* ===================== 管理后台 - 数据看板 ===================== */
  async viewAdminStats(view) {
    view.innerHTML = `
      <div class="admin-page">
        <div class="admin-head">
          <h2>数据看板</h2>
          <button id="rebuild-idx-btn" class="btn btn-ghost btn-sm" title="将已上架资料重新生成 AI 语义向量，新资料审核后会自动生成无需手动触发">🔄 重建 AI 索引</button>
        </div>
        <div id="stats-cards" class="stat-cards"></div>
        <div class="row-2">
          <div class="card"><div class="card-head"><span class="card-title">分类资料分布</span></div><div id="cat-dist"></div></div>
          <div class="card"><div class="card-head"><span class="card-title">Top 10 热门资料</span></div><div id="top-mat"></div></div>
        </div>
        <div class="row-2">
          <div class="card"><div class="card-head"><span class="card-title">活跃用户</span></div><div id="active-users"></div></div>
          <div class="card"><div class="card-head"><span class="card-title">近30日趋势</span></div><div id="trend"></div></div>
        </div>
        <div class="card"><div class="card-head"><span class="card-title">最近操作日志</span></div><div id="op-logs"></div></div>
      </div>
    `;
    document.getElementById('rebuild-idx-btn').onclick = async () => {
      const btn = document.getElementById('rebuild-idx-btn');
      btn.disabled = true;
      btn.textContent = '⏳ 索引构建中...';
      try {
        const r = await API.search.rebuildIndex();
        Utils.toast(`AI 索引重建完成，共处理 ${r.total || 0} 条资料`, 'ok', 4000);
      } catch (e) {
        Utils.toast('重建失败: ' + e.message, 'err', 5000);
      } finally {
        btn.disabled = false;
        btn.textContent = '🔄 重建 AI 索引';
      }
    };

    try {
      const [ov, byCat, top, users, trend, logs] = await Promise.all([
        API.stats.overview(),
        API.stats.byCategory(),
        API.stats.topMaterials({ days: 30, limit: 10 }),
        API.stats.activeUsers({ days: 30, limit: 10 }),
        API.stats.trend({ days: 30 }),
        API.stats.opLogs({ limit: 30 }),
      ]);
      document.getElementById('stats-cards').innerHTML = `
        <div class="stat-card"><div class="stat-num">${ov.total_materials || 0}</div><div class="stat-label">资料总数</div></div>
        <div class="stat-card"><div class="stat-num">${ov.published || 0}</div><div class="stat-label">已发布</div></div>
        <div class="stat-card"><div class="stat-num">${ov.pending_review || 0}</div><div class="stat-label">待审核</div></div>
        <div class="stat-card"><div class="stat-num">${ov.total_users || 0}</div><div class="stat-label">注册用户</div></div>
        <div class="stat-card"><div class="stat-num">${ov.total_views_7d || 0}</div><div class="stat-label">近7日浏览</div></div>
        <div class="stat-card"><div class="stat-num">${ov.total_downloads_7d || 0}</div><div class="stat-label">近7日下载</div></div>
      `;
      // 分类分布
      const maxCnt = Math.max(1, ...byCat.map(c => c.cnt || 0));
      document.getElementById('cat-dist').innerHTML = byCat.length ? byCat.map(c => `
        <div class="bar-row">
          <span class="bar-label">${Utils.escape(c.name)}</span>
          <span class="bar-bg"><span class="bar-fill" style="width:${(c.cnt / maxCnt) * 100}%"></span></span>
          <span class="bar-num">${c.cnt || 0}</span>
        </div>`).join('') : '<div class="empty">暂无数据</div>';
      // 热门
      document.getElementById('top-mat').innerHTML = top.length ? top.map((m, i) => `
        <div class="rank-item">
          <span class="rank-no rank-${i < 3 ? 'top' : ''}">${i + 1}</span>
          <a class="rank-title" onclick="Utils.go('/materials/${m.id}')">${Utils.escape(m.title)}</a>
          <span class="rank-meta">浏览 ${m.views || 0} · 下载 ${m.downloads || 0}</span>
        </div>`).join('') : '<div class="empty">暂无数据</div>';
      // 活跃用户
      document.getElementById('active-users').innerHTML = users.length ? users.map((u, i) => `
        <div class="rank-item">
          <span class="rank-no rank-${i < 3 ? 'top' : ''}">${i + 1}</span>
          <span class="rank-title">${Utils.escape(u.real_name || u.username)}</span>
          <span class="rank-meta">浏览 ${u.views || 0} · 下载 ${u.downloads || 0}</span>
        </div>`).join('') : '<div class="empty">暂无数据</div>';
      // 趋势
      const maxT = Math.max(1, ...trend.map(t => Math.max(t.views || 0, t.downloads || 0)));
      document.getElementById('trend').innerHTML = `
        <div class="trend-chart">
          ${trend.map(t => `
            <div class="trend-col" title="${t.date} 浏览 ${t.views || 0} 下载 ${t.downloads || 0}">
              <span class="trend-bar bar-v" style="height:${((t.views || 0) / maxT) * 100}%"></span>
              <span class="trend-bar bar-d" style="height:${((t.downloads || 0) / maxT) * 100}%"></span>
            </div>`).join('')}
        </div>
        <div class="trend-legend"><span class="lg-v">■ 浏览</span><span class="lg-d">■ 下载</span></div>
      `;
      // 操作日志
      document.getElementById('op-logs').innerHTML = logs.length ? `
        <table class="data-table">
          <thead><tr><th>时间</th><th>用户</th><th>操作</th><th>对象</th><th>详情</th></tr></thead>
          <tbody>${logs.map(l => `
            <tr>
              <td>${Utils.fmtDate(l.created_at)}</td>
              <td>${Utils.escape(l.user_name || '')}</td>
              <td>${Utils.escape(l.action)}</td>
              <td>${Utils.escape(l.target_type || '')}${l.target_id ? '#' + l.target_id : ''}</td>
              <td class="td-text">${Utils.escape(l.detail || '')}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty">暂无日志</div>';
    } catch (e) {
      view.innerHTML += `<div class="err-box">${Utils.escape(e.message)}</div>`;
    }
  },

  /* ===================== 管理后台 - 下载明细 ===================== */
  async viewAdminDownloadLogs(view, params) {
    const page     = parseInt(params.page || '1', 10);
    const keyword  = params.keyword  || '';
    const userId   = params.user_id  || '';
    const matId    = params.material_id || '';
    const dateFrom = params.date_from || '';
    const dateTo   = params.date_to   || '';
    const summaryMode = params.summary || '';

    view.innerHTML = `
      <div class="admin-page">
        <div class="admin-head">
          <h2>下载明细</h2>
          <div class="dl-tabs">
            <a class="${!summaryMode ? 'on' : ''}" id="tab-detail">明细列表</a>
            <a class="${summaryMode === 'by_user' ? 'on' : ''}" id="tab-by-user">按人汇总</a>
            <a class="${summaryMode === 'by_mat' ? 'on' : ''}" id="tab-by-mat">按资料汇总</a>
          </div>
        </div>

        ${!summaryMode ? `
          <div class="dl-filters">
            <input id="dl-kw"   placeholder="搜索资料名/用户名" value="${Utils.escape(keyword)}" style="width:200px">
            <input id="dl-from" type="date" value="${Utils.escape(dateFrom)}" title="开始日期">
            <span style="color:var(--gray-400)">至</span>
            <input id="dl-to"   type="date" value="${Utils.escape(dateTo)}" title="结束日期">
            <button id="dl-search-btn" class="btn btn-primary btn-sm">筛选</button>
            <button id="dl-export-btn" class="btn btn-ghost btn-sm">⬇ 导出 CSV</button>
          </div>
          <table class="data-table" id="dl-table">
            <thead><tr>
              <th>下载时间</th><th>用户</th><th>部门</th><th>资料名称</th><th>所属分类</th><th>IP</th>
            </tr></thead>
            <tbody><tr><td colspan="6">加载中…</td></tr></tbody>
          </table>
          <div id="dl-pager"></div>
        ` : `
          <div class="dl-filters">
            <select id="dl-days" style="width:120px">
              <option value="7"  ${params.days === '7'  ? 'selected' : ''}>近 7 天</option>
              <option value="30" ${!params.days || params.days === '30' ? 'selected' : ''}>近 30 天</option>
              <option value="90" ${params.days === '90' ? 'selected' : ''}>近 90 天</option>
              <option value="365" ${params.days === '365' ? 'selected' : ''}>近 1 年</option>
            </select>
            <button id="dl-days-btn" class="btn btn-primary btn-sm">查询</button>
          </div>
          <div id="dl-summary"></div>
        `}
      </div>
    `;

    // tab 切换
    document.getElementById('tab-detail').onclick  = () => Utils.go('/admin/download_logs', { ...params, summary: '', page: 1 });
    document.getElementById('tab-by-user').onclick = () => Utils.go('/admin/download_logs', { ...params, summary: 'by_user', page: 1 });
    document.getElementById('tab-by-mat').onclick  = () => Utils.go('/admin/download_logs', { ...params, summary: 'by_mat',  page: 1 });

    if (!summaryMode) {
      // 明细列表
      const doFilter = () => {
        Utils.go('/admin/download_logs', {
          keyword:     document.getElementById('dl-kw').value.trim(),
          date_from:   document.getElementById('dl-from').value,
          date_to:     document.getElementById('dl-to').value,
          page: 1,
        });
      };
      document.getElementById('dl-search-btn').onclick = doFilter;
      document.getElementById('dl-kw').onkeydown = e => { if (e.key === 'Enter') doFilter(); };

      // 导出 CSV
      document.getElementById('dl-export-btn').onclick = () => {
        const p = new URLSearchParams();
        if (keyword)  p.set('keyword',   keyword);
        if (userId)   p.set('user_id',   userId);
        if (matId)    p.set('material_id', matId);
        if (dateFrom) p.set('date_from', dateFrom);
        if (dateTo)   p.set('date_to',   dateTo);
        p.set('page_size', '10000');
        this.exportDownloadCsv('/api/stats/download_logs?' + p.toString());
      };

      try {
        const r = await API.stats.downloadLogs({ keyword, user_id: userId, material_id: matId, date_from: dateFrom, date_to: dateTo, page, page_size: 30 });
        const tb = document.querySelector('#dl-table tbody');
        if (!r.items.length) {
          tb.innerHTML = '<tr><td colspan="6" class="empty">暂无下载记录</td></tr>';
        } else {
          tb.innerHTML = r.items.map(d => `
            <tr>
              <td>${Utils.fmtDate(d.downloaded_at)}</td>
              <td>
                <a onclick="Utils.go('/admin/download_logs',{user_id:'${d.user_id}'})">${Utils.escape(d.user_name || d.username)}</a>
              </td>
              <td>${Utils.escape(d.department || '-')}</td>
              <td>
                <a onclick="Utils.go('/materials/${d.material_id}')">${Utils.escape(d.material_title)}</a>
              </td>
              <td>${Utils.escape(d.category_name || '-')}</td>
              <td style="color:var(--gray-400);font-size:12px">${Utils.escape(d.ip_address || '-')}</td>
            </tr>`).join('');
        }
        Utils.renderPager(document.getElementById('dl-pager'), r, p => {
          Utils.go('/admin/download_logs', { ...params, page: p });
        });
      } catch (e) {
        document.querySelector('#dl-table tbody').innerHTML = `<tr><td colspan="6" class="err-box">${Utils.escape(e.message)}</td></tr>`;
      }

    } else {
      // 汇总视图
      const days = params.days || '30';
      document.getElementById('dl-days').value = days;
      document.getElementById('dl-days-btn').onclick = () => {
        Utils.go('/admin/download_logs', { ...params, days: document.getElementById('dl-days').value });
      };

      try {
        const mode = summaryMode === 'by_user' ? 'by_user' : 'by_material';
        const rows = await API.stats.downloadSummary({ mode, days, limit: 50 });
        const box  = document.getElementById('dl-summary');

        if (!rows.length) { box.innerHTML = '<div class="empty">暂无数据</div>'; return; }

        if (mode === 'by_user') {
          box.innerHTML = `
            <table class="data-table">
              <thead><tr><th>#</th><th>用户</th><th>部门</th><th>下载次数</th><th>不同资料数</th><th>最近下载</th><th>操作</th></tr></thead>
              <tbody>
                ${rows.map((u, i) => `
                  <tr>
                    <td style="color:var(--gray-400)">${i + 1}</td>
                    <td>${Utils.escape(u.real_name || u.username)}</td>
                    <td>${Utils.escape(u.department || '-')}</td>
                    <td><strong>${u.download_count}</strong></td>
                    <td>${u.unique_materials}</td>
                    <td>${Utils.fmtDate(u.last_download_at, false)}</td>
                    <td class="row-act"><a onclick="Utils.go('/admin/download_logs',{user_id:'${u.id}'})">查看明细</a></td>
                  </tr>`).join('')}
              </tbody>
            </table>`;
        } else {
          box.innerHTML = `
            <table class="data-table">
              <thead><tr><th>#</th><th>资料名称</th><th>分类</th><th>下载次数</th><th>下载人数</th><th>最近下载</th><th>操作</th></tr></thead>
              <tbody>
                ${rows.map((m, i) => `
                  <tr>
                    <td style="color:var(--gray-400)">${i + 1}</td>
                    <td><a onclick="Utils.go('/materials/${m.id}')">${Utils.escape(m.title)}</a></td>
                    <td>${Utils.escape(m.category_name || '-')}</td>
                    <td><strong>${m.download_count}</strong></td>
                    <td>${m.unique_users}</td>
                    <td>${Utils.fmtDate(m.last_download_at, false)}</td>
                    <td class="row-act"><a onclick="Utils.go('/admin/download_logs',{material_id:'${m.id}'})">查看明细</a></td>
                  </tr>`).join('')}
              </tbody>
            </table>`;
        }
      } catch (e) {
        document.getElementById('dl-summary').innerHTML = `<div class="err-box">${Utils.escape(e.message)}</div>`;
      }
    }
  },

  exportDownloadCsv(apiUrl) {
    // 通过 fetch 拿到数据再客户端生成 CSV
    fetch(apiUrl, { credentials: 'same-origin' })
      .then(r => r.json())
      .then(json => {
        if (json.code !== 0) { Utils.toast('导出失败: ' + json.msg, 'err'); return; }
        const items = json.data.items || [];
        if (!items.length) { Utils.toast('暂无数据可导出', 'warn'); return; }
        const header = ['下载时间', '用户名', '姓名', '部门', '资料ID', '资料名称', '分类', 'IP'];
        const rows = items.map(d => [
          d.downloaded_at, d.username, d.user_name || '', d.department || '',
          d.material_id, d.material_title, d.category_name || '', d.ip_address || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        const csv = '\uFEFF' + [header.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = '下载明细_' + new Date().toISOString().slice(0,10) + '.csv';
        a.click(); URL.revokeObjectURL(url);
        Utils.toast('导出成功', 'ok');
      })
      .catch(e => Utils.toast('导出失败: ' + e.message, 'err'));
  },

    /* ===================== 管理后台 - 用户（超管） ===================== */
  async viewAdminUsers(view) {
    view.innerHTML = `
      <div class="admin-page">
        <div class="admin-head">
          <h2>用户管理</h2>
          <button class="btn btn-primary btn-sm" id="user-new">+ 新增用户</button>
        </div>
        <table class="data-table">
          <thead><tr><th>账号</th><th>姓名</th><th>角色</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody id="user-tbody"><tr><td colspan="6">加载中…</td></tr></tbody>
        </table>
      </div>
    `;
    document.getElementById('user-new').onclick = () => this.openUserEdit({});
    this.renderUserTbody();
  },

  async renderUserTbody() {
    const r = await API.users.list();
    const list = r.items || r;
    const tb = document.getElementById('user-tbody');
    if (!list.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">暂无</td></tr>'; return; }
    tb.innerHTML = list.map(u => `
      <tr>
        <td>${Utils.escape(u.username)}</td>
        <td>${Utils.escape(u.real_name || '')}</td>
        <td>${this.roleLabel(u.role)}</td>
        <td><span class="badge badge-${u.status ? 'published' : 'gray'}">${u.status ? '启用' : '停用'}</span></td>
        <td>${Utils.fmtDate(u.created_at, false)}</td>
        <td class="row-act">
          <a data-act="edit" data-id="${u.id}">编辑</a>
          <a data-act="reset" data-id="${u.id}">重置密码</a>
          <a data-act="toggle" data-id="${u.id}">${u.status ? '停用' : '启用'}</a>
        </td>
      </tr>`).join('');
    tb.querySelectorAll('a[data-act]').forEach(a => {
      const id = parseInt(a.dataset.id, 10);
      const u = list.find(x => x.id === id);
      a.onclick = async () => {
        const act = a.dataset.act;
        if (act === 'edit') this.openUserEdit(u);
        else if (act === 'reset') {
          if (!await Utils.confirm('确认将密码重置为默认（123456）？')) return;
          await API.users.resetPwd(id);
          Utils.toast('已重置', 'ok');
        } else if (act === 'toggle') {
          await API.users.update(id, { status: u.status ? 0 : 1 });
          this.renderUserTbody();
        }
      };
    });
  },

  openUserEdit(u) {
    const isNew = !u.id;
    const md = Utils.modal({
      title: isNew ? '新增用户' : '编辑用户',
      width: 440,
      body: `
        <form id="ue-form" class="form">
          <div class="form-group"><label>账号 *</label><input name="username" required ${u.id ? 'readonly' : ''} value="${Utils.escape(u.username || '')}"></div>
          <div class="form-group"><label>姓名</label><input name="real_name" value="${Utils.escape(u.real_name || '')}"></div>
          <div class="form-group"><label>角色</label>
            <select name="role">
              <option value="user" ${u.role === 'user' ? 'selected' : ''}>业务用户</option>
              <option value="presales_admin" ${u.role === 'presales_admin' ? 'selected' : ''}>售前管理员</option>
              <option value="super_admin" ${u.role === 'super_admin' ? 'selected' : ''}>超级管理员</option>
            </select>
          </div>
          ${isNew ? '<div class="form-group"><label>初始密码</label><input name="password" minlength="6" placeholder="留空则使用 123456"></div>' : ''}
          <div class="form-err" id="ue-err"></div>
        </form>
      `,
      footer: `<button class="btn btn-ghost" data-act="cancel">取消</button><button class="btn btn-primary" data-act="ok">保存</button>`
    });
    md.el.querySelector('[data-act="cancel"]').onclick = md.close;
    md.el.querySelector('[data-act="ok"]').onclick = async () => {
      const d = Utils.formData(md.el.querySelector('#ue-form'));
      if (!d.username || !d.username.trim()) {
        md.el.querySelector('#ue-err').textContent = '账号不能为空'; return;
      }
      // 密码留空时删除字段，后端使用默认密码 123456
      if (isNew && (!d.password || !d.password.trim())) {
        delete d.password;
      }
      try {
        if (isNew) await API.users.create(d);
        else await API.users.update(u.id, { real_name: d.real_name, role: d.role });
        Utils.toast('已保存', 'ok'); md.close(); this.renderUserTbody();
      } catch (e) { md.el.querySelector('#ue-err').textContent = e.message; }
    };
  },
  /* ===== 标签选择器（上传/编辑弹窗内用） ===== */
  async renderTagPicker(container, picked) {
    if (!container) return;
    try {
      if (!this.tagsCache) this.tagsCache = await API.tags.list().catch(() => []);
      const tags = this.tagsCache || [];
      const byDim = {};
      tags.forEach(t => { const d = t.dimension || 'other'; (byDim[d] = byDim[d] || []).push(t); });
      const dimLabel = { product: '产品', industry: '行业', format: '格式', status: '状态', scene: '场景', other: '其他' };
      const pickedSet = new Set((picked || []).map(String));
      container.innerHTML = Object.keys(byDim).map(d => `
        <div class="tp-dim">
          <div class="tp-dim-label">${dimLabel[d] || d}</div>
          <div class="tp-tags">
            ${byDim[d].map(t =>
              `<span class="tag ${Utils.tagClass(t.dimension)} ${pickedSet.has(String(t.id)) ? 'on' : ''}" data-tid="${t.id}">${Utils.escape(t.name)}</span>`
            ).join('')}
          </div>
        </div>
      `).join('') || '<span style="color:#999;font-size:12px">暂无标签</span>';
      container.querySelectorAll('.tag').forEach(el => {
        el.onclick = () => el.classList.toggle('on');
      });
    } catch (e) {
      if (container) container.innerHTML = '<span style="color:#999;font-size:12px">标签加载失败</span>';
    }
  },

  collectPickedTags(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll('.tag.on'))
      .map(el => parseInt(el.dataset.tid, 10))
      .filter(n => !isNaN(n));
  },


});

/* ===================== 启动 ===================== */
document.addEventListener('DOMContentLoaded', () => App.init());
