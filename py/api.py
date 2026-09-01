import json
import subprocess
import sys
from pathlib import Path

from chatbot import create_reply

ROOT = Path(__file__).resolve().parent


def ensure_python_environment():
    if not (ROOT / 'model' / 'knn_model.pkl').exists():
        subprocess.run([sys.executable, str(ROOT / 'train_knn.py')], check=True, cwd=str(ROOT))


def handle_chat(message: str, top_k: int = 5) -> dict:
    return create_reply(message, products=None, top_k=top_k)


if __name__ == '__main__':
    stdin_payload = json.loads(sys.stdin.read() or '{}')
    incoming_message = stdin_payload.get('message') or (sys.argv[1] if len(sys.argv) > 1 else 'Xin chào')
    requested_top_k = int(stdin_payload.get('top_k') or 20)
    print(json.dumps(create_reply(
        incoming_message,
        catalog_names=stdin_payload.get('catalog_names'),
        top_k=requested_top_k,
    )))
