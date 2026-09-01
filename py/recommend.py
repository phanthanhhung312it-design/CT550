from pathlib import Path
from typing import Any

from preprocess import prepare_dataset, prepare_product_dataset
from train_knn import SimpleKNN

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / 'model' / 'knn_model.pkl'


def load_dataset() -> list[dict[str, object]]:
    return prepare_dataset()


def build_input_vector(preferences: dict[str, Any]) -> list[float]:
    players = int(preferences.get('players') or 0)
    age = float(preferences.get('age') or 0)
    play_time = float(preferences.get('play_time') or 0)
    category = str(preferences.get('category') or '').lower()
    difficulty = str(preferences.get('difficulty') or '').lower()
    budget_value = preferences.get('budget')
    if isinstance(budget_value, dict):
        budget = float(budget_value.get('max') or budget_value.get('min') or 0)
    else:
        budget = float(budget_value or 0)

    category_code = 0
    difficulty_code = 0
    if category in {'chiến lược', 'chien luoc', 'chiến-thuật'}:
        category_code = 0
    elif category in {'gia đình', 'gia dinh'}:
        category_code = 1
    elif category in {'logic'}:
        category_code = 2
    elif category in {'party'}:
        category_code = 3
    elif category in {'suy luận', 'suy luan'}:
        category_code = 4
    elif category in {'kinh tế', 'kinh te'}:
        category_code = 5
    elif category in {'hợp tác', 'hop tac'}:
        category_code = 6

    if difficulty in {'dễ', 'de'}:
        difficulty_code = 0
    elif difficulty in {'trung bình', 'trung binh'}:
        difficulty_code = 1
    elif difficulty in {'khó', 'kho'}:
        difficulty_code = 2

    return [
        players / 10,
        age / 18,
        play_time / 240,
        category_code / 10,
        difficulty_code / 3,
        budget / 1000000,
        0,
    ]


def player_range(value: object) -> tuple[int, int]:
    numbers = [int(item) for item in str(value or '').replace('+', '').split('-') if item.isdigit()]
    if not numbers:
        return 0, 0
    return numbers[0], numbers[-1] if len(numbers) > 1 else numbers[0]


def matches_preferences(row: dict[str, object], preferences: dict[str, Any]) -> bool:
    players = preferences.get('players')
    if players:
        minimum, maximum = player_range(row.get('players'))
        if not (minimum <= int(players) <= maximum):
            return False

    budget = preferences.get('budget')
    if budget and isinstance(budget, dict):
        current_price = float(row.get('currentPrice') or row.get('price') or 0)
        if not (float(budget.get('min', 0)) <= current_price <= float(budget.get('max', float('inf')))):
            return False

    difficulty = preferences.get('difficulty')
    if difficulty and str(row.get('difficulty') or '').lower() != str(difficulty).lower():
        return False

    return True


def enrich_recommendations_with_mongo(recommendations: list[dict[str, Any]], mongo_lookup: Any | None = None) -> list[dict[str, Any]]:
    if not recommendations or mongo_lookup is None:
        return recommendations

    enriched = []
    for item in recommendations:
        product = mongo_lookup(item.get('id'), item.get('name'))
        if not product:
            enriched.append({**item, 'source': 'knn-csv'})
            continue

        enriched.append({
            **item,
            'productId': product.get('id') or item.get('id'),
            'name': product.get('name') or item.get('name'),
            'price': product.get('currentPrice') or product.get('price') or 0,
            'category': product.get('category'),
            'image': product.get('image'),
            'rating': product.get('rating'),
            'reviews': product.get('reviews'),
            'stock': product.get('stock'),
            'source': 'mongodb-enriched',
        })
    return enriched


def recommend_games(
    preferences: dict[str, Any],
    top_k: int = 5,
    catalog_names: list[str] | None = None,
    mongo_lookup: Any | None = None,
) -> list[dict[str, Any]]:
    """Pipeline gợi ý game theo thứ tự:
    1) CSV -> chuẩn hóa dữ liệu
    2) KNN -> tạo vector và tìm Top K gần nhất
    3) nếu có catalog_names -> lọc theo tên sản phẩm thực tế
    4) nếu có mongo_lookup -> enrich candidate bằng MongoDB
    5) fallback về dữ liệu CSV nếu MongoDB chưa sẵn sàng.
    """
    dataset = load_dataset()
    if catalog_names:
        catalog_name_set = {str(name).strip().casefold() for name in catalog_names}
        dataset = [row for row in dataset if str(row.get('name') or '').strip().casefold() in catalog_name_set]

    if not dataset:
        return []

    feature_vector = build_input_vector(preferences)
    model = SimpleKNN(n_neighbors=top_k)
    model.fit(dataset)
    distances, indices = model.kneighbors(feature_vector, n_neighbors=min(top_k, len(dataset)))
    recommendations = []
    for distance, index in zip(distances, indices):
        row = dataset[index]
        recommendations.append({
            'id': int(row['id']) if str(row.get('id') or '').isdigit() else index + 1,
            'name': row['name'],
            'score': round(float(max(0, 100 - distance * 10)), 1),
            'source': 'knn-csv',
        })

    recommendations = recommendations[:top_k]
    if mongo_lookup is not None:
        return enrich_recommendations_with_mongo(recommendations, mongo_lookup)
    return recommendations
