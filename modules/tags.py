"""标签管理（多维度）"""
from flask import Blueprint, request
from .db import query_one, query_all, execute
from .utils import ok, err, log_op
from .auth import admin_required, login_required

bp = Blueprint('tags', __name__, url_prefix='/api/tags')


@bp.get('')
@login_required
def list_tags():
    """标签列表，可按维度过滤"""
    dim = request.args.get('dimension', '').strip()
    where = ['status = 1']
    params = []
    if dim:
        where.append('dimension = ?')
        params.append(dim)
    rows = query_all(
        f'''SELECT id, name, dimension, color, is_builtin, usage_count
            FROM tags WHERE {" AND ".join(where)}
            ORDER BY dimension, usage_count DESC, id''',
        params
    )
    # 按维度分组返回，前端更好用
    grouped = {}
    for r in rows:
        grouped.setdefault(r['dimension'], []).append(r)
    return ok({'grouped': grouped, 'list': rows})


@bp.post('')
@admin_required
def create_tag():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return err('标签名称必填')
    if query_one('SELECT id FROM tags WHERE name = ?', (name,)):
        return err('标签已存在')
    tid = execute(
        '''INSERT INTO tags (name, dimension, color, is_builtin, status)
           VALUES (?, ?, ?, 0, 1)''',
        (name, data.get('dimension', 'custom'), data.get('color'))
    )
    log_op(0, 'tag_create', 'tag', tid, {'name': name})
    return ok({'id': tid})


@bp.put('/<int:tid>')
@admin_required
def update_tag(tid):
    tag = query_one('SELECT * FROM tags WHERE id = ?', (tid,))
    if not tag:
        return err('标签不存在', 404)
    if tag['is_builtin']:
        return err('内置标签仅可改颜色')

    data = request.get_json() or {}
    fields = []
    params = []
    allowed = ('color',) if tag['is_builtin'] else ('name', 'dimension', 'color', 'status')
    for k in allowed:
        if k in data:
            fields.append(f'{k} = ?')
            params.append(data[k])
    if not fields:
        return err('无更新内容')
    params.append(tid)
    execute(f'UPDATE tags SET {", ".join(fields)} WHERE id = ?', params)
    log_op(0, 'tag_update', 'tag', tid, data)
    return ok()


@bp.delete('/<int:tid>')
@admin_required
def delete_tag(tid):
    tag = query_one('SELECT is_builtin FROM tags WHERE id = ?', (tid,))
    if not tag:
        return err('标签不存在', 404)
    if tag['is_builtin']:
        return err('内置标签不可删除，可停用')
    # 检查使用情况
    used = query_one('SELECT COUNT(*) AS c FROM material_tags WHERE tag_id = ?', (tid,))['c']
    if used > 0:
        return err(f'有 {used} 份资料使用此标签，请先解绑')
    execute('DELETE FROM tags WHERE id = ?', (tid,))
    log_op(0, 'tag_delete', 'tag', tid)
    return ok()


@bp.post('/merge')
@admin_required
def merge_tags():
    """合并冗余标签：把 from_ids 中的标签合并到 to_id"""
    data = request.get_json() or {}
    to_id = data.get('to_id')
    from_ids = data.get('from_ids', [])
    if not to_id or not from_ids:
        return err('参数不完整')

    for fid in from_ids:
        if fid == to_id:
            continue
        # 把绑定关系转到 to_id（避免唯一键冲突，先 INSERT OR IGNORE 再 DELETE）
        execute(
            'INSERT OR IGNORE INTO material_tags (material_id, tag_id) '
            'SELECT material_id, ? FROM material_tags WHERE tag_id = ?',
            (to_id, fid)
        )
        execute('DELETE FROM material_tags WHERE tag_id = ?', (fid,))
        execute('DELETE FROM tags WHERE id = ?', (fid,))

    log_op(0, 'tag_merge', 'tag', to_id, {'merged_from': from_ids})
    return ok()
