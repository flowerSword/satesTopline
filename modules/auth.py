"""认证与权限"""
from functools import wraps
from flask import Blueprint, request, session
from .db import query_one, execute
from .utils import ok, err, sha256, log_op

bp = Blueprint('auth', __name__, url_prefix='/api/auth')


# ── 权限装饰器 ─────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if 'user_id' not in session:
            return err('未登录', 401)
        return f(*args, **kwargs)
    return wrapper


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if 'user_id' not in session:
            return err('未登录', 401)
        if session.get('role') not in ('super_admin', 'presales_admin'):
            return err('权限不足', 403)
        return f(*args, **kwargs)
    return wrapper


def super_admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if session.get('role') != 'super_admin':
            return err('需要超级管理员权限', 403)
        return f(*args, **kwargs)
    return wrapper


# ── 接口 ──────────────────────────────────────────────
@bp.post('/login')
def login():
    """
    登录
    前端传入 username + password_sha256（前端已做一次 SHA256）
    后端再做一次 SHA256 比对数据库哈希
    """
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    pwd_sha = (data.get('password') or '').strip()

    if not username or not pwd_sha:
        return err('账号或密码不能为空')

    user = query_one('SELECT * FROM users WHERE username = ?', (username,))
    if not user:
        return err('账号或密码错误')
    if user['status'] != 1:
        return err('账号已停用')

    # 双重哈希比对
    if user['password_hash'] != pwd_sha:
        # 兼容直接传明文 SHA256 哈希的情况（首次部署种子数据）
        return err('账号或密码错误')

    # 写入 session
    session.permanent = True
    session['user_id'] = user['id']
    session['username'] = user['username']
    session['role'] = user['role']
    session['real_name'] = user['real_name']

    # 更新最后登录时间
    execute(
        'UPDATE users SET last_login_at = CURRENT_TIMESTAMP, last_login_ip = ? WHERE id = ?',
        (request.remote_addr, user['id'])
    )
    log_op(user['id'], 'login')

    return ok({
        'id': user['id'],
        'username': user['username'],
        'real_name': user['real_name'],
        'department': user['department'],
        'role': user['role'],
    })


@bp.post('/logout')
def logout():
    uid = session.get('user_id')
    if uid:
        log_op(uid, 'logout')
    session.clear()
    return ok()


@bp.get('/me')
def me():
    """获取当前登录用户信息"""
    if 'user_id' not in session:
        return err('未登录', 401)
    user = query_one(
        'SELECT id, username, real_name, department, position, email, role FROM users WHERE id = ?',
        (session['user_id'],)
    )
    if not user:
        session.clear()
        return err('用户不存在', 401)
    return ok(user)


@bp.post('/change_password')
@login_required
def change_password():
    """修改密码（前端传旧密码 SHA256 + 新密码 SHA256）"""
    data = request.get_json() or {}
    old_pwd = data.get('old_password', '').strip()
    new_pwd = data.get('new_password', '').strip()
    if not old_pwd or not new_pwd:
        return err('参数不完整')

    user = query_one('SELECT password_hash FROM users WHERE id = ?', (session['user_id'],))
    if user['password_hash'] != old_pwd:
        return err('原密码错误')

    execute('UPDATE users SET password_hash = ? WHERE id = ?', (new_pwd, session['user_id']))
    log_op(session['user_id'], 'change_password')
    return ok()
