import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / 'board_games.csv'


def load_dataset(path: str | None = None) -> list[dict[str, str]]:
    file_path = Path(path or DATA_PATH)
    with file_path.open('r', encoding='utf-8') as handle:
        return list(csv.DictReader(handle))


def clean_dataset(rows: list[dict[str, str]]) -> list[dict[str, object]]:
    cleaned = []
    for row in rows:
        price_value = row.get('currentPrice') if row.get('currentPrice') is not None else row.get('price')
        if price_value in (None, ''):
            price_value = 0
        cleaned_row = {
            'id': row.get('id') or row.get('productId') or row.get('sp_ma') or row.get('game_id'),
            'name': (row.get('name') or '').strip(),
            'category': (row.get('category') or row.get('family') or 'Khác').strip(),
            'players': str(row.get('players') or f"{row.get('min_players') or 0}-{row.get('max_players') or 0}").replace(' ', ''),
            'age': str(row.get('age') or row.get('min_age') or '0').strip(),
            'play_time': str(row.get('play_time') or row.get('playing_time') or row.get('playTime') or row.get('max_playtime') or '0').strip(),
            'price': float(str(price_value).replace(',', '')),
            'description': (row.get('description') or '').strip(),
            'difficulty': (row.get('difficulty') or 'Trung bình').strip(),
            'tags': (row.get('tags') or row.get('mechanic') or '').strip(),
        }
        cleaned.append(cleaned_row)
    return cleaned


def encode_features(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    category_map = {value: index for index, value in enumerate(sorted({row['category'] for row in rows}))}
    difficulty_map = {value: index for index, value in enumerate(sorted({row['difficulty'] for row in rows}))}

    encoded = []
    for row in rows:
        players_text = str(row['players'])
        players_value = 0
        for token in players_text.split('-'):
            if token.isdigit():
                players_value = int(token)
                break
        encoded.append({
            **row,
            'category_code': category_map[row['category']],
            'difficulty_code': difficulty_map[row['difficulty']],
            'players_code': players_value,
            'tags_code': len(str(row['tags'])),
            'age_value': float(str(row['age']).replace('+', '')) if str(row['age']).replace('+', '').isdigit() else 0,
            'play_time_value': float(str(row['play_time']).replace('+', '')) if str(row['play_time']).replace('+', '').isdigit() else 0,
        })
    return encoded


def prepare_dataset(path: str | None = None) -> list[dict[str, object]]:
    rows = load_dataset(path)
    cleaned = clean_dataset(rows)
    return encode_features(cleaned)


def prepare_product_dataset(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return encode_features(clean_dataset(rows))
