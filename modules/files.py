"""文件管理：上传、下载、预览、删除"""
import os
from flask import Blueprint, request, session, send_file, abort, Response
from .db import query_one, execute
from .utils import (
    ok, err, log_op, gen_storage_path, abs_path_from_rel,
    get_extension, is_allowed_ext, can_preview, md5_file, format_size
)
from .auth import login_required, admin_required

bp = Blueprint('files', __name__, url_prefix='/api/files')

# 单文件上限 500MB（可配）
MAX_FILE_SIZE = 500 * 1024 * 1024


@bp.post('/upload')
@login_required
def upload_file():
    """
    上传文件
    返回 file_id 给前端用于绑定到资料
    """
    if 'file' not in request.files:
        return err('未携带文件')
    f = request.files['file']
    if not f or not f.filename:
        return err('文件为空')

    if not is_allowed_ext(f.filename):
        return err(f'不允许的文件类型，支持的格式见配置')

    ext = get_extension(f.filename)
    rel_path, abs_path = gen_storage_path(ext)

    # 流式写入，避免大文件占内存
    f.save(abs_path)

    size = os.path.getsize(abs_path)
    if size > MAX_FILE_SIZE:
        os.remove(abs_path)
        return err(f'文件超过 {MAX_FILE_SIZE // 1024 // 1024}MB 限制')

    md5 = md5_file(abs_path)

    # 去重：若已有相同 MD5，直接复用并删除新上传的副本
    existing = query_one('SELECT id, storage_path FROM material_files WHERE md5_hash = ?', (md5,))
    if existing:
        os.remove(abs_path)
        log_op(session['user_id'], 'file_reuse', 'file', existing['id'], {'md5': md5})
        return ok({'file_id': existing['id'], 'reused': True})

    fid = execute(
        '''INSERT INTO material_files (original_name, storage_path, file_size, extension, md5_hash, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?)''',
        (f.filename, rel_path, size, ext, md5, session['user_id'])
    )
    log_op(session['user_id'], 'file_upload', 'file', fid,
           {'name': f.filename, 'size': size})
    return ok({
        'file_id': fid,
        'original_name': f.filename,
        'extension': ext,
        'size': size,
        'size_human': format_size(size),
    })


@bp.get('/<int:fid>/download')
@login_required
def download_file(fid):
    """下载文件（写下载日志、累计计数）"""
    f = query_one(
        '''SELECT f.*, m.id AS material_id, m.visibility
           FROM material_files f
           LEFT JOIN material_versions mv ON mv.file_id = f.id AND mv.is_current = 1
           LEFT JOIN materials m ON m.id = mv.material_id
           WHERE f.id = ?''',
        (fid,)
    )
    if not f:
        abort(404)

    abs_path = abs_path_from_rel(f['storage_path'])
    if not os.path.exists(abs_path):
        return err('文件不存在', 404)

    # 写下载日志
    mid = f.get('material_id')
    if mid:
        execute('INSERT INTO download_logs (user_id, material_id, file_id, ip_address) VALUES (?, ?, ?, ?)',
                (session['user_id'], mid, fid, request.remote_addr))
        execute('UPDATE materials SET download_count = download_count + 1 WHERE id = ?', (mid,))

    return send_file(abs_path, as_attachment=True, download_name=f['original_name'])


@bp.get('/<int:fid>/preview')
@login_required
def preview_file(fid):
    """在线预览（PDF、图片直接返回原文件；其他格式返回提示）"""
    f = query_one('SELECT * FROM material_files WHERE id = ?', (fid,))
    if not f:
        abort(404)
    if not can_preview(f['original_name']):
        return err(f'{f["extension"]} 格式暂不支持在线预览，请下载查看', 415)
    abs_path = abs_path_from_rel(f['storage_path'])
    if not os.path.exists(abs_path):
        return err('文件不存在', 404)
    # 不设 as_attachment，浏览器直接渲染
    return send_file(abs_path)


@bp.get('/<int:fid>/info')
@login_required
def file_info(fid):
    f = query_one('SELECT id, original_name, extension, file_size, uploaded_at FROM material_files WHERE id = ?', (fid,))
    if not f:
        return err('文件不存在', 404)
    f['size_human'] = format_size(f['file_size'])
    f['can_preview'] = can_preview(f['original_name'])
    return ok(f)
