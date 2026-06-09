# 售前头条 SalesTopline

> 内部企微售前资料协同平台 · Windows 局域网离线部署版

---

## 一、快速开始

### 1. 首次启动（开发机有外网）

```bash
# Windows
双击 start.bat
```

`start.bat` 会自动：
1. 检查 Python（需 3.8+）
2. 创建虚拟环境 `.venv`
3. 安装依赖（优先用 `wheels/` 离线包，否则在线下载）
4. 启动服务，监听 `0.0.0.0:8080`

启动后控制台会打印两个访问地址：

```
本机访问: http://127.0.0.1:8080
局域网访问: http://<本机IP>:8080
默认账号: admin / admin123
         presales / presales123
         sales01 / sales123
```

### 2. 离线部署（生产/内网，无外网）

在有外网的开发机执行：
```bash
pip download -r requirements.txt -d wheels/
# torch CPU 版需单独下载
pip download torch --index-url https://download.pytorch.org/whl/cpu -d wheels/
```

然后将整个项目（含 `wheels/`）拷贝到目标机器，双击 `start.bat` 即可，会自动用 `--no-index --find-links wheels/` 离线安装。

### 3. AI 语义模型

可选。模型放在 `models/all-MiniLM-L6-v2/`：

```
models/
└── all-MiniLM-L6-v2/
    ├── config.json
    ├── pytorch_model.bin / model.safetensors
    ├── tokenizer.json
    ├── tokenizer_config.json
    └── ...（HuggingFace 标准目录结构）
```

未提供模型时 AI 检索会自动回退为关键词检索，不影响其他功能。

模型可从企业内网镜像或离线包获取：HuggingFace 上的 `sentence-transformers/all-MiniLM-L6-v2`（约 90MB）。

---

## 二、默认账号

| 账号        | 密码         | 角色            | 权限                                   |
| ----------- | ------------ | --------------- | -------------------------------------- |
| `admin`     | `admin123`   | 超级管理员      | 全部权限，含用户管理                   |
| `presales`  | `presales123`| 售前管理员      | 资料审核、分类标签、公告、推荐、统计   |
| `sales01`   | `sales123`   | 业务用户        | 浏览、搜索、上传、反馈、个人中心       |

**首次登录后请立即修改密码。**

---

## 三、目录结构

```
SalesTopline/
├── app.py                  # Flask 入口
├── start.bat               # Windows 启动脚本
├── requirements.txt        # Python 依赖
├── README.md
├── modules/                # 后端业务模块（每个文件一个 Blueprint）
│   ├── db.py               # SQLite 连接管理
│   ├── utils.py            # 通用工具（hash、md5、响应封装、日志）
│   ├── auth.py             # /api/auth 登录登出修改密码
│   ├── users.py            # /api/users 用户管理（超管）
│   ├── categories.py       # /api/categories 三级分类树
│   ├── tags.py             # /api/tags 多维度标签
│   ├── materials.py        # /api/materials 资料增删改查 + 审核 + 发布
│   ├── files.py            # /api/files 上传/下载/预览/MD5 去重
│   ├── search.py           # /api/search 关键词 + 语义检索
│   ├── ops.py              # /api/ops 公告 + 推荐位 + 热门/最新
│   ├── feedback.py         # /api/me + /api/feedbacks 个人中心 + 反馈
│   └── stats.py            # /api/stats 数据看板
├── sql/
│   ├── schema.sql          # 数据库结构（15 张表 + 索引 + 触发器）
│   └── seed.sql            # 初始数据（账号 + 9 一级分类 + 二级分类 + 标签 + 欢迎公告）
├── static/                 # 前端 SPA
│   ├── index.html          # 单一挂载点
│   ├── css/main.css        # 样式
│   └── js/
│       ├── api.js          # API 封装
│       ├── utils.js        # 工具函数
│       └── app.js          # SPA 主程序（路由 + 视图）
├── data/                   # 运行时数据（自动创建）
│   ├── app.db              # SQLite 数据库
│   └── files/yyyy/mm/      # 上传文件按月归档
├── models/                 # AI 模型目录（可选）
│   └── all-MiniLM-L6-v2/
├── wheels/                 # 离线 pip 包（可选）
└── .venv/                  # 虚拟环境（首次启动自动创建）
```

---

## 四、功能模块（MVP）

| 模块         | 内容                                                                 |
| ------------ | -------------------------------------------------------------------- |
| 账号管理     | 三级角色，超管可增删改用户、重置密码、停用启用                       |
| 分类标签     | 三级分类树（一级内置不可删）+ 多维度标签（产品/行业/格式/状态/场景）  |
| 上传审核版本 | 业务用户提交 → 售前管理员审核 → 上架/下架/归档；版本管理与历史回看   |
| 搜索筛选     | 顶栏全局搜索 + 列表页分类树/格式/标签筛选 + AI 语义检索               |
| 预览下载     | PDF/图片在线预览 + 其他格式下载，500MB 单文件限制，自动 MD5 去重     |
| 公告推荐     | 多级公告（普通/重要/紧急）+ 首页推荐位                                |
| 个人中心     | 我的收藏 / 浏览历史 / 下载历史 / 我的反馈                            |
| 数据统计     | 总览看板 + 分类分布 + Top10 资料 + 活跃用户 + 30 日趋势 + 操作日志   |

---

## 五、API 速查表

所有接口统一返回：
```json
{ "code": 0, "msg": "ok", "data": {...} }
```

| 模块        | 主要端点                                                       |
| ----------- | -------------------------------------------------------------- |
| 认证        | POST /api/auth/login \| /logout \| /change_password  GET /me   |
| 用户        | GET POST /api/users  PUT DELETE /api/users/{id}  POST /{id}/reset_password |
| 分类        | GET /api/categories/tree \| /top \| /{id}/children  POST PUT DELETE |
| 标签        | GET POST /api/tags  PUT DELETE /api/tags/{id}  POST /api/tags/merge |
| 资料        | GET POST /api/materials  GET /api/materials/admin  GET PUT DELETE /{id}  POST /{id}/audit \| /publish \| /pin \| /version \| /view |
| 文件        | POST /api/files/upload  GET /api/files/{id}/download \| /preview \| /info |
| 搜索        | GET /api/search/keyword  POST /api/search/semantic  POST /api/search/rebuild_index |
| 运营        | GET POST /api/ops/announcements  GET POST DELETE /api/ops/recommendations  GET /api/ops/hot \| /latest |
| 个人        | GET /api/me/views \| /downloads \| /favorites  POST DELETE /api/me/favorites/{mid}  POST GET /api/me/feedbacks |
| 反馈管理    | GET /api/feedbacks  PUT /api/feedbacks/{id}                    |
| 统计        | GET /api/stats/dashboard \| /trend \| /by_category \| /top_materials \| /active_users \| /operation_logs |

---

## 六、权限矩阵

| 操作                 | 业务用户 | 售前管理员 | 超级管理员 |
| -------------------- | :------: | :--------: | :--------: |
| 浏览/搜索/下载/收藏  |    ✓     |     ✓      |     ✓      |
| 上传资料（待审核）   |    ✓     |     ✓      |     ✓      |
| 编辑自己上传的资料   |    ✓     |     ✓      |     ✓      |
| 编辑任意资料         |          |     ✓      |     ✓      |
| 资料审核/上下架/置顶 |          |     ✓      |     ✓      |
| 分类/标签管理        |          |     ✓      |     ✓      |
| 公告/推荐位管理      |          |     ✓      |     ✓      |
| 反馈处理             |          |     ✓      |     ✓      |
| 数据看板/操作日志    |          |     ✓      |     ✓      |
| 用户管理             |          |            |     ✓      |

---

## 七、AI 语义检索说明

- 模型：`sentence-transformers/all-MiniLM-L6-v2`（384 维，多语言友好，约 90MB）
- 索引存储：`material_embeddings` 表，BLOB 列存 float32 向量字节
- 索引构建：
  - 资料审核通过 → 自动生成向量
  - 编辑标题/描述 → 自动重新生成
  - 管理员可在「数据看板」侧调用 `POST /api/search/rebuild_index` 批量重建
- 检索策略：
  - 优先语义检索（cosine 相似度）
  - 若模型未加载或检索失败，自动回退关键词检索（LIKE 模糊匹配）
  - 前端搜索结果页可一键切换两种模式

---

## 八、部署建议

### 单机部署（推荐）
- 一台 Windows 机器，Python 3.8/3.10/3.11 均可
- 内置 Werkzeug 服务器即可应对 50+ 并发用户
- 数据全部本地：`data/app.db` + `data/files/`

### 大并发场景（>200 人）
- 改用 `waitress` 或 `gevent` 替代默认 dev server
- 安装方式：`pip install waitress`，将 `app.py` 末尾的 `app.run(...)` 替换为：
  ```python
  from waitress import serve
  serve(app, host=host, port=port, threads=8)
  ```

### 备份
- 每日定时备份：`data/app.db` 和 `data/files/` 整个目录
- 推荐用 Windows 自带的「任务计划程序」配合 robocopy

---

## 九、常见问题

**Q: 启动报错 "no such table"？**  
A: 删除 `data/app.db` 让程序重新初始化；或确认 `sql/schema.sql` 和 `sql/seed.sql` 文件存在。

**Q: 上传大文件失败？**  
A: 默认上限 500MB。修改 `app.py` 中 `MAX_CONTENT_LENGTH` 调整。

**Q: PDF 预览空白？**  
A: 部分浏览器对 iframe + content-disposition 限制；点击「下载」按钮即可。

**Q: AI 搜索一直回退到关键词？**  
A: 检查 `models/all-MiniLM-L6-v2/` 是否完整；查看启动日志是否有模型加载报错；首次加载较慢（10-30 秒）属正常。

**Q: 端口被占用？**  
A: 设置环境变量后再启动 — `set PORT=9000 && start.bat`

---

## 十、版本与扩展规划

- **v1.0 MVP**（当前版本）— 资料协同 + 搜索 + 审核 + 统计
- **v1.1 计划** — 企微 OAuth 登录 / 站内推送
- **v1.2 计划** — 精准定向推送 / 本地案例库 / 售前论坛

---

如需技术支持，请联系平台管理员。
