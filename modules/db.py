"""
数据库连接管理
- SQLite 单文件，WAL 模式，支持多读单写
- 每个请求一个连接（Flask g 对象管理）
- Row 自动转 dict，便于 JSON 序列化
"""
import os
import sqlite3
from flask import g, current_app
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'salestopline.db')


def get_db():
    """获取当前请求的数据库连接，无则创建"""
    if 'db' not in g:
        g.db = sqlite3.connect(
            DB_PATH,
            detect_types=sqlite3.PARSE_DECLTYPES,
            check_same_thread=False,
            timeout=30.0,
        )
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA foreign_keys = ON')
    return g.db


def close_db(e=None):
    """请求结束时关闭连接"""
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
    """初始化数据库：首次启动建表 + 灌入种子数据"""
    # 保证 data/ 目录存在
    _db_path = os.path.abspath(DB_PATH)
    os.makedirs(os.path.dirname(_db_path), exist_ok=True)

    sql_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sql')
    db = sqlite3.connect(_db_path, timeout=30.0)
    db.execute('PRAGMA foreign_keys = ON')

    # 建表
    with open(os.path.join(sql_dir, 'schema.sql'), 'r', encoding='utf-8') as f:
        db.executescript(f.read())

    # 仅当 users 表为空时灌入种子数据（避免重复初始化）
    cursor = db.execute('SELECT COUNT(*) FROM users')
    if cursor.fetchone()[0] == 0:
        with open(os.path.join(sql_dir, 'seed.sql'), 'r', encoding='utf-8') as f:
            db.executescript(f.read())
        print('  → 已灌入种子数据（默认账号 admin / admin123）')
    else:
        print('  → 数据库已存在，跳过种子数据')

    db.commit()
    db.close()


def query_one(sql, params=()):
    """查询单行，返回 dict 或 None"""
    cur = get_db().execute(sql, params)
    row = cur.fetchone()
    return dict(row) if row else None


def query_all(sql, params=()):
    """查询多行，返回 dict 列表"""
    cur = get_db().execute(sql, params)
    return [dict(r) for r in cur.fetchall()]


def execute(sql, params=()):
    """执行写操作，返回 lastrowid"""
    db = get_db()
    cur = db.execute(sql, params)
    db.commit()
    return cur.lastrowid


def executemany(sql, seq):
    """批量执行"""
    db = get_db()
    db.executemany(sql, seq)
    db.commit()


@contextmanager
def transaction():
    """事务上下文管理器"""
    db = get_db()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
