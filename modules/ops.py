"""运营推广：公告、推荐、热门榜单、最新动态"""
from flask import Blueprint, request, session
from .db import query_one, query_all, execute
from .utils import ok, err, log_op
from .auth import login_required, admin_required

bp = Blueprint('ops', __name__, url_prefix='/api/ops')


# ── 公告 ─────────────────────────────────────────────
@bp.get('/announcements')
@login_required
def list_announcements():
    """有效期内的公告（首页轮播 + 弹窗）"""
    rows = query_all(
        '''SELECT id, title, content, type, is_popup, is_carousel, target_url, sort_order, created_at
           FROM announcements
           WHERE status = 1
             AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
             AND (ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP)
           ORDER BY sort_order DESC, created_at DESC
           LIMIT 20'''
    )
    return ok(rows)


@bp.get('/announcements/all')
@admin_required
def list_announcements_all():
    rows = query_all(
        '''SELECT a.*, u.real_name AS creator_name
           FROM announcements a JOIN users u ON u.id = a.created_by
           ORDER BY a.created_at DESC LIMIT 200'''
    )
    return ok(rows)


@bp.post('/announcements')
@admin_required
def create_announcement():
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    content = (data.get('content') or '').strip()
    if not title or not content:
        return err('标题与内容必填')
    aid = execute(
        '''INSERT INTO announcements (title, content, type, is_popup, is_carousel,
                                       target_url, sort_order, status, starts_at, ends_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)''',
        (title, content,
         data.get('type', 'notice'),
         int(data.get('is_popup', 0)),
         int(data.get('is_carousel', 1)),
         data.get('target_url'),
         int(data.get('sort_order', 0)),
         data.get('starts_at'), data.get('ends_at'),
         session['user_id'])
    )
    log_op(session['user_id'], 'announcement_create', 'announcement', aid, {'title': title})
    return ok({'id': aid})


@bp.put('/announcements/<int:aid>')
@admin_required
def update_announcement(aid):
    data = request.get_json() or {}
    fields = []
    params = []
    for k in ('title', 'content', 'type', 'is_popup', 'is_carousel',
              'target_url', 'sort_order', 'status', 'starts_at', 'ends_at'):
        if k in data:
            fields.append(f'{k} = ?')
            params.append(data[k])
    if not fields:
        return err('无更新内容')
    params.append(aid)
    execute(f'UPDATE announcements SET {", ".join(fields)} WHERE id = ?', params)
    log_op(session['user_id'], 'announcement_update', 'announcement', aid)
    return ok()


@bp.delete('/announcements/<int:aid>')
@admin_required
def delete_announcement(aid):
    execute('DELETE FROM announcements WHERE id = ?', (aid,))
    log_op(session['user_id'], 'announcement_delete', 'announcement', aid)
    return ok()


# ── 首页推荐位 ────────────────────────────────────────
@bp.get('/recommendations')
@login_required
def list_recommendations():
    """首页推荐资料（管理员手动置顶 + 推荐位）"""
    slot = request.args.get('slot', 'home')
    rows = query_all(
        '''SELECT r.id AS rec_id, r.slot, r.sort_order,
                  m.id, m.title, m.summary, m.view_count, m.download_count,
                  c.name AS category_name
           FROM recommendations r
           JOIN materials m ON m.id = r.material_id
           JOIN categories c ON c.id = m.category_id
           WHERE r.slot = ?
             AND m.publish_status = 'online' AND m.audit_status = 'approved'
             AND (r.starts_at IS NULL OR r.starts_at <= CURRENT_TIMESTAMP)
             AND (r.ends_at IS NULL OR r.ends_at >= CURRENT_TIMESTAMP)
           ORDER BY r.sort_order DESC, r.created_at DESC
           LIMIT 12''',
        (slot,)
    )
    return ok(rows)


@bp.post('/recommendations')
@admin_required
def add_recommendation():
    data = request.get_json() or {}
    mid = data.get('material_id')
    if not mid:
        return err('material_id 必填')
    rid = execute(
        '''INSERT INTO recommendations (material_id, slot, sort_order, starts_at, ends_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?)''',
        (mid, data.get('slot', 'home'), int(data.get('sort_order', 0)),
         data.get('starts_at'), data.get('ends_at'), session['user_id'])
    )
    log_op(session['user_id'], 'recommend_add', 'recommendation', rid, {'material_id': mid})
    return ok({'id': rid})


@bp.delete('/recommendations/<int:rid>')
@admin_required
def remove_recommendation(rid):
    execute('DELETE FROM recommendations WHERE id = ?', (rid,))
    log_op(session['user_id'], 'recommend_remove', 'recommendation', rid)
    return ok()


# ── 热门榜单（7 日下载量）─────────────────────────────
@bp.get('/hot')
@login_required
def hot_list():
    """
    7 日热门下载榜（默认）/ 30 日
    入参：days=7|30, category=all|product|solution, limit=15
    """
    days = int(request.args.get('days', 7))
    category = request.args.get('category', 'all')
    limit = min(int(request.args.get('limit', 15)), 50)

    # category 过滤：按一级分类的 code
    cat_filter = ''
    cat_params = []
    if category in ('product', 'solution', 'marketing', 'case', 'bidding', 'training'):
        code_map = {
            'product': 'PRODUCT', 'solution': 'SOLUTION',
            'marketing': 'MARKETING', 'case': 'CASE',
            'bidding': 'BIDDING', 'training': 'TRAINING',
        }
        cat_filter = ''' AND m.category_id IN (
            WITH RECURSIVE sub(id) AS (
                SELECT id FROM categories WHERE code = ?
                UNION ALL SELECT c.id FROM categories c JOIN sub ON c.parent_id = sub.id
            ) SELECT id FROM sub
        )'''
        cat_params.append(code_map[category])

    rows = query_all(
        f'''SELECT m.id, m.title, m.summary, m.view_count, m.download_count,
                   c.name AS category_name,
                   COUNT(dl.id) AS recent_downloads
            FROM materials m
            JOIN categories c ON c.id = m.category_id
            LEFT JOIN download_logs dl
                ON dl.material_id = m.id
                AND dl.downloaded_at >= DATETIME('now', ?)
            WHERE m.publish_status = 'online' AND m.audit_status = 'approved'
              {cat_filter}
            GROUP BY m.id
            ORDER BY recent_downloads DESC, m.download_count DESC
            LIMIT ?''',
        [f'-{days} days'] + cat_params + [limit]
    )
    return ok(rows)


# ── 最新动态（近 30 条更新）────────────────────────────
@bp.get('/latest')
@login_required
def latest_updates():
    rows = query_all(
        '''SELECT m.id, m.title, m.updated_at, m.created_at,
                  c.name AS category_name,
                  mv.version_no
           FROM materials m
           JOIN categories c ON c.id = m.category_id
           LEFT JOIN material_versions mv ON mv.id = m.current_version_id
           WHERE m.publish_status = 'online' AND m.audit_status = 'approved'
           ORDER BY m.updated_at DESC
           LIMIT 30'''
    )
    return ok(rows)
