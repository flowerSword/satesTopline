"""
售前头条 SalesTopline - Flask 应用入口
启动：python app.py
访问：http://localhost:8080 （局域网内其他机器：http://<本机IP>:8080）
"""
import os
import sys
from datetime import timedelta
from flask import Flask, send_from_directory, session

# 让 modules 包可被导入
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from modules.db import init_db, close_db
from modules.auth import bp as auth_bp
from modules.users import bp as users_bp
from modules.categories import bp as categories_bp
from modules.tags import bp as tags_bp
from modules.materials import bp as materials_bp
from modules.files import bp as files_bp
from modules.search import bp as search_bp
from modules.ops import bp as ops_bp
from modules.feedback import bp as me_bp, admin_bp as feedback_admin_bp
from modules.stats import bp as stats_bp


def create_app():
    app = Flask(__name__, static_folder='static', static_url_path='')

    # 配置
    app.config.update(
        SECRET_KEY=os.environ.get('SECRET_KEY', 'salestopline-change-me-in-prod'),
        PERMANENT_SESSION_LIFETIME=timedelta(days=7),
        MAX_CONTENT_LENGTH=500 * 1024 * 1024,  # 500MB 单请求上限
        JSON_AS_ASCII=False,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
    )

    # 注册蓝图
    app.register_blueprint(auth_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(categories_bp)
    app.register_blueprint(tags_bp)
    app.register_blueprint(materials_bp)
    app.register_blueprint(files_bp)
    app.register_blueprint(search_bp)
    app.register_blueprint(ops_bp)
    app.register_blueprint(me_bp)
    app.register_blueprint(feedback_admin_bp)
    app.register_blueprint(stats_bp)

    # 请求结束关闭数据库连接
    app.teardown_appcontext(close_db)

    # 静态根：返回 index.html（PC端）
    @app.route('/')
    def index():
        return send_from_directory('static', 'index.html')

    # 手机端入口
    @app.route('/mobile')
    @app.route('/mobile/')
    def mobile():
        return send_from_directory('static/mobile', 'index.html')

    # 兜底：未匹配路径返回 index.html（前端路由）
    @app.errorhandler(404)
    def not_found(e):
        from flask import request
        if request.path.startswith('/api/'):
            return {'code': 404, 'msg': '接口不存在'}, 404
        return send_from_directory('static', 'index.html')

    @app.errorhandler(413)
    def too_large(e):
        return {'code': 413, 'msg': '上传文件超过 500MB 限制'}, 413

    @app.errorhandler(Exception)
    def handle_exception(e):
        import traceback
        traceback.print_exc()
        return {'code': 500, 'msg': f'服务异常: {e}'}, 500

    return app


def _check_ai_model():
    """启动时检测 AI 语义模型状态，给出明确提示"""
    import os
    model_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models', 'all-MiniLM-L6-v2')
    model_exists = os.path.isdir(model_dir) and os.path.exists(os.path.join(model_dir, 'modules.json'))

    if not model_exists:
        print('[AI]  语义模型未找到，AI 搜索将回退到关键词模式')
        print(f'      如需启用：将模型文件放到 models/all-MiniLM-L6-v2/')
        return

    # 模型文件存在，尝试导入
    try:
        import sentence_transformers  # noqa
        import numpy  # noqa
        print('[AI]  模型文件就绪，首次搜索时自动加载（约10-30秒）')
        print(f'      模型路径: {model_dir}')
    except ImportError as e:
        missing = str(e).split("'")[1] if "'" in str(e) else str(e)
        print(f'[AI]  模型文件存在，但缺少 Python 依赖: {missing}')
        print( '      请运行: .venv\\Scripts\\python.exe -m pip install sentence-transformers torch numpy')
        print( '      （如有 wheels 目录：pip install --no-index --find-links wheels sentence-transformers torch numpy）')



def main():
    print('=' * 60)
    print('  售前头条 SalesTopline v1.0')
    print('=' * 60)
    print('正在初始化数据库...')
    init_db()
    print('数据库准备就绪')

    # AI 语义模型检测
    _check_ai_model()

    # 文件目录
    files_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'files')
    os.makedirs(files_dir, exist_ok=True)

    app = create_app()
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 8080))

    # 显示本机内网 IP，方便其他机器访问
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = '127.0.0.1'

    print('-' * 60)
    print(f'  本机访问: http://127.0.0.1:{port}')
    print(f'  局域网访问: http://{local_ip}:{port}')
    print(f'  默认账号: admin / admin123')
    print(f'           presales / presales123')
    print(f'           sales01 / sales123')
    print('-' * 60)
    print('按 Ctrl+C 退出服务')
    print()

    app.run(host=host, port=port, debug=False, threaded=True)


if __name__ == '__main__':
    main()
