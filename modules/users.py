"""用户管理（超管功能）"""
from flask import Blueprint, request
from .db import query_one, query_all, execute
from .utils import ok, err, sha256, log_op
from .auth import super_admin_required, admin_required, login_required

bp = Blueprint('users', __name__, url_prefix='/api/users')


@bp.get('')
@admin_required
def list_users():
    """用户列表（支持搜索、分页）"""
    keyword = request.args.get('keyword', '').strip()
    role = request.args.get('role', '').strip()
    status = request.args.get('status', '').strip()
    page = max(int(request.args.get('page', 1)), 1)
    page_size = min(int(request.args.get('page_size', 20)), 100)

    where = []
    params = []
    if keyword:
        where.append('(username LIKE ? OR real_name LIKE ? OR department LIKE ?)')
        kw = f'%{keyword}%'
        params.extend([kw, kw, kw])
    if role:
        where.append('role = ?')
        params.append(role)
    if status != '':
        where.append('status = ?')
        params.append(int(status))

    where_sql = 'WHERE ' + ' AND '.join(where) if where else ''
    total = query_one(f'SELECT COUNT(*) AS c FROM users {where_sql}', params)['c']

    rows = query_all(
        f'''SELECT id, username, real_name, department, position, email, phone, role, status,
                   last_login_at, created_at
            FROM users {where_sql}
            ORDER BY id DESC
            LIMIT ? OFFSET ?''',
        params + [page_size, (page - 1) * page_size]
    )
    return ok({'total': total, 'list': rows, 'page': page, 'page_size': page_size})


@bp.post('')
@super_admin_required
def create_user():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    real_name = data.get('real_name', '').strip()
    password = data.get('password', '').strip() if data.get('password') else ''
    role = data.get('role', 'user')
    if not username:
        return err('账号不能为空')
    if role not in ('super_admin', 'presales_admin', 'user'):
        return err('角色非法')

    if query_one('SELECT id FROM users WHERE username = ?', (username,)):
        return err('账号已存在')

    # 密码留空时使用默认密码 123456（前端已 sha256 加密，后端兼容两种形式）
    DEFAULT_PWD_HASH = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92'  # sha256("123456")
    if not password:
        pwd_hash = DEFAULT_PWD_HASH
    else:
        pwd_hash = sha256(password) if len(password) != 64 else password  # 兼容前端已加密
    uid = execute(
        '''INSERT INTO users (username, password_hash, real_name, department, position,
                              email, phone, role, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)''',
        (username, pwd_hash, real_name,
         data.get('department'), data.get('position'),
         data.get('email'), data.get('phone'), role)
    )
    log_op(0, 'user_create', 'user', uid, {'username': username, 'role': role})
    return ok({'id': uid})


@bp.put('/<int:uid>')
@super_admin_required
def update_user(uid):
    data = request.get_json() or {}
    fields = []
    params = []
    for k in ('real_name', 'department', 'position', 'email', 'phone', 'role', 'status'):
        if k in data:
            fields.append(f'{k} = ?')
            params.append(data[k])
    if not fields:
        return err('无更新内容')
    params.append(uid)
    execute(f'UPDATE users SET {", ".join(fields)} WHERE id = ?', params)
    log_op(0, 'user_update', 'user', uid, data)
    return ok()


@bp.post('/<int:uid>/reset_password')
@super_admin_required
def reset_password(uid):
    """重置密码为指定值（前端可传明文或 SHA256）"""
    data = request.get_json() or {}
    new_pwd = data.get('password', '').strip()
    if not new_pwd:
        return err('新密码不能为空')
    pwd_hash = sha256(new_pwd) if len(new_pwd) != 64 else new_pwd
    execute('UPDATE users SET password_hash = ? WHERE id = ?', (pwd_hash, uid))
    log_op(0, 'user_reset_pwd', 'user', uid)
    return ok()


@bp.delete('/<int:uid>')
@super_admin_required
def disable_user(uid):
    """停用账号（不物理删除）"""
    if uid == 1:
        return err('禁止操作超级管理员')
    execute('UPDATE users SET status = 0 WHERE id = ?', (uid,))
    log_op(0, 'user_disable', 'user', uid)
    return ok()
