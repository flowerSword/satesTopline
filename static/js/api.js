/* ============================================================
   售前头条 - API 封装
   - 统一请求 / 错误处理 / 401 触发登出事件
   - 密码登录前 SHA-256 一次（避免明文传输）
   ============================================================ */

(function (global) {
  'use strict';

  async function sha256(text) {
    if (global.crypto && global.crypto.subtle) {
      const buf = new TextEncoder().encode(text);
      const h = await global.crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('当前浏览器不支持加密接口');
  }

  function qs(params) {
    const s = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === '') return;
      if (typeof v === 'boolean') s.append(k, v ? '1' : '0');
      else if (Array.isArray(v)) v.forEach(x => s.append(k, x));
      else s.append(k, v);
    });
    const str = s.toString();
    return str ? '?' + str : '';
  }

  async function request(url, options = {}) {
    const opts = Object.assign({
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    }, options);
    if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
      opts.body = JSON.stringify(opts.body);
    }
    if (opts.body instanceof FormData) delete opts.headers['Content-Type'];
    let resp;
    try { resp = await fetch(url, opts); }
    catch (e) { throw new Error('网络异常: ' + e.message); }
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      if (resp.ok) return resp;
      throw new Error(`HTTP ${resp.status}`);
    }
    const json = await resp.json();
    if (json.code === 0) return json.data;
    if (resp.status === 401) {
      global.dispatchEvent(new CustomEvent('app:logout'));
      throw new Error(json.msg || '未登录');
    }
    throw new Error(json.msg || `请求失败 (${resp.status})`);
  }


  // 把分页结果统一为 { items, page, page_size, total }
  function _normPage(d) {
    if (!d) return { items: [], page: 1, page_size: 20, total: 0 };
    if (Array.isArray(d)) return { items: d, page: 1, page_size: d.length, total: d.length };
    if (d.list && !d.items) return { items: d.list, page: d.page || 1, page_size: d.page_size || 20, total: d.total || d.list.length };
    return d;
  }
  async function rpage(url, options) {
    const d = await request(url, options);
    return _normPage(d);
  }

  const API = {
    /* ---------- 认证 ---------- */
    auth: {
      login: async (username, password) => {
        const h = await sha256(password);
        return request('/api/auth/login', { method: 'POST', body: { username, password: h } });
      },
      logout: () => request('/api/auth/logout', { method: 'POST' }),
      me: () => request('/api/auth/me'),
      changePwd: async (oldPwd, newPwd) => {
        const o = await sha256(oldPwd);
        const n = await sha256(newPwd);
        return request('/api/auth/change_password', { method: 'POST', body: { old_password: o, new_password: n } });
      },
    },

    /* ---------- 用户（超管） ---------- */
    users: {
      list: (params) => rpage('/api/users' + qs(params)),
      create: async (data) => {
        const body = { ...data };
        if (body.password) body.password = await sha256(body.password);
        return request('/api/users', { method: 'POST', body });
      },
      update: (id, data) => request('/api/users/' + id, { method: 'PUT', body: data }),
      resetPwd: async (id, password) => {
        const body = password ? { password: await sha256(password) } : {};
        return request('/api/users/' + id + '/reset_password', { method: 'POST', body });
      },
      disable: (id) => request('/api/users/' + id, { method: 'DELETE' }),
    },

    /* ---------- 分类 ---------- */
    cats: {
      list: () => request('/api/categories/tree'),
      tree: () => request('/api/categories/tree'),
      top: () => request('/api/categories/top'),
      children: (id) => request('/api/categories/' + id + '/children'),
      create: (data) => request('/api/categories', { method: 'POST', body: data }),
      update: (id, data) => request('/api/categories/' + id, { method: 'PUT', body: data }),
      delete: (id) => request('/api/categories/' + id, { method: 'DELETE' }),
    },

    /* ---------- 标签 ---------- */
    tags: {
      list: (dim) => request('/api/tags' + (dim ? qs({ dimension: dim }) : '')).then(d => Array.isArray(d) ? d : (d.list || [])),
      create: (data) => request('/api/tags', { method: 'POST', body: data }),
      update: (id, data) => request('/api/tags/' + id, { method: 'PUT', body: data }),
      delete: (id) => request('/api/tags/' + id, { method: 'DELETE' }),
      merge: (to_id, from_ids) => request('/api/tags/merge', { method: 'POST', body: { to_id, from_ids } }),
    },

    /* ---------- 资料 ---------- */
    materials: {
      list: (params) => {
        // params.admin=true 时走 /admin
        if (params && params.admin) {
          const p = { ...params }; delete p.admin;
          return rpage('/api/materials/admin' + qs(p));
        }
        return rpage('/api/materials' + qs(params));
      },
      detail: (id) => request('/api/materials/' + id),
      create: (data) => request('/api/materials', { method: 'POST', body: data }),
      update: (id, data) => request('/api/materials/' + id, { method: 'PUT', body: data }),
      delete: (id) => request('/api/materials/' + id, { method: 'DELETE' }),
      // 审核
      approve: (id, remark) => request('/api/materials/' + id + '/audit', { method: 'POST', body: { action: 'approve', remark } }),
      reject: (id, remark) => request('/api/materials/' + id + '/audit', { method: 'POST', body: { action: 'reject', remark } }),
      // 发布状态
      offline: (id) => request('/api/materials/' + id + '/publish', { method: 'POST', body: { action: 'offline' } }),
      republish: (id) => request('/api/materials/' + id + '/publish', { method: 'POST', body: { action: 'republish' } }),
      archive: (id) => request('/api/materials/' + id + '/publish', { method: 'POST', body: { action: 'archive' } }),
      pin: (id, pinned) => request('/api/materials/' + id + '/pin', { method: 'POST', body: pinned === undefined ? {} : { pinned } }),
      newVersion: (id, data) => request('/api/materials/' + id + '/version', { method: 'POST', body: data }),
      batch: (data) => request('/api/materials/batch', { method: 'POST', body: data }),
      viewPing: (id) => request('/api/materials/' + id + '/view', { method: 'POST' }),
      // 收藏 → 后端在 /api/me/favorites/<mid>
      favorite: (mid) => request('/api/me/favorites/' + mid, { method: 'POST' }),
      unfavorite: (mid) => request('/api/me/favorites/' + mid, { method: 'DELETE' }),
    },

    /* ---------- 文件 ---------- */
    files: {
      upload: (fd) => request('/api/files/upload', { method: 'POST', body: fd }),
      downloadUrl: (id) => '/api/files/' + id + '/download',
      previewUrl: (id) => '/api/files/' + id + '/preview',
      info: (id) => request('/api/files/' + id + '/info'),
    },

    /* ---------- 搜索 ---------- */
    search: {
      // 统一封装：mode='semantic' 走语义；'keyword' 走关键词
      search: ({ q, mode = 'semantic', limit = 30 }) => {
        const _norm = d => ({ items: d.list || d.items || [], mode: d.mode || mode });
        if (mode === 'keyword') return request('/api/search/keyword' + qs({ q, limit })).then(_norm);
        return request('/api/search/semantic', { method: 'POST', body: { q, top_k: limit } }).then(_norm);
      },
      keyword: (q, limit) => request('/api/search/keyword' + qs({ q, limit })),
      semantic: (q, top_k) => request('/api/search/semantic', { method: 'POST', body: { q, top_k } }),
      rebuildIndex: () => request('/api/search/rebuild_index', { method: 'POST' }),
    },

    /* ---------- 运营 ---------- */
    ops: {
      anns: (params) => {
        // active=true 取生效中，否则取全部（管理用）
        if (params && params.active) return request('/api/ops/announcements');
        return request('/api/ops/announcements/all');
      },
      annCreate: (data) => request('/api/ops/announcements', { method: 'POST', body: data }),
      annUpdate: (id, data) => request('/api/ops/announcements/' + id, { method: 'PUT', body: data }),
      annDelete: (id) => request('/api/ops/announcements/' + id, { method: 'DELETE' }),
      recsHome: (params) => request('/api/ops/recommendations' + qs({ slot: 'home', ...(params || {}) })),
      recCreate: (data) => request('/api/ops/recommendations', { method: 'POST', body: data }),
      recDelete: (id) => request('/api/ops/recommendations/' + id, { method: 'DELETE' }),
      hot: (params) => request('/api/ops/hot' + qs(params)),
      recent: (params) => request('/api/ops/latest' + qs(params)),
    },

    /* ---------- 个人中心 ---------- */
    me: {
      views: (params) => rpage('/api/me/views' + qs(params)),
      downloads: (params) => rpage('/api/me/downloads' + qs(params)),
      favorites: (params) => rpage('/api/me/favorites' + qs(params)),
      addFav: (mid) => request('/api/me/favorites/' + mid, { method: 'POST' }),
      delFav: (mid) => request('/api/me/favorites/' + mid, { method: 'DELETE' }),
      feedbacks: (params) => rpage('/api/me/feedbacks' + qs(params)),
    },

    /* ---------- 反馈 ---------- */
    feedbacks: {
      create: (data) => request('/api/me/feedbacks', { method: 'POST', body: data }),
      adminList: (params) => rpage('/api/feedbacks' + qs(params)),
      adminReply: (id, data) => request('/api/feedbacks/' + id, { method: 'PUT', body: data }),
    },

    /* ---------- 统计 ---------- */
    stats: {
      overview: () => request('/api/stats/dashboard'),
      trend: (params) => request('/api/stats/trend' + qs(params)),
      byCategory: () => request('/api/stats/by_category'),
      topMaterials: (params) => request('/api/stats/top_materials' + qs(params)),
      activeUsers: (params) => request('/api/stats/active_users' + qs(params)),
      opLogs: (params) => request('/api/stats/operation_logs' + qs(params)),
      downloadLogs: (params) => rpage('/api/stats/download_logs' + qs(params)),
      downloadSummary: (params) => request('/api/stats/download_summary' + qs(params)),
    },
  };

  global.API = API;
  global.sha256 = sha256;
})(window);
