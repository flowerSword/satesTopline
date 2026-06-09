"""
资料管理（核心模块）
功能：
- 列表（支持多维度筛选、关键词搜索、排序）
- 详情（含版本、标签、相关推荐）
- 上传（多文件、带审核）
- 审核 / 编辑 / 上下架 / 归档 / 删除
- 版本迭代
- 置顶推荐
- 批量操作
"""
import json
from flask import Blueprint, request, session
from .db import query_one, query_all, execute, transaction
from .utils import ok, err, log_op, is_admin
from .auth import login_required, admin_required

bp = Blueprint('materials', __name__, url_prefix='/api/materials')


# ── 通用查询：拼装列表 SQL ─────────────────────────────
def _build_list_query(filters: dict, for_user: bool = True):
    """
    构建资料列表查询的 WHERE 子句与参数
    for_user=True 时，只返回 online + approved 的资料；管理员可看全部
    """
    where = []
    params = []

    if for_user:
        where.append("m.publish_status = 'online'")
        where.append("m.audit_status = 'approved'")
    else:
        if filters.get('publish_status'):
            where.append('m.publish_status = ?')
            params.append(filters['publish_status'])
        if filters.get('audit_status'):
            where.append('m.audit_status = ?')
            params.append(filters['audit_status'])

    # 分类筛选：支持一级/二级/三级，递归向下
    cat_id = filters.get('category_id')
    if cat_id:
        # 简化处理：同时匹配该分类的所有子孙分类
        where.append('''m.category_id IN (
            WITH RECURSIVE sub(id) AS (
                SELECT ? UNION ALL SELECT c.id FROM categories c JOIN sub ON c.parent_id = sub.id
            )
            SELECT id FROM sub
        )''')
        params.append(int(cat_id))

    # 标签筛选（AND 关系：必须同时含有所有指定标签）
    tag_ids = filters.get('tag_ids') or []
    if tag_ids:
        placeholders = ','.join(['?'] * len(tag_ids))
        where.append(f'''m.id IN (
            SELECT material_id FROM material_tags
            WHERE tag_id IN ({placeholders})
            GROUP BY material_id HAVING COUNT(*) = ?
        )''')
        params.extend(tag_ids)
        params.append(len(tag_ids))

    # 关键词搜索（标题 + 简介）
    kw = (filters.get('keyword') or '').strip()
    if kw:
        where.append('(m.title LIKE ? OR m.summary LIKE ?)')
        params.extend([f'%{kw}%', f'%{kw}%'])

    # 文件格式
    ext = (filters.get('extension') or '').strip().lower()
    if ext:
        where.append('''m.id IN (
            SELECT mv.material_id FROM material_versions mv
            JOIN material_files f ON f.id = mv.file_id
            WHERE mv.is_current = 1 AND f.extension = ?
        )''')
        params.append(ext)

    # 时间区间
    if filters.get('start_date'):
        where.append('m.created_at >= ?')
        params.append(filters['start_date'])
    if filters.get('end_date'):
        where.append('m.created_at <= ?')
        params.append(filters['end_date'])

    where_sql = 'WHERE ' + ' AND '.join(where) if where else ''
    return where_sql, params


@bp.get('')
@login_required
def list_materials():
    """资料列表（用户视角，仅可见已发布）"""
    filters = {
        'category_id': request.args.get('category_id'),
        'tag_ids': request.args.getlist('tag_id', type=int),
        'keyword': request.args.get('keyword'),
        'extension': request.args.get('extension'),
        'start_date': request.args.get('start_date'),
        'end_date': request.args.get('end_date'),
    }
    sort_by = request.args.get('sort', 'created_at')  # created_at / views / downloads / favorites
    page = max(int(request.args.get('page', 1)), 1)
    page_size = min(int(request.args.get('page_size', 20)), 100)

    where_sql, params = _build_list_query(filters, for_user=True)

    # 排序白名单
    sort_map = {
        'created_at': 'm.created_at DESC',
        'views': 'm.view_count DESC',
        'downloads': 'm.download_count DESC',
        'favorites': 'm.favorite_count DESC',
        'pinned': 'm.is_pinned DESC, m.pinned_at DESC, m.created_at DESC',
    }
    order_by = sort_map.get(sort_by, 'm.created_at DESC')

    total = query_one(f'SELECT COUNT(*) AS c FROM materials m {where_sql}', params)['c']

    rows = query_all(
        f'''SELECT m.id, m.title, m.summary, m.cover_url, m.is_pinned,
                   m.view_count, m.download_count, m.favorite_count,
                   m.created_at, m.updated_at,
                   c.name AS category_name, c.id AS category_id,
                   u.real_name AS creator_name,
                   mv.version_no AS current_version,
                   mf.extension, mf.file_size, mf.original_name
            FROM materials m
            JOIN categories c ON c.id = m.category_id
            JOIN users u ON u.id = m.created_by
            LEFT JOIN material_versions mv ON mv.id = m.current_version_id
            LEFT JOIN material_files mf ON mf.id = mv.file_id
            {where_sql}
            ORDER BY {order_by}
            LIMIT ? OFFSET ?''',
        params + [page_size, (page - 1) * page_size]
    )

    # 附加每条资料的标签
    if rows:
        ids = [r['id'] for r in rows]
        placeholders = ','.join(['?'] * len(ids))
        tag_rows = query_all(
            f'''SELECT mt.material_id, t.id, t.name, t.color, t.dimension
                FROM material_tags mt JOIN tags t ON t.id = mt.tag_id
                WHERE mt.material_id IN ({placeholders})''',
            ids
        )
        tags_by_mat = {}
        for tr in tag_rows:
            tags_by_mat.setdefault(tr['material_id'], []).append({
                'id': tr['id'], 'name': tr['name'],
                'color': tr['color'], 'dimension': tr['dimension']
            })
        for r in rows:
            r['tags'] = tags_by_mat.get(r['id'], [])

    return ok({'total': total, 'list': rows, 'page': page, 'page_size': page_size})


@bp.get('/admin')
@admin_required
def list_admin():
    """管理员视角的资料列表（含未审核、已下架）"""
    filters = {
        'category_id': request.args.get('category_id'),
        'tag_ids': request.args.getlist('tag_id', type=int),
        'keyword': request.args.get('keyword'),
        'audit_status': request.args.get('audit_status'),
        'publish_status': request.args.get('publish_status'),
    }
    page = max(int(request.args.get('page', 1)), 1)
    page_size = min(int(request.args.get('page_size', 20)), 100)
    where_sql, params = _build_list_query(filters, for_user=False)
    total = query_one(f'SELECT COUNT(*) AS c FROM materials m {where_sql}', params)['c']

    rows = query_all(
        f'''SELECT m.id, m.title, m.summary, m.audit_status, m.publish_status,
                   m.is_pinned, m.view_count, m.download_count,
                   m.created_at, m.audited_at, m.audit_remark,
                   c.name AS category_name,
                   u.real_name AS creator_name,
                   au.real_name AS auditor_name
            FROM materials m
            JOIN categories c ON c.id = m.category_id
            JOIN users u ON u.id = m.created_by
            LEFT JOIN users au ON au.id = m.audited_by
            {where_sql}
            ORDER BY m.created_at DESC
            LIMIT ? OFFSET ?''',
        params + [page_size, (page - 1) * page_size]
    )
    return ok({'total': total, 'list': rows, 'page': page, 'page_size': page_size})


@bp.get('/<int:mid>')
@login_required
def get_detail(mid):
    """资料详情"""
    mat = query_one(
        '''SELECT m.*, c.name AS category_name,
                  u.real_name AS creator_name,
                  au.real_name AS auditor_name
           FROM materials m
           JOIN categories c ON c.id = m.category_id
           JOIN users u ON u.id = m.created_by
           LEFT JOIN users au ON au.id = m.audited_by
           WHERE m.id = ?''',
        (mid,)
    )
    if not mat:
        return err('资料不存在', 404)

    # 普通用户只能看已发布
    if not is_admin():
        if mat['publish_status'] != 'online' or mat['audit_status'] != 'approved':
            return err('资料不可见', 403)

    # 标签
    mat['tags'] = query_all(
        '''SELECT t.id, t.name, t.color, t.dimension
           FROM material_tags mt JOIN tags t ON t.id = mt.tag_id
           WHERE mt.material_id = ?''',
        (mid,)
    )

    # 版本列表
    mat['versions'] = query_all(
        '''SELECT mv.id, mv.version_no, mv.update_note, mv.is_current, mv.created_at,
                  u.real_name AS uploader_name,
                  f.id AS file_id, f.original_name, f.file_size, f.extension
           FROM material_versions mv
           JOIN material_files f ON f.id = mv.file_id
           JOIN users u ON u.id = mv.created_by
           WHERE mv.material_id = ?
           ORDER BY mv.created_at DESC''',
        (mid,)
    )

    # 当前文件信息
    if mat.get('current_version_id'):
        current_ver = next((v for v in mat['versions'] if v['id'] == mat['current_version_id']), None)
        mat['current_file'] = current_ver

    # 相关推荐（同分类下其他资料，按下载量排序）
    mat['related'] = query_all(
        '''SELECT id, title, view_count, download_count
           FROM materials
           WHERE category_id = ? AND id <> ? AND publish_status = 'online' AND audit_status = 'approved'
           ORDER BY download_count DESC LIMIT 6''',
        (mat['category_id'], mid)
    )

    # 用户是否收藏
    uid = session.get('user_id')
    mat['is_favorited'] = bool(query_one(
        'SELECT 1 FROM favorites WHERE user_id = ? AND material_id = ?', (uid, mid)
    ))

    return ok(mat)


@bp.post('')
@login_required
def create_material():
    """
    创建资料（不含文件，文件单独通过 /api/files/upload 上传后绑定）
    入参：title, summary, category_id, tag_ids[], file_id, version_no, update_note
    """
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    category_id = data.get('category_id')
    file_id = data.get('file_id')
    if not title or not category_id or not file_id:
        return err('标题、分类、文件必填')

    version_no = (data.get('version_no') or 'v1.0').strip()
    summary = data.get('summary', '')
    tag_ids = data.get('tag_ids', [])
    uid = session['user_id']

    with transaction() as db:
        cur = db.execute(
            '''INSERT INTO materials (title, summary, category_id, audit_status, publish_status, created_by)
               VALUES (?, ?, ?, 'pending', 'draft', ?)''',
            (title, summary, category_id, uid)
        )
        mid = cur.lastrowid
        # 创建初始版本
        cur = db.execute(
            '''INSERT INTO material_versions (material_id, version_no, file_id, update_note, is_current, created_by)
               VALUES (?, ?, ?, ?, 1, ?)''',
            (mid, version_no, file_id, data.get('update_note', '初始版本'), uid)
        )
        vid = cur.lastrowid
        db.execute('UPDATE materials SET current_version_id = ? WHERE id = ?', (vid, mid))
        # 绑定标签
        for tid in tag_ids:
            db.execute('INSERT OR IGNORE INTO material_tags (material_id, tag_id) VALUES (?, ?)', (mid, tid))
            db.execute('UPDATE tags SET usage_count = usage_count + 1 WHERE id = ?', (tid,))

    log_op(uid, 'material_create', 'material', mid, {'title': title})
    return ok({'id': mid})


@bp.put('/<int:mid>')
@login_required
def update_material(mid):
    """编辑资料元信息（标题、简介、分类、标签）"""
    mat = query_one('SELECT * FROM materials WHERE id = ?', (mid,))
    if not mat:
        return err('资料不存在', 404)

    data = request.get_json() or {}
    fields = []
    params = []
    for k in ('title', 'summary', 'category_id', 'cover_url', 'visibility'):
        if k in data:
            fields.append(f'{k} = ?')
            params.append(data[k])

    with transaction() as db:
        if fields:
            params.append(mid)
            db.execute(f'UPDATE materials SET {", ".join(fields)} WHERE id = ?', params)

        # 更新标签
        if 'tag_ids' in data:
            old = query_all('SELECT tag_id FROM material_tags WHERE material_id = ?', (mid,))
            old_ids = {r['tag_id'] for r in old}
            new_ids = set(data['tag_ids'])
            # 增加
            for tid in new_ids - old_ids:
                db.execute('INSERT OR IGNORE INTO material_tags (material_id, tag_id) VALUES (?, ?)', (mid, tid))
                db.execute('UPDATE tags SET usage_count = usage_count + 1 WHERE id = ?', (tid,))
            # 删除
            for tid in old_ids - new_ids:
                db.execute('DELETE FROM material_tags WHERE material_id = ? AND tag_id = ?', (mid, tid))
                db.execute('UPDATE tags SET usage_count = MAX(0, usage_count - 1) WHERE id = ?', (tid,))

    log_op(session['user_id'], 'material_update', 'material', mid, data)
    return ok()


@bp.post('/<int:mid>/audit')
@admin_required
def audit_material(mid):
    """审核：approve / reject"""
    data = request.get_json() or {}
    action = data.get('action')
    remark = data.get('remark', '')
    if action not in ('approve', 'reject'):
        return err('action 必须是 approve 或 reject')

    new_audit = 'approved' if action == 'approve' else 'rejected'
    new_publish = 'online' if action == 'approve' else 'draft'

    execute(
        '''UPDATE materials SET audit_status = ?, publish_status = ?,
                                audited_by = ?, audited_at = CURRENT_TIMESTAMP,
                                audit_remark = ?
           WHERE id = ?''',
        (new_audit, new_publish, session['user_id'], remark, mid)
    )
    log_op(session['user_id'], f'material_{action}', 'material', mid, {'remark': remark})

    # Auto-build embedding when approved
    if action == 'approve':
        try:
            from .search import build_embedding
            build_embedding(mid)
        except Exception as e:
            print(f'[WARN] build_embedding failed for material {mid}: {e}')

    return ok()


@bp.post('/<int:mid>/publish')
@admin_required
def publish_action(mid):
    """上架 / 下架 / 归档"""
    data = request.get_json() or {}
    action = data.get('action')  # online / offline / archived
    if action not in ('online', 'offline', 'archived'):
        return err('action 非法')
    execute('UPDATE materials SET publish_status = ? WHERE id = ?', (action, mid))
    log_op(session['user_id'], f'material_{action}', 'material', mid)

    # Auto-build embedding when published online
    if action == 'online':
        try:
            from .search import build_embedding
            build_embedding(mid)
        except Exception as e:
            print(f'[WARN] build_embedding failed for material {mid}: {e}')

    return ok()


@bp.post('/<int:mid>/pin')
@admin_required
def pin_material(mid):
    """置顶 / 取消置顶"""
    data = request.get_json() or {}
    pinned = 1 if data.get('pinned') else 0
    execute(
        'UPDATE materials SET is_pinned = ?, pinned_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?',
        (pinned, pinned, mid)
    )
    log_op(session['user_id'], 'material_pin' if pinned else 'material_unpin', 'material', mid)
    return ok()


@bp.post('/<int:mid>/version')
@login_required
def add_version(mid):
    """新增版本（迭代）"""
    data = request.get_json() or {}
    file_id = data.get('file_id')
    version_no = (data.get('version_no') or '').strip()
    if not file_id or not version_no:
        return err('文件与版本号必填')
    if query_one('SELECT id FROM material_versions WHERE material_id = ? AND version_no = ?', (mid, version_no)):
        return err('该版本号已存在')

    uid = session['user_id']
    with transaction() as db:
        db.execute('UPDATE material_versions SET is_current = 0 WHERE material_id = ?', (mid,))
        cur = db.execute(
            '''INSERT INTO material_versions (material_id, version_no, file_id, update_note, is_current, created_by)
               VALUES (?, ?, ?, ?, 1, ?)''',
            (mid, version_no, file_id, data.get('update_note', ''), uid)
        )
        vid = cur.lastrowid
        db.execute('UPDATE materials SET current_version_id = ? WHERE id = ?', (vid, mid))

    log_op(uid, 'material_new_version', 'material', mid, {'version_no': version_no})
    return ok({'version_id': vid})


@bp.delete('/<int:mid>')
@admin_required
def delete_material(mid):
    """彻底删除（不推荐，建议下架/归档）"""
    execute('DELETE FROM materials WHERE id = ?', (mid,))
    log_op(session['user_id'], 'material_delete', 'material', mid)
    return ok()


@bp.post('/batch')
@admin_required
def batch_op():
    """批量操作：上下架、删除、修改分类、绑定标签"""
    data = request.get_json() or {}
    ids = data.get('ids', [])
    action = data.get('action')
    if not ids or not action:
        return err('参数不完整')

    placeholders = ','.join(['?'] * len(ids))
    if action == 'online':
        execute(f"UPDATE materials SET publish_status = 'online' WHERE id IN ({placeholders})", ids)
    elif action == 'offline':
        execute(f"UPDATE materials SET publish_status = 'offline' WHERE id IN ({placeholders})", ids)
    elif action == 'archive':
        execute(f"UPDATE materials SET publish_status = 'archived' WHERE id IN ({placeholders})", ids)
    elif action == 'delete':
        execute(f'DELETE FROM materials WHERE id IN ({placeholders})', ids)
    elif action == 'change_category':
        new_cat = data.get('category_id')
        if not new_cat:
            return err('缺少新分类')
        execute(f'UPDATE materials SET category_id = ? WHERE id IN ({placeholders})', [new_cat] + ids)
    elif action == 'add_tag':
        tid = data.get('tag_id')
        if not tid:
            return err('缺少标签')
        with transaction() as db:
            for mid in ids:
                db.execute('INSERT OR IGNORE INTO material_tags (material_id, tag_id) VALUES (?, ?)', (mid, tid))
            db.execute('UPDATE tags SET usage_count = usage_count + ? WHERE id = ?', (len(ids), tid))
    else:
        return err('不支持的批量操作')

    log_op(session['user_id'], f'batch_{action}', 'material', None, {'ids': ids, 'count': len(ids)})
    return ok({'affected': len(ids)})


# ── 浏览埋点 ─────────────────────────────────────────
@bp.post('/<int:mid>/view')
@login_required
def record_view(mid):
    """记录浏览（前端进入详情页时调用）"""
    uid = session['user_id']
    execute('INSERT INTO view_logs (user_id, material_id) VALUES (?, ?)', (uid, mid))
    execute('UPDATE materials SET view_count = view_count + 1 WHERE id = ?', (mid,))
    return ok()
