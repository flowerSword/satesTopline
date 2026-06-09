"""通用工具：哈希、响应格式、文件路径、操作日志"""
import os
import json
import uuid
import hashlib
import datetime
from flask import jsonify, request, session
from .db import execute

# ── 文件存储根目录 ─────────────────────────────────────
FILES_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'files')


# ── 哈希 ──────────────────────────────────────────────
def sha256(text: str) -> str:
    """SHA256 文本哈希"""
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def md5_file(filepath: str) -> str:
    """文件 MD5 指纹（用于去重）"""
    h = hashlib.md5()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


# ── 统一响应格式 ──────────────────────────────────────
def ok(data=None, msg='ok'):
    """成功响应"""
    return jsonify({'code': 0, 'msg': msg, 'data': data})


def err(msg='error', code=400, data=None):
    """错误响应"""
    return jsonify({'code': code, 'msg': msg, 'data': data}), code


# ── 文件存储 ──────────────────────────────────────────
def gen_storage_path(extension: str) -> tuple[str, str]:
    """
    生成文件存储相对路径与绝对路径
    返回：(rel_path, abs_path)
    rel_path: 2026/06/abc-xxx.pdf （存数据库用）
    abs_path: /full/path/data/files/2026/06/abc-xxx.pdf
    """
    now = datetime.datetime.now()
    sub_dir = f"{now.year:04d}/{now.month:02d}"
    fname = f"{uuid.uuid4().hex}.{extension.lstrip('.')}"
    rel_path = f"{sub_dir}/{fname}"
    abs_dir = os.path.join(FILES_ROOT, sub_dir)
    os.makedirs(abs_dir, exist_ok=True)
    abs_path = os.path.join(abs_dir, fname)
    return rel_path, abs_path


def abs_path_from_rel(rel_path: str) -> str:
    """从相对路径获取绝对路径"""
    return os.path.join(FILES_ROOT, rel_path)


# ── 操作日志 ──────────────────────────────────────────
def log_op(user_id: int, action: str, target_type: str = None,
           target_id: int = None, detail: dict = None):
    """记录管理员操作日志"""
    detail_str = json.dumps(detail, ensure_ascii=False) if detail else None
    ip = request.remote_addr if request else None
    try:
        execute(
            '''INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, ip_address)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (user_id, action, target_type, target_id, detail_str, ip)
        )
    except Exception as e:
        # 日志失败不影响主流程
        print(f'[WARN] log_op failed: {e}')


# ── 当前用户 ──────────────────────────────────────────
def current_user_id():
    """获取当前登录用户 ID，未登录返回 None"""
    return session.get('user_id')


def current_user_role():
    """获取当前登录用户角色"""
    return session.get('role')


def is_admin():
    """当前用户是否为售前管理员或超管"""
    return session.get('role') in ('super_admin', 'presales_admin')


def is_super_admin():
    """当前用户是否为超管"""
    return session.get('role') == 'super_admin'


# ── 文件类型识别 ──────────────────────────────────────
PREVIEWABLE_EXT = {'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'md'}
ALLOWED_EXT = {
    'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp',
    'mp4', 'mov', 'avi', 'mkv', 'webm',
    'mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg',
    'zip', 'rar', '7z',
    'txt', 'md', 'csv'
}


def get_extension(filename: str) -> str:
    """提取文件扩展名（小写，无点）"""
    if '.' not in filename:
        return ''
    return filename.rsplit('.', 1)[-1].lower()


def is_allowed_ext(filename: str) -> bool:
    """是否允许的文件类型"""
    return get_extension(filename) in ALLOWED_EXT


def can_preview(filename: str) -> bool:
    """是否可在线预览"""
    return get_extension(filename) in PREVIEWABLE_EXT


def format_size(byte_count: int) -> str:
    """人类可读的文件大小"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if byte_count < 1024:
            return f"{byte_count:.1f} {unit}"
        byte_count /= 1024
    return f"{byte_count:.1f} TB"
