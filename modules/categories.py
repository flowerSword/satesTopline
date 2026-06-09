"""分类管理（三级树）"""
from flask import Blueprint, request
from .db import query_one, query_all, execute
from .utils import ok, err, log_op
from .auth import admin_required, login_required

bp = Blueprint('categories', __name__, url_prefix='/api/categories')


@bp.get('/tree')
@login_required
def get_tree():
    """返回完整三级分类树"""
    rows = query_all(
        '''SELECT id, parent_id, name, code, level, icon, sort_order,
                  is_builtin, is_locked, status
           FROM categories WHERE status = 1
           ORDER BY level, sort_order, id'''
    )

    # 构造 id -> node 字典
    by_id = {r['id']: {**r, 'children': []} for r in rows}
    roots = []
    for r in rows:
        if r['parent_id'] is None:
            roots.append(by_id[r['id']])
        else:
            parent = by_id.get(r['parent_id'])
            if parent:
                parent['children'].append(by_id[r['id']])
    return ok(roots)


@bp.get('/top')
@login_required
def top_categories():
    """首页一级导航（仅一级分类，按 sort_order）"""
    rows = query_all(
        '''SELECT id, name, code, icon, sort_order FROM categories
           WHERE parent_id IS NULL AND status = 1
           ORDER BY sort_order, id'''
    )
    return ok(rows)


@bp.get('/<int:cid>/children')
@login_required
def get_children(cid):
    rows = query_all(
        '''SELECT id, parent_id, name, code, level, sort_order, is_locked
           FROM categories WHERE parent_id = ? AND status = 1
           ORDER BY sort_order, id''',
        (cid,)
    )
    return ok(rows)


@bp.post('')
@admin_required
def create_category():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    parent_id = data.get('parent_id')
    if not name:
        return err('分类名称必填')

    # 计算 level
    if parent_id is None:
        # 售前管理员不能新建一级分类
        from flask import session
        if session.get('role') != 'super_admin':
            return err('仅超管可新建一级分类', 403)
        level = 1
    else:
        parent = query_one('SELECT level FROM categories WHERE id = ?', (parent_id,))
        if not parent:
            return err('父分类不存在')
        level = parent['level'] + 1
        if level > 3:
            return err('分类层级最多 3 级')

    cid = execute(
        '''INSERT INTO categories (parent_id, name, level, sort_order, status, is_builtin, is_locked)
           VALUES (?, ?, ?, ?, 1, 0, 0)''',
        (parent_id, name, level, data.get('sort_order', 99))
    )
    log_op(0, 'category_create', 'category', cid, {'name': name, 'level': level})
    return ok({'id': cid})


@bp.put('/<int:cid>')
@admin_required
def update_category(cid):
    cat = query_one('SELECT * FROM categories WHERE id = ?', (cid,))
    if not cat:
        return err('分类不存在', 404)
    if cat['is_builtin']:
        return err('一级内置分类不可修改')

    data = request.get_json() or {}
    fields = []
    params = []
    for k in ('name', 'sort_order', 'icon', 'status'):
        if k in data:
            fields.append(f'{k} = ?')
            params.append(data[k])
    if not fields:
        return err('无更新内容')
    params.append(cid)
    execute(f'UPDATE categories SET {", ".join(fields)} WHERE id = ?', params)
    log_op(0, 'category_update', 'category', cid, data)
    return ok()


@bp.delete('/<int:cid>')
@admin_required
def delete_category(cid):
    cat = query_one('SELECT * FROM categories WHERE id = ?', (cid,))
    if not cat:
        return err('分类不存在', 404)
    if cat['is_builtin']:
        return err('一级内置分类不可删除')
    if cat['is_locked']:
        return err('内置二级分类不可删除')

    # 检查是否有子分类或资料
    has_child = query_one('SELECT COUNT(*) AS c FROM categories WHERE parent_id = ?', (cid,))['c']
    has_mat = query_one('SELECT COUNT(*) AS c FROM materials WHERE category_id = ?', (cid,))['c']
    if has_child > 0 or has_mat > 0:
        return err(f'存在 {has_child} 个子分类、{has_mat} 份资料，无法删除')

    execute('DELETE FROM categories WHERE id = ?', (cid,))
    log_op(0, 'category_delete', 'category', cid)
    return ok()
