"""个人中心：浏览/下载历史、收藏、反馈"""
from flask import Blueprint, request, session
from .db import query_one, query_all, execute
from .utils import ok, err, log_op
from .auth import login_required, admin_required

bp = Blueprint('me', __name__, url_prefix='/api/me')


# ── 浏览历史 ─────────────────────────────────────────
@bp.get('/views')
@login_required
def my_views():
    limit = min(int(request.args.get('limit', 50)), 200)
    rows = query_all(
        '''SELECT v.id, v.viewed_at, m.id AS material_id, m.title, c.name AS category_name
           FROM view_logs v
           JOIN materials m ON m.id = v.material_id
           JOIN categories c ON c.id = m.category_id
           WHERE v.user_id = ?
           ORDER BY v.viewed_at DESC
           LIMIT ?''',
        (session['user_id'], limit)
    )
    return ok(rows)


# ── 下载历史 ─────────────────────────────────────────
@bp.get('/downloads')
@login_required
def my_downloads():
    limit = min(int(request.args.get('limit', 50)), 200)
    rows = query_all(
        '''SELECT d.id, d.downloaded_at, d.file_id,
                  m.id AS material_id, m.title,
                  c.name AS category_name,
                  f.original_name, f.extension
           FROM download_logs d
           JOIN materials m ON m.id = d.material_id
           JOIN categories c ON c.id = m.category_id
           LEFT JOIN material_files f ON f.id = d.file_id
           WHERE d.user_id = ?
           ORDER BY d.downloaded_at DESC
           LIMIT ?''',
        (session['user_id'], limit)
    )
    return ok(rows)


# ── 收藏 ─────────────────────────────────────────────
@bp.get('/favorites')
@login_required
def my_favorites():
    rows = query_all(
        '''SELECT f.created_at,
                  m.id, m.title, m.summary, m.view_count, m.download_count,
                  c.name AS category_name
           FROM favorites f
           JOIN materials m ON m.id = f.material_id
           JOIN categories c ON c.id = m.category_id
           WHERE f.user_id = ? AND m.publish_status = 'online'
           ORDER BY f.created_at DESC''',
        (session['user_id'],)
    )
    return ok(rows)


@bp.post('/favorites/<int:mid>')
@login_required
def add_favorite(mid):
    uid = session['user_id']
    try:
        execute('INSERT INTO favorites (user_id, material_id) VALUES (?, ?)', (uid, mid))
        execute('UPDATE materials SET favorite_count = favorite_count + 1 WHERE id = ?', (mid,))
    except Exception:
        # 已存在
        return ok({'already': True})
    return ok()


@bp.delete('/favorites/<int:mid>')
@login_required
def remove_favorite(mid):
    uid = session['user_id']
    cur = execute('DELETE FROM favorites WHERE user_id = ? AND material_id = ?', (uid, mid))
    if cur:
        execute('UPDATE materials SET favorite_count = MAX(0, favorite_count - 1) WHERE id = ?', (mid,))
    return ok()


# ── 反馈 ─────────────────────────────────────────────
@bp.post('/feedbacks')
@login_required
def submit_feedback():
    data = request.get_json() or {}
    content = (data.get('content') or '').strip()
    fb_type = data.get('type', 'other')
    if not content:
        return err('反馈内容不能为空')
    if fb_type not in ('missing', 'error', 'suggestion', 'other'):
        fb_type = 'other'
    fid = execute(
        '''INSERT INTO feedbacks (user_id, material_id, type, content, status)
           VALUES (?, ?, ?, ?, 'open')''',
        (session['user_id'], data.get('material_id'), fb_type, content)
    )
    return ok({'id': fid})


@bp.get('/feedbacks')
@login_required
def my_feedbacks():
    rows = query_all(
        '''SELECT f.*, m.title AS material_title, hu.real_name AS handler_name
           FROM feedbacks f
           LEFT JOIN materials m ON m.id = f.material_id
           LEFT JOIN users hu ON hu.id = f.handled_by
           WHERE f.user_id = ?
           ORDER BY f.created_at DESC''',
        (session['user_id'],)
    )
    return ok(rows)


# 管理员侧
admin_bp = Blueprint('feedback_admin', __name__, url_prefix='/api/feedbacks')


@admin_bp.get('')
@admin_required
def list_all_feedbacks():
    status = request.args.get('status', '').strip()
    where = []
    params = []
    if status:
        where.append('f.status = ?')
        params.append(status)
    where_sql = 'WHERE ' + ' AND '.join(where) if where else ''
    rows = query_all(
        f'''SELECT f.*, u.real_name AS user_name, u.department,
                   m.title AS material_title,
                   hu.real_name AS handler_name
            FROM feedbacks f
            JOIN users u ON u.id = f.user_id
            LEFT JOIN materials m ON m.id = f.material_id
            LEFT JOIN users hu ON hu.id = f.handled_by
            {where_sql}
            ORDER BY f.status ASC, f.created_at DESC
            LIMIT 500''',
        params
    )
    return ok(rows)


@admin_bp.put('/<int:fid>')
@admin_required
def handle_feedback(fid):
    data = request.get_json() or {}
    status = data.get('status', 'processing')
    remark = data.get('handle_remark', '')
    if status not in ('open', 'processing', 'closed'):
        return err('status 非法')
    execute(
        '''UPDATE feedbacks SET status = ?, handle_remark = ?,
                                handled_by = ?, handled_at = CURRENT_TIMESTAMP
           WHERE id = ?''',
        (status, remark, session['user_id'], fid)
    )
    log_op(session['user_id'], 'feedback_handle', 'feedback', fid, {'status': status})
    return ok()
