-- ============================================================
-- 售前头条 SalesTopline 数据库 Schema
-- 数据库：SQLite (WAL 模式)
-- 版本：v1.0 MVP
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- 1. 账号与权限体系
-- ============================================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT NOT NULL UNIQUE,           -- 登录账号（建议同企微账号）
    password_hash   TEXT NOT NULL,                  -- SHA256(password) 前端加密后再哈希
    real_name       TEXT NOT NULL,                  -- 姓名
    department      TEXT,                            -- 部门
    position        TEXT,                            -- 岗位
    email           TEXT,
    phone           TEXT,
    avatar_url      TEXT,
    role            TEXT NOT NULL DEFAULT 'user',   -- super_admin / presales_admin / user
    status          INTEGER NOT NULL DEFAULT 1,     -- 1 启用 / 0 停用
    last_login_at   DATETIME,
    last_login_ip   TEXT,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);

-- ============================================================
-- 2. 三级分类体系（自关联）
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id       INTEGER,                         -- NULL 表示一级分类
    name            TEXT NOT NULL,                   -- 分类名称
    code            TEXT,                            -- 编码（一级分类内置，如 PRODUCT/SOLUTION）
    level           INTEGER NOT NULL,                -- 1/2/3 层级
    icon            TEXT,                            -- 图标（首页一级分类用）
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_builtin      INTEGER NOT NULL DEFAULT 0,      -- 1 系统内置（一级，禁止删除）
    is_locked       INTEGER NOT NULL DEFAULT 0,      -- 1 锁定（二级内置，不可删除）
    status          INTEGER NOT NULL DEFAULT 1,      -- 1 启用 / 0 停用
    created_by      INTEGER,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
);
CREATE INDEX IF NOT EXISTS idx_cat_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_cat_level ON categories(level);
CREATE INDEX IF NOT EXISTS idx_cat_sort ON categories(sort_order);

-- ============================================================
-- 3. 标签体系
-- ============================================================

CREATE TABLE IF NOT EXISTS tags (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,
    dimension       TEXT NOT NULL DEFAULT 'custom',  -- product/industry/format/status/scene/region/custom
    color           TEXT,                             -- 标签颜色（前端展示用）
    is_builtin      INTEGER NOT NULL DEFAULT 0,      -- 1 系统内置标签
    status          INTEGER NOT NULL DEFAULT 1,
    usage_count     INTEGER NOT NULL DEFAULT 0,      -- 使用次数（冗余字段，便于排序）
    created_by      INTEGER,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tags_dimension ON tags(dimension);
CREATE INDEX IF NOT EXISTS idx_tags_status ON tags(status);

-- ============================================================
-- 4. 资料主体与版本
-- ============================================================

-- 资料主体（一份资料的"身份证"，与版本解耦）
CREATE TABLE IF NOT EXISTS materials (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    title               TEXT NOT NULL,                  -- 资料名称
    summary             TEXT,                            -- 简介
    category_id         INTEGER NOT NULL,                -- 所属分类（通常是二级或三级）
    current_version_id  INTEGER,                         -- 当前最新版本 ID
    cover_url           TEXT,                            -- 封面/缩略图
    audit_status        TEXT NOT NULL DEFAULT 'pending', -- pending/approved/rejected
    publish_status      TEXT NOT NULL DEFAULT 'draft',   -- draft/online/offline/archived
    visibility          TEXT NOT NULL DEFAULT 'public',  -- public/restricted（涉密资料）
    is_pinned           INTEGER NOT NULL DEFAULT 0,      -- 首页置顶
    pinned_at           DATETIME,
    view_count          INTEGER NOT NULL DEFAULT 0,      -- 累计浏览量
    download_count      INTEGER NOT NULL DEFAULT 0,      -- 累计下载量
    favorite_count      INTEGER NOT NULL DEFAULT 0,      -- 收藏数
    created_by          INTEGER NOT NULL,
    audited_by          INTEGER,
    audited_at          DATETIME,
    audit_remark        TEXT,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_mat_category ON materials(category_id);
CREATE INDEX IF NOT EXISTS idx_mat_audit ON materials(audit_status);
CREATE INDEX IF NOT EXISTS idx_mat_publish ON materials(publish_status);
CREATE INDEX IF NOT EXISTS idx_mat_pinned ON materials(is_pinned, pinned_at);
CREATE INDEX IF NOT EXISTS idx_mat_views ON materials(view_count);
CREATE INDEX IF NOT EXISTS idx_mat_downloads ON materials(download_count);
CREATE INDEX IF NOT EXISTS idx_mat_created ON materials(created_at);

-- 资料版本（一份资料可以有多个版本，便于版本迭代与回溯）
CREATE TABLE IF NOT EXISTS material_versions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id     INTEGER NOT NULL,
    version_no      TEXT NOT NULL,                   -- v1.0 / v1.1 / v2.0
    file_id         INTEGER NOT NULL,                -- 关联文件
    update_note     TEXT,                             -- 更新说明
    is_current      INTEGER NOT NULL DEFAULT 0,
    created_by      INTEGER NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
    UNIQUE(material_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_ver_material ON material_versions(material_id);
CREATE INDEX IF NOT EXISTS idx_ver_current ON material_versions(is_current);

-- 文件实体（支持一个资料多文件，如方案+附件）
CREATE TABLE IF NOT EXISTS material_files (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    original_name   TEXT NOT NULL,                   -- 原始文件名
    storage_path    TEXT NOT NULL,                   -- 存储路径 yyyy/mm/uuid.ext
    file_size       INTEGER NOT NULL,                -- 字节数
    mime_type       TEXT,
    extension       TEXT,                             -- pdf/docx/pptx/mp4...
    md5_hash        TEXT,                             -- 文件指纹，去重用
    uploaded_by     INTEGER NOT NULL,
    uploaded_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_file_md5 ON material_files(md5_hash);
CREATE INDEX IF NOT EXISTS idx_file_ext ON material_files(extension);

-- 资料与标签多对多
CREATE TABLE IF NOT EXISTS material_tags (
    material_id     INTEGER NOT NULL,
    tag_id          INTEGER NOT NULL,
    PRIMARY KEY (material_id, tag_id),
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mt_tag ON material_tags(tag_id);

-- ============================================================
-- 5. 运营推广
-- ============================================================

-- 公告（弹窗 + 轮播）
CREATE TABLE IF NOT EXISTS announcements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,                   -- 富文本 HTML
    type            TEXT NOT NULL DEFAULT 'notice',  -- notice/newproduct/training/urgent
    is_popup        INTEGER NOT NULL DEFAULT 0,      -- 是否首次进入弹窗
    is_carousel     INTEGER NOT NULL DEFAULT 1,      -- 是否首页轮播
    target_url      TEXT,                             -- 点击跳转的资料 URL
    sort_order      INTEGER NOT NULL DEFAULT 0,
    status          INTEGER NOT NULL DEFAULT 1,
    starts_at       DATETIME,
    ends_at         DATETIME,
    created_by      INTEGER NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ann_status ON announcements(status, starts_at, ends_at);

-- 推荐位（首页置顶专区）
CREATE TABLE IF NOT EXISTS recommendations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id     INTEGER NOT NULL,
    slot            TEXT NOT NULL DEFAULT 'home',    -- home/sidebar/banner
    sort_order      INTEGER NOT NULL DEFAULT 0,
    starts_at       DATETIME,
    ends_at         DATETIME,
    created_by      INTEGER NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_rec_slot ON recommendations(slot, sort_order);

-- ============================================================
-- 6. 用户行为与统计
-- ============================================================

-- 浏览日志（用于热门榜单计算、个人足迹）
CREATE TABLE IF NOT EXISTS view_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    material_id     INTEGER NOT NULL,
    viewed_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_vlog_user_time ON view_logs(user_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_vlog_mat_time ON view_logs(material_id, viewed_at);

-- 下载日志
CREATE TABLE IF NOT EXISTS download_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    material_id     INTEGER NOT NULL,
    version_id      INTEGER,
    file_id         INTEGER,
    ip_address      TEXT,
    downloaded_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dlog_user_time ON download_logs(user_id, downloaded_at);
CREATE INDEX IF NOT EXISTS idx_dlog_mat_time ON download_logs(material_id, downloaded_at);

-- 收藏
CREATE TABLE IF NOT EXISTS favorites (
    user_id         INTEGER NOT NULL,
    material_id     INTEGER NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, material_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);

-- 反馈
CREATE TABLE IF NOT EXISTS feedbacks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    material_id     INTEGER,                          -- 可空，可针对系统整体反馈
    type            TEXT NOT NULL,                    -- missing/error/suggestion/other
    content         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open',     -- open/processing/closed
    handled_by      INTEGER,
    handled_at      DATETIME,
    handle_remark   TEXT,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_fb_status ON feedbacks(status);

-- 操作审计日志（管理员所有写操作留痕）
CREATE TABLE IF NOT EXISTS operation_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    action          TEXT NOT NULL,                    -- upload/audit/edit/delete/online/offline/...
    target_type     TEXT,                              -- material/category/tag/user/announcement
    target_id       INTEGER,
    detail          TEXT,                              -- JSON 详情
    ip_address      TEXT,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_oplog_user ON operation_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_oplog_target ON operation_logs(target_type, target_id);

-- ============================================================
-- 7. AI 检索：embedding 索引
-- ============================================================
-- 存放每份资料的向量化结果，向量本体存为 BLOB（float32 拼接）
-- 查询时由 Python 加载到内存做 cosine 相似度计算
CREATE TABLE IF NOT EXISTS material_embeddings (
    material_id     INTEGER PRIMARY KEY,
    embedding       BLOB NOT NULL,                    -- 384 维 float32
    text_hash       TEXT,                             -- 源文本哈希，便于增量更新
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);

-- ============================================================
-- 触发器：updated_at 自动更新
-- ============================================================
CREATE TRIGGER IF NOT EXISTS trg_users_updated AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_materials_updated AFTER UPDATE ON materials
BEGIN
    UPDATE materials SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
