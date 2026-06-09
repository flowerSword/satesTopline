"""数据统计看板（管理员）"""
from flask import Blueprint, request
from .db import query_one, query_all
from .utils import ok
from .auth import admin_required

bp = Blueprint('stats', __name__, url_prefix='/api/stats')


@bp.get('/dashboard')
@admin_required
def dashboard():
    """首页数据卡片"""
    total_materials = query_one("SELECT COUNT(*) AS c FROM materials WHERE publish_status != 'archived'")['c']
    pending_audit = query_one("SELECT COUNT(*) AS c FROM materials WHERE audit_status = 'pending'")['c']

    # 本月新增 / 下载 / 活跃用户
    new_this_month = query_one(
        "SELECT COUNT(*) AS c FROM materials WHERE created_at >= datetime('now', 'start of month')"
    )['c']
    downloads_this_month = query_one(
        "SELECT COUNT(*) AS c FROM download_logs WHERE downloaded_at >= datetime('now', 'start of month')"
    )['c']
    active_users_this_month = query_one(
        '''SELECT COUNT(DISTINCT user_id) AS c FROM view_logs
           WHERE viewed_at >= datetime('now', 'start of month')'''
    )['c']
    total_users = query_one("SELECT COUNT(*) AS c FROM users WHERE status = 1")['c']

    return ok({
        'total_materials': total_materials,
        'pending_audit': pending_audit,
        'new_this_month': new_this_month,
        'downloads_this_month': downloads_this_month,
        'active_users_this_month': active_users_this_month,
        'total_users': total_users,
    })


@bp.get('/trend')
@admin_required
def trend():
    """近 30 日新增资料与下载量趋势"""
    days = int(request.args.get('days', 30))
    rows_new = query_all(
        f'''SELECT DATE(created_at) AS d, COUNT(*) AS c
            FROM materials
            WHERE created_at >= datetime('now', '-{days} days')
            GROUP BY DATE(created_at)
            ORDER BY d'''
    )
    rows_dl = query_all(
        f'''SELECT DATE(downloaded_at) AS d, COUNT(*) AS c
            FROM download_logs
            WHERE downloaded_at >= datetime('now', '-{days} days')
            GROUP BY DATE(downloaded_at)
            ORDER BY d'''
    )
    return ok({'new_materials': rows_new, 'downloads': rows_dl})


@bp.get('/by_category')
@admin_required
def by_category():
    """按一级分类统计资料数量与下载量"""
    rows = query_all(
        '''SELECT top.id, top.name,
                  COUNT(DISTINCT m.id) AS material_count,
                  COALESCE(SUM(m.download_count), 0) AS download_total,
                  COALESCE(SUM(m.view_count), 0) AS view_total
           FROM categories top
           LEFT JOIN categories sub2 ON sub2.parent_id = top.id
           LEFT JOIN categories sub3 ON sub3.parent_id = sub2.id
           LEFT JOIN materials m ON m.category_id IN (top.id, sub2.id, sub3.id)
                                AND m.publish_status != 'archived'
           WHERE top.parent_id IS NULL
           GROUP BY top.id
           ORDER BY top.sort_order'''
    )
    return ok(rows)


@bp.get('/top_materials')
@admin_required
def top_materials():
    """下载排行 / 浏览排行"""
    metric = request.args.get('metric', 'downloads')
    limit = min(int(request.args.get('limit', 20)), 100)
    order_by = 'download_count' if metric == 'downloads' else 'view_count'
    rows = query_all(
        f'''SELECT m.id, m.title, m.view_count, m.download_count,
                   c.name AS category_name
            FROM materials m JOIN categories c ON c.id = m.category_id
            WHERE m.publish_status = 'online'
            ORDER BY m.{order_by} DESC
            LIMIT ?''',
        (limit,)
    )
    return ok(rows)


@bp.get('/active_users')
@admin_required
def active_users():
    """活跃用户排行（近 30 日下载次数）"""
    rows = query_all(
        '''SELECT u.id, u.real_name, u.department,
                  COUNT(d.id) AS download_count,
                  COUNT(DISTINCT d.material_id) AS unique_materials,
                  MAX(d.downloaded_at) AS last_active
           FROM users u
           JOIN download_logs d ON d.user_id = u.id
           WHERE d.downloaded_at >= datetime('now', '-30 days')
           GROUP BY u.id
           ORDER BY download_count DESC
           LIMIT 30'''
    )
    return ok(rows)


@bp.get('/operation_logs')
@admin_required
def operation_logs():
    """操作日志（最近 200 条）"""
    target_type = request.args.get('target_type', '').strip()
    action = request.args.get('action', '').strip()
    where = []
    params = []
    if target_type:
        where.append('o.target_type = ?')
        params.append(target_type)
    if action:
        where.append('o.action LIKE ?')
        params.append(f'%{action}%')
    where_sql = 'WHERE ' + ' AND '.join(where) if where else ''
    rows = query_all(
        f'''SELECT o.id, o.action, o.target_type, o.target_id, o.detail, o.ip_address, o.created_at,
                   u.real_name AS user_name
            FROM operation_logs o
            JOIN users u ON u.id = o.user_id
            {where_sql}
            ORDER BY o.created_at DESC
            LIMIT 200''',
        params
    )
    return ok(rows)


@bp.get('/download_logs')
@admin_required
def download_logs():
    """下载明细查询（管理员）
    支持按：用户、资料、时间段、分页
    """
    page      = max(1, int(request.args.get('page', 1)))
    page_size = min(int(request.args.get('page_size', 30)), 100)
    user_id   = request.args.get('user_id', '').strip()
    mat_id    = request.args.get('material_id', '').strip()
    keyword   = request.args.get('keyword', '').strip()
    date_from = request.args.get('date_from', '').strip()
    date_to   = request.args.get('date_to', '').strip()

    where, params = [], []

    if user_id:
        where.append('d.user_id = ?')
        params.append(int(user_id))
    if mat_id:
        where.append('d.material_id = ?')
        params.append(int(mat_id))
    if keyword:
        where.append('(m.title LIKE ? OR u.real_name LIKE ? OR u.username LIKE ?)')
        like = f'%{keyword}%'
        params += [like, like, like]
    if date_from:
        where.append('d.downloaded_at >= ?')
        params.append(date_from + ' 00:00:00')
    if date_to:
        where.append('d.downloaded_at <= ?')
        params.append(date_to + ' 23:59:59')

    where_sql = 'WHERE ' + ' AND '.join(where) if where else ''
    offset = (page - 1) * page_size

    total = query_one(
        f'''SELECT COUNT(*) AS c
            FROM download_logs d
            JOIN users u ON u.id = d.user_id
            JOIN materials m ON m.id = d.material_id
            {where_sql}''',
        params
    )['c']

    rows = query_all(
        f'''SELECT
                d.id, d.downloaded_at, d.ip_address,
                u.id   AS user_id,
                u.real_name AS user_name,
                u.username,
                u.department,
                m.id   AS material_id,
                m.title AS material_title,
                c.name  AS category_name
            FROM download_logs d
            JOIN users u     ON u.id = d.user_id
            JOIN materials m ON m.id = d.material_id
            LEFT JOIN categories c ON c.id = m.category_id
            {where_sql}
            ORDER BY d.downloaded_at DESC
            LIMIT ? OFFSET ?''',
        params + [page_size, offset]
    )

    return ok({
        'items': rows,
        'total': total,
        'page': page,
        'page_size': page_size,
    })


@bp.get('/download_summary')
@admin_required
def download_summary():
    """下载汇总：按人 / 按资料 Top 排行"""
    mode  = request.args.get('mode', 'by_user')   # by_user | by_material
    days  = min(int(request.args.get('days', 30)), 365)
    limit = min(int(request.args.get('limit', 20)), 100)

    if mode == 'by_user':
        rows = query_all(
            f'''SELECT
                    u.id, u.real_name, u.username, u.department,
                    COUNT(d.id) AS download_count,
                    COUNT(DISTINCT d.material_id) AS unique_materials,
                    MAX(d.downloaded_at) AS last_download_at
                FROM download_logs d
                JOIN users u ON u.id = d.user_id
                WHERE d.downloaded_at >= datetime('now', '-{days} days')
                GROUP BY u.id
                ORDER BY download_count DESC
                LIMIT ?''',
            (limit,)
        )
    else:
        rows = query_all(
            f'''SELECT
                    m.id, m.title,
                    c.name AS category_name,
                    COUNT(d.id) AS download_count,
                    COUNT(DISTINCT d.user_id) AS unique_users,
                    MAX(d.downloaded_at) AS last_download_at
                FROM download_logs d
                JOIN materials m ON m.id = d.material_id
                LEFT JOIN categories c ON c.id = m.category_id
                WHERE d.downloaded_at >= datetime('now', '-{days} days')
                GROUP BY m.id
                ORDER BY download_count DESC
                LIMIT ?''',
            (limit,)
        )

    return ok(rows)
