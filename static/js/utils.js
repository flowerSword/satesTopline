/* utils.js - 通用工具函数 */

const Utils = {
  /* ===== Toast 提示 ===== */
  toast(msg, type = 'info', duration = 2500) {
    let box = document.getElementById('toast-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toast-box';
      box.className = 'toast-box';
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.classList.add('toast-show'), 10);
    setTimeout(() => {
      el.classList.remove('toast-show');
      setTimeout(() => el.remove(), 300);
    }, duration);
  },

  /* ===== 模态框 ===== */
  modal({ title, body, footer, width = 560, onClose }) {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal-box" style="max-width:${width}px">
        <div class="modal-head">
          <div class="modal-title">${this.escape(title || '')}</div>
          <button class="modal-close" type="button">&times;</button>
        </div>
        <div class="modal-body"></div>
        ${footer ? '<div class="modal-foot"></div>' : ''}
      </div>
    `;
    const close = () => {
      mask.classList.remove('show');
      setTimeout(() => {
        mask.remove();
        onClose && onClose();
      }, 200);
    };
    mask.querySelector('.modal-close').onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };
    const bodyEl = mask.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.appendChild(body);
    if (footer) {
      const footEl = mask.querySelector('.modal-foot');
      if (typeof footer === 'string') footEl.innerHTML = footer;
      else footEl.appendChild(footer);
    }
    document.body.appendChild(mask);
    setTimeout(() => mask.classList.add('show'), 10);
    return { el: mask, close, body: bodyEl };
  },

  /* ===== 确认框 ===== */
  confirm(msg, opts = {}) {
    return new Promise((resolve) => {
      const m = this.modal({
        title: opts.title || '确认',
        body: `<div class="confirm-text">${this.escape(msg)}</div>`,
        footer: `
          <button class="btn btn-ghost" data-act="cancel">取消</button>
          <button class="btn btn-primary" data-act="ok">${opts.okText || '确定'}</button>
        `,
        width: 420
      });
      m.el.querySelector('[data-act="cancel"]').onclick = () => { m.close(); resolve(false); };
      m.el.querySelector('[data-act="ok"]').onclick = () => { m.close(); resolve(true); };
    });
  },

  /* ===== 格式化 ===== */
  fmtDate(s, withTime = true) {
    if (!s) return '';
    const d = new Date(s.replace(' ', 'T') + (s.includes('T') || s.length > 19 ? '' : 'Z'));
    if (isNaN(d.getTime())) return s;
    const pad = (n) => String(n).padStart(2, '0');
    const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (!withTime) return base;
    return `${base} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  fmtRelative(s) {
    if (!s) return '';
    const d = new Date(s.replace(' ', 'T') + (s.includes('T') || s.length > 19 ? '' : 'Z'));
    if (isNaN(d.getTime())) return s;
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
    return this.fmtDate(s, false);
  },

  fmtSize(bytes) {
    if (bytes == null) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0; let v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return v.toFixed(v < 10 && i > 0 ? 2 : 1) + ' ' + units[i];
  },

  escape(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  },

  /* ===== 防抖 / 节流 ===== */
  debounce(fn, wait = 300) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  },

  throttle(fn, wait = 300) {
    let last = 0;
    return function (...args) {
      const now = Date.now();
      if (now - last >= wait) {
        last = now;
        fn.apply(this, args);
      }
    };
  },

  /* ===== URL 参数 ===== */
  parseHash() {
    const h = location.hash.slice(1) || '/';
    const [path, qs] = h.split('?');
    const params = {};
    if (qs) qs.split('&').forEach(p => {
      const [k, v] = p.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return { path, params };
  },

  buildHash(path, params) {
    if (!params || !Object.keys(params).length) return '#' + path;
    const qs = Object.entries(params)
      .filter(([, v]) => v !== '' && v != null)
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
    return '#' + path + (qs ? '?' + qs : '');
  },

  go(path, params) {
    location.hash = this.buildHash(path, params).slice(1);
  },

  /* ===== 文件相关 ===== */
  fileIcon(ext) {
    ext = (ext || '').toLowerCase().replace('.', '');
    const map = {
      pdf: '📕', doc: '📘', docx: '📘',
      xls: '📗', xlsx: '📗', csv: '📗',
      ppt: '📙', pptx: '📙',
      txt: '📄', md: '📄',
      zip: '🗜️', rar: '🗜️', '7z': '🗜️',
      png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️',
      mp4: '🎬', mov: '🎬',
      mp3: '🎵', wav: '🎵',
    };
    return map[ext] || '📎';
  },

  /* ===== 分页器渲染 ===== */
  renderPager(container, { page, page_size, total }, onChange) {
    const pages = Math.max(1, Math.ceil(total / page_size));
    if (pages <= 1) { container.innerHTML = ''; return; }
    const btns = [];
    const push = (p, label = p, disabled = false, active = false) => {
      btns.push(`<button class="pg-btn ${active ? 'active' : ''}" ${disabled ? 'disabled' : ''} data-p="${p}">${label}</button>`);
    };
    push(page - 1, '«', page <= 1);
    const range = [];
    const s = Math.max(1, page - 2);
    const e = Math.min(pages, page + 2);
    if (s > 1) { range.push(1); if (s > 2) range.push('...'); }
    for (let i = s; i <= e; i++) range.push(i);
    if (e < pages) { if (e < pages - 1) range.push('...'); range.push(pages); }
    range.forEach(p => {
      if (p === '...') btns.push(`<span class="pg-dots">…</span>`);
      else push(p, p, false, p === page);
    });
    push(page + 1, '»', page >= pages);
    container.innerHTML = `<div class="pager"><span class="pg-info">共 ${total} 条</span>${btns.join('')}</div>`;
    container.querySelectorAll('.pg-btn').forEach(b => {
      b.onclick = () => {
        const p = parseInt(b.dataset.p, 10);
        if (!isNaN(p) && p >= 1 && p <= pages) onChange(p);
      };
    });
  },

  /* ===== 标签颜色（按维度上色） ===== */
  tagClass(dimension) {
    const map = {
      product: 'tag-blue',
      industry: 'tag-purple',
      format: 'tag-gray',
      status: 'tag-green',
      scene: 'tag-orange',
    };
    return map[dimension] || 'tag-gray';
  },

  /* ===== 表单序列化 ===== */
  formData(form) {
    const data = {};
    form.querySelectorAll('input[name], select[name], textarea[name]').forEach(el => {
      if (el.type === 'checkbox') data[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
      else data[el.name] = el.value;
    });
    return data;
  },

  /* ===== 防止 XSS 的内联渲染 ===== */
  safeHtml(strings, ...values) {
    let out = '';
    strings.forEach((s, i) => {
      out += s;
      if (i < values.length) out += this.escape(values[i]);
    });
    return out;
  },
};
