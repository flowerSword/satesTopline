-- ============================================================
-- 售前头条 初始数据
-- 超管账号、一级分类（固定不可删）、二级分类（按需求文档）、内置标签
-- ============================================================

-- ── 1. 超级管理员（密码 admin123）
-- 前端登录时已对密码做一次 SHA256，后端直接比对存储的 SHA256 哈希
-- SHA256('admin123') = 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
INSERT OR IGNORE INTO users (id, username, password_hash, real_name, role, status)
VALUES (1, 'admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', '系统管理员', 'super_admin', 1);

-- 售前管理员示例账号（密码 presales123）
INSERT OR IGNORE INTO users (id, username, password_hash, real_name, department, role, status)
VALUES (2, 'presales', '6f669dde395d3f147a89213a27c515c187eadb58ab3f9993e886d947e70d506d', '售前管理员', '售前业务部', 'presales_admin', 1);

-- 普通业务员示例
INSERT OR IGNORE INTO users (id, username, password_hash, real_name, department, role, status)
VALUES (3, 'sales01', '6bc0a63cb29c92306020c0a6bbc358cc4628db277dc06e253535e126517ad637', '销售一号', '深圳分公司', 'user', 1);

-- ============================================================
-- 一级分类（固定 9 个，is_builtin=1 禁止删除）
-- ============================================================
INSERT OR IGNORE INTO categories (id, parent_id, name, code, level, icon, sort_order, is_builtin) VALUES
(1, NULL, '产品资料',  'PRODUCT',    1, '📦', 1, 1),
(2, NULL, '方案资料',  'SOLUTION',   1, '📋', 2, 1),
(3, NULL, '市场推广',  'MARKETING',  1, '📣', 3, 1),
(4, NULL, '标杆案例',  'CASE',       1, '🏆', 4, 1),
(5, NULL, '工具类',    'TOOL',       1, '🛠️', 5, 1),
(6, NULL, '招投标',    'BIDDING',    1, '📑', 6, 1),
(7, NULL, '售前夜校',  'TRAINING',   1, '🎓', 7, 1),
(8, NULL, '本地案例库','LOCAL_CASE', 1, '📍', 8, 1),
(9, NULL, '论坛板块',  'FORUM',      1, '💬', 9, 1);

-- ============================================================
-- 二级分类（按需求文档预置，is_locked=1 表示内置二级，不可删除）
-- ============================================================
-- 产品资料 (1)
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked) VALUES
(1, '产品手册',   2, 1, 1),
(1, '产品参数',   2, 2, 1),
(1, '功能介绍',   2, 3, 1),
(1, '产品白皮书', 2, 4, 1),
(1, '报价清单',   2, 5, 1),
(1, '规范设计',   2, 6, 1);

-- 方案资料 (2)
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked) VALUES
(2, '通用标准方案', 2, 1, 1),
(2, '推广方案',     2, 2, 1),
(2, '专项投标方案', 2, 3, 1);

-- 市场推广 (3)
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked) VALUES
(3, '推广话术',     2, 1, 1),
(3, '产品视频',     2, 2, 1),
(3, '宣传海报',     2, 3, 1),
(3, '软文文案',     2, 4, 1),
(3, '线下活动方案', 2, 5, 1);

-- 标杆案例 (4)
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked) VALUES
(4, '全国标杆项目',     2, 1, 1),
(4, '细分行业落地案例', 2, 2, 1),
(4, '项目实景素材',     2, 3, 1);

-- 工具类 (5)
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked) VALUES
(5, '测算表格',     2, 1, 1),
(5, '配置工具',     2, 2, 1),
(5, '产品选型模板', 2, 3, 1);

-- 招投标 (6)
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked) VALUES
(6, '投标文件模板', 2, 1, 1),
(6, '竞品调研资料', 2, 2, 1),
(6, '投标答疑资料', 2, 3, 1),
(6, '公开招标模板', 2, 4, 1),
(6, '邀标专用模板', 2, 5, 1);

-- 售前夜校 (7)
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked) VALUES
(7, '新员工入门课件', 2, 1, 1),
(7, '新品培训资料',   2, 2, 1),
(7, '售前技能课程',   2, 3, 1),
(7, '月度专项培训',   2, 4, 1),
(7, '季度赋能课件',   2, 5, 1);

-- 本地案例库 (8) - 城市直接做二级
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked) VALUES
(8, '深圳', 2, 1, 1),
(8, '广州', 2, 2, 1),
(8, '北京', 2, 3, 1),
(8, '上海', 2, 4, 1),
(8, '成都', 2, 5, 1),
(8, '西安', 2, 6, 1);

-- 论坛板块 (9)
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked) VALUES
(9, '售前交流话题', 2, 1, 1),
(9, '问题答疑帖',   2, 2, 1),
(9, '新品讨论',     2, 3, 1),
(9, '疑难方案交流', 2, 4, 1);

-- ============================================================
-- 三级分类（产品资料/方案资料下的产品线，按需求文档）
-- ============================================================
-- 假设产品资料二级 id 为 10-15，方案资料二级 id 为 16-18
-- 用 subquery 动态获取 parent_id，避免硬编码
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked)
SELECT id, '门禁', 3, 1, 0 FROM categories WHERE parent_id=1 AND name='产品手册';
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked)
SELECT id, '停车', 3, 2, 0 FROM categories WHERE parent_id=1 AND name='产品手册';
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked)
SELECT id, '城停', 3, 3, 0 FROM categories WHERE parent_id=1 AND name='产品手册';
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked)
SELECT id, '快充', 3, 4, 0 FROM categories WHERE parent_id=1 AND name='产品手册';
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked)
SELECT id, '慢充', 3, 5, 0 FROM categories WHERE parent_id=1 AND name='产品手册';
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked)
SELECT id, '储能', 3, 6, 0 FROM categories WHERE parent_id=1 AND name='产品手册';
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked)
SELECT id, '园区', 3, 7, 0 FROM categories WHERE parent_id=1 AND name='产品手册';
INSERT OR IGNORE INTO categories (parent_id, name, level, sort_order, is_locked)
SELECT id, '社区', 3, 8, 0 FROM categories WHERE parent_id=1 AND name='产品手册';

-- ============================================================
-- 内置标签（多维度）
-- ============================================================
INSERT OR IGNORE INTO tags (name, dimension, color, is_builtin) VALUES
-- 产品品类
('门禁',     'product',  '#3B82F6', 1),
('停车',     'product',  '#10B981', 1),
('城停',     'product',  '#14B8A6', 1),
('新能源',   'product',  '#22C55E', 1),
('储能',     'product',  '#EAB308', 1),
('园区',     'product',  '#F97316', 1),
('社区',     'product',  '#EF4444', 1),
('校园',     'product',  '#A855F7', 1),
('资管',     'product',  '#EC4899', 1),
-- 适用行业
('政府',     'industry', '#6366F1', 1),
('企业',     'industry', '#0EA5E9', 1),
('地产',     'industry', '#06B6D4', 1),
('教育',     'industry', '#8B5CF6', 1),
('医疗',     'industry', '#F43F5E', 1),
-- 资料格式
('PDF',      'format',   '#DC2626', 1),
('PPT',      'format',   '#D97706', 1),
('视频',     'format',   '#7C3AED', 1),
('Word',     'format',   '#2563EB', 1),
('Excel',    'format',   '#16A34A', 1),
-- 资料状态
('新品',     'status',   '#F59E0B', 1),
('存量',     'status',   '#64748B', 1),
('热门',     'status',   '#EF4444', 1),
('精品',     'status',   '#EAB308', 1),
-- 应用场景
('投标',     'scene',    '#0F766E', 1),
('培训',     'scene',    '#7E22CE', 1),
('客户对接', 'scene',    '#BE185D', 1),
('内部赋能', 'scene',    '#A16207', 1);

-- ============================================================
-- 示例公告
-- ============================================================
INSERT OR IGNORE INTO announcements (title, content, type, is_popup, is_carousel, created_by) VALUES
('欢迎使用售前头条 v1.0',
 '<p>各位同事好，</p><p>售前头条平台正式上线，告别老旧资讯窗口！本次重构带来：</p><ul><li>三级分类 + 多维度标签</li><li>AI 智能检索</li><li>热门榜单 + 公告推送</li><li>个人收藏与浏览记录</li></ul><p>使用过程中如有问题，请通过"个人中心-反馈"提交。</p>',
 'notice', 1, 1, 1);
