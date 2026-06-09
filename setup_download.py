"""
setup_download.py - Download missing wheels and model files.
Called by setup.bat.
"""
import sys
import os
import ssl
import subprocess
import urllib.request
import urllib.error
import socket

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
WHEELS_DIR = os.path.join(BASE_DIR, 'wheels')
MODEL_DIR  = os.path.join(BASE_DIR, 'models', 'all-MiniLM-L6-v2')

PYPI_MIRRORS = [
    'https://mirrors.aliyun.com/pypi/simple',
    'https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple',
    'https://mirrors.huaweicloud.com/repository/pypi/simple',
    'https://mirrors.bfsu.edu.cn/pypi/web/simple',
    'https://pypi.mirrors.ustc.edu.cn/simple',
]

# python version string for pip download (must be digits like 3.10, not cp310)
PY_VERSION = '{}.{}'.format(sys.version_info.major, sys.version_info.minor)

REQUIRED_WHEELS = [
    # (pkg_name,          version_constraint,      needs_binary)
    ('regex',             None,                     True),
    ('safetensors',       None,                     True),
    ('tokenizers',        '>=0.22.0,<=0.23.0',      True),
    ('exceptiongroup',    None,                     False),
]

MODEL_ID    = 'sentence-transformers/all-MiniLM-L6-v2'
MODEL_FILES = [
    'modules.json',
    'config.json',
    'tokenizer_config.json',
    'tokenizer.json',
    'special_tokens_map.json',
    'vocab.txt',
    'sentence_bert_config.json',
    '1_Pooling/config.json',
]
WEIGHT_CANDIDATES = ['model.safetensors', 'pytorch_model.bin']
MODEL_BASES = [
    'https://modelscope.cn/models/sentence-transformers/all-MiniLM-L6-v2/resolve/master',
    'https://hf-mirror.com/sentence-transformers/all-MiniLM-L6-v2/resolve/main',
]


# ── network helpers ───────────────────────────────────────────────────────────

def can_reach(host, port=443, timeout=6):
    try:
        socket.setdefaulttimeout(timeout)
        socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect((host, port))
        return True
    except Exception:
        return False


def find_working_mirror(mirrors):
    for m in mirrors:
        host = m.split('/')[2]
        if can_reach(host):
            return m
    return None


def file_ok(path):
    return os.path.exists(path) and os.path.getsize(path) > 0


def http_get(url, dest):
    ctx = ssl._create_unverified_context()
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Referer': 'https://modelscope.cn/',
    }
    tmp = dest + '.tmp'
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=ctx, timeout=180) as resp, \
                open(tmp, 'wb') as f:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                f.write(chunk)
        os.replace(tmp, dest)
        return True
    except Exception:
        if os.path.exists(tmp):
            try: os.remove(tmp)
            except: pass
        return False


# ── wheel helpers ─────────────────────────────────────────────────────────────

def wheel_present(pkg_name):
    low = pkg_name.lower().replace('-', '_')
    for f in os.listdir(WHEELS_DIR):
        fn = f.lower().replace('-', '_')
        if fn.startswith(low + '-') or fn.startswith(low.replace('_','') + '-'):
            return True
    return False


def pip_download(pkg_spec, mirror, binary=True):
    cmd = [
        sys.executable, '-m', 'pip', 'download',
        pkg_spec,
        '--index-url', mirror,
        '--dest', WHEELS_DIR,
        '--no-deps',
        '--quiet',
    ]
    if binary:
        cmd += [
            '--python-version', PY_VERSION,
            '--platform', 'win_amd64',
            '--only-binary', ':all:',
        ]
    try:
        subprocess.check_call(cmd, timeout=120)
        return True
    except Exception:
        return False


# ── wheel download ─────────────────────────────────────────────────────────────

def download_wheels():
    os.makedirs(WHEELS_DIR, exist_ok=True)

    print('  Detecting working PyPI mirror...')
    mirror = find_working_mirror(PYPI_MIRRORS)
    if not mirror:
        print('  [ERROR] Cannot reach any PyPI mirror.')
        print('          Check network: mirrors.aliyun.com, mirrors.tuna.tsinghua.edu.cn')
        return False
    print('  Using mirror: {}'.format(mirror))
    print()

    failed = []
    for pkg, constraint, binary in REQUIRED_WHEELS:
        if wheel_present(pkg):
            print('  Skip {} (already present)'.format(pkg))
            continue

        spec = pkg + constraint if constraint else pkg
        print('  Downloading {} ...'.format(spec), end=' ', flush=True)
        if pip_download(spec, mirror, binary):
            print('OK')
        else:
            # retry as pure-python if binary failed
            if binary and pip_download(spec, mirror, binary=False):
                print('OK (pure-python fallback)')
            else:
                print('FAILED')
                failed.append(pkg)

    if failed:
        print()
        print('  [ERROR] Failed wheels: {}'.format(', '.join(failed)))
        return False

    count = len([f for f in os.listdir(WHEELS_DIR) if f.endswith('.whl')])
    print()
    print('  [OK] Wheels ready ({} files)'.format(count))
    return True


# ── model download ─────────────────────────────────────────────────────────────

def hf_hub_download(local_dir):
    """Try huggingface_hub snapshot_download (uses requests, handles proxy/redirect)."""
    try:
        try:
            from huggingface_hub import snapshot_download
        except ImportError:
            subprocess.check_call([
                sys.executable, '-m', 'pip', 'install',
                '--quiet', '--no-index',
                '--find-links', WHEELS_DIR,
                'huggingface_hub',
            ])
            from huggingface_hub import snapshot_download

        for endpoint in ['https://hf-mirror.com', 'https://huggingface.co']:
            host = endpoint.split('/')[2]
            if not can_reach(host):
                print('    {} unreachable, skipping'.format(host))
                continue
            print('    Trying {} ...'.format(endpoint), end=' ', flush=True)
            try:
                os.environ['HF_ENDPOINT'] = endpoint
                snapshot_download(
                    repo_id=MODEL_ID,
                    local_dir=local_dir,
                    local_dir_use_symlinks=False,
                    ignore_patterns=['*.msgpack','*.h5','flax_model*','tf_model*','rust_model*','*.ot'],
                )
                print('OK')
                return True
            except Exception as e:
                print('failed ({})'.format(str(e)[:60]))
    except Exception as e:
        print('    huggingface_hub error: {}'.format(e))
    return False


def direct_download_missing(local_dir):
    """Download still-missing files directly via urllib (modelscope + hf-mirror)."""
    needed = list(MODEL_FILES)
    weight_ok = any(file_ok(os.path.join(local_dir, w)) for w in WEIGHT_CANDIDATES)
    if not weight_ok:
        needed += WEIGHT_CANDIDATES

    missing = [f for f in needed if not file_ok(os.path.join(local_dir, f.replace('/', os.sep)))]

    # drop extra weight candidates if one already downloaded
    weight_ok = any(file_ok(os.path.join(local_dir, w)) for w in WEIGHT_CANDIDATES)
    if weight_ok:
        missing = [f for f in missing if f not in WEIGHT_CANDIDATES]

    if not missing:
        return []

    print('  Direct download for: {}'.format(', '.join(missing)))
    still_missing = []
    for f in missing:
        dest = os.path.join(local_dir, f.replace('/', os.sep))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        print('    {} ...'.format(f), end=' ', flush=True)
        ok = False
        for base in MODEL_BASES:
            if http_get(base + '/' + f, dest):
                print('OK ({}KB)'.format(os.path.getsize(dest) // 1024))
                ok = True
                break
            print('failed,', end=' ', flush=True)
        if not ok:
            print('FAILED')
            still_missing.append(f)
    return still_missing


def download_model():
    os.makedirs(MODEL_DIR, exist_ok=True)
    os.makedirs(os.path.join(MODEL_DIR, '1_Pooling'), exist_ok=True)

    print('  Trying huggingface_hub...')
    hf_hub_download(MODEL_DIR)

    print('  Checking remaining files...')
    still_missing = direct_download_missing(MODEL_DIR)

    # final verdict
    final_missing = [f for f in MODEL_FILES
                     if not file_ok(os.path.join(MODEL_DIR, f.replace('/', os.sep)))]
    weight_ok = any(file_ok(os.path.join(MODEL_DIR, w)) for w in WEIGHT_CANDIDATES)
    if not weight_ok:
        final_missing.append('model weights')

    if final_missing:
        print()
        print('  [WARN] Missing: {}'.format(', '.join(final_missing)))
        print('  App will use keyword search fallback. Run setup.bat again to retry.')
        return False

    print()
    print('  [OK] Model ready: {}'.format(MODEL_DIR))
    return True


# ── entry ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    mode_wheels = '--wheels' in sys.argv
    mode_model  = '--model'  in sys.argv

    if not mode_wheels and not mode_model:
        print('Usage: python setup_download.py --wheels | --model')
        sys.exit(1)

    ok = True
    if mode_wheels:
        ok = download_wheels() and ok
    if mode_model:
        ok = download_model() and ok

    sys.exit(0 if ok else 1)
