"""
搜索模块
- 关键词搜索：标题、简介、标签、分类
- 语义搜索：基于本地 embedding（sentence-transformers + faiss/numpy）
  - 一期为了控制依赖，先用 numpy 做 cosine 相似度，资料量 <10万 时性能足够
  - 模型未就绪时自动回退到关键词搜索
"""
import os
import struct
import threading
from flask import Blueprint, request
from .db import query_one, query_all, execute
from .utils import ok, err
from .auth import login_required

bp = Blueprint('search', __name__, url_prefix='/api/search')

# ── Embedding 引擎（懒加载、单例）────────────────────────
_EMB_MODEL = None
_EMB_LOCK = threading.Lock()
_EMB_DIM = 384  # all-MiniLM-L6-v2 默认维度


def _load_model():
    """懒加载 embedding 模型。模型放在 wheels/ 同级 models/ 目录"""
    global _EMB_MODEL
    if _EMB_MODEL is not None:
        return _EMB_MODEL
    with _EMB_LOCK:
        if _EMB_MODEL is not None:
            return _EMB_MODEL
        try:
            from sentence_transformers import SentenceTransformer
            model_dir = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), '..', 'models', 'all-MiniLM-L6-v2'
            )
            if os.path.isdir(model_dir):
                _EMB_MODEL = SentenceTransformer(model_dir)
            else:
                # 在线（首次构建索引时联网下载）
                _EMB_MODEL = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
            print('[INFO] sentence-transformers 模型已加载')
        except Exception as e:
            print(f'[WARN] embedding 模型加载失败，将回退关键词搜索: {e}')
            _EMB_MODEL = False
    return _EMB_MODEL


def _embed_text(text: str):
    """文本向量化，返回 float32 numpy 数组（失败返回 None）"""
    model = _load_model()
    if not model:
        return None
    import numpy as np
    vec = model.encode([text], normalize_embeddings=True)[0].astype(np.float32)
    return vec


def _vec_to_blob(vec) -> bytes:
    """numpy 向量序列化为 BLOB"""
    return vec.tobytes()


def _blob_to_vec(blob: bytes):
    import numpy as np
    return np.frombuffer(blob, dtype=np.float32)


# ── 索引构建 ────────────────────────────────────────
def build_embedding(material_id: int):
    """为单份资料构建/更新 embedding"""
    mat = query_one('SELECT id, title, summary FROM materials WHERE id = ?', (material_id,))
    if not mat:
        return False
    # 拼接标签作为补充语义
    tags = query_all(
        '''SELECT t.name FROM material_tags mt JOIN tags t ON t.id = mt.tag_id
           WHERE mt.material_id = ?''',
        (material_id,)
    )
    tag_text = ' '.join([t['name'] for t in tags])
    text = f"{mat['title']}。{mat['summary'] or ''}。{tag_text}".strip()

    vec = _embed_text(text)
    if vec is None:
        return False

    import hashlib
    text_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
    execute(
        '''INSERT INTO material_embeddings (material_id, embedding, text_hash, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(material_id) DO UPDATE SET
             embedding = excluded.embedding,
             text_hash = excluded.text_hash,
             updated_at = CURRENT_TIMESTAMP''',
        (material_id, _vec_to_blob(vec), text_hash)
    )
    return True


@bp.post('/rebuild_index')
@login_required
def rebuild_index():
    """全量重建索引（管理员触发，耗时操作）"""
    from .utils import is_admin
    if not is_admin():
        return err('需要管理员权限', 403)

    mats = query_all("SELECT id FROM materials WHERE publish_status = 'online'")
    success = 0
    failed = 0
    for m in mats:
        if build_embedding(m['id']):
            success += 1
        else:
            failed += 1
    return ok({'total': len(mats), 'success': success, 'failed': failed})


# ── 检索接口 ────────────────────────────────────────
@bp.get('/keyword')
@login_required
def keyword_search():
    """传统关键词搜索（适用于精确匹配）"""
    q = (request.args.get('q') or '').strip()
    limit = min(int(request.args.get('limit', 20)), 100)
    if not q:
        return ok([])

    # 标题 / 简介 / 分类名 / 标签名 都搜
    pattern = f'%{q}%'
    rows = query_all(
        '''SELECT DISTINCT m.id, m.title, m.summary,
                  m.view_count, m.download_count,
                  c.name AS category_name
           FROM materials m
           JOIN categories c ON c.id = m.category_id
           LEFT JOIN material_tags mt ON mt.material_id = m.id
           LEFT JOIN tags t ON t.id = mt.tag_id
           WHERE m.publish_status = 'online' AND m.audit_status = 'approved'
             AND (m.title LIKE ? OR m.summary LIKE ? OR c.name LIKE ? OR t.name LIKE ?)
           ORDER BY m.download_count DESC, m.view_count DESC
           LIMIT ?''',
        (pattern, pattern, pattern, pattern, limit)
    )
    return ok(rows)


@bp.post('/semantic')
@login_required
def semantic_search():
    """
    语义搜索（AI 助手辅助检索）
    入参：{q: "智慧园区招投标用的方案", top_k: 10}
    若 embedding 不可用，自动回退到关键词搜索
    """
    data = request.get_json() or {}
    q = (data.get('q') or '').strip()
    top_k = min(int(data.get('top_k', 10)), 50)
    if not q:
        return ok([])

    q_vec = _embed_text(q)
    if q_vec is None:
        # 回退
        from flask import request as flask_req
        flask_req.args = type(flask_req.args)({'q': q, 'limit': str(top_k)})
        # 简单回退实现：直接做关键词
        pattern = f'%{q}%'
        rows = query_all(
            '''SELECT id, title, summary, view_count, download_count
               FROM materials WHERE publish_status = 'online' AND audit_status = 'approved'
                 AND (title LIKE ? OR summary LIKE ?)
               ORDER BY download_count DESC LIMIT ?''',
            (pattern, pattern, top_k)
        )
        return ok({'mode': 'keyword_fallback', 'list': rows})

    import numpy as np
    # 加载所有 embedding 到内存（量小时直接全量计算）
    rows = query_all(
        '''SELECT e.material_id, e.embedding, m.title, m.summary,
                  m.view_count, m.download_count
           FROM material_embeddings e
           JOIN materials m ON m.id = e.material_id
           WHERE m.publish_status = 'online' AND m.audit_status = 'approved' '''
    )
    if not rows:
        return ok({'mode': 'semantic', 'list': [], 'msg': '索引为空，请先重建索引'})

    matrix = np.stack([_blob_to_vec(r['embedding']) for r in rows])
    # 因为已归一化，cosine = 点积
    scores = matrix @ q_vec
    # 取 top_k
    idx_sorted = np.argsort(-scores)[:top_k]
    result = []
    for i in idx_sorted:
        r = rows[i]
        result.append({
            'id': r['material_id'],
            'title': r['title'],
            'summary': r['summary'],
            'view_count': r['view_count'],
            'download_count': r['download_count'],
            'score': float(scores[i]),
        })
    return ok({'mode': 'semantic', 'list': result})
