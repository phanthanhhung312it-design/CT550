import math
import pickle
from pathlib import Path

from preprocess import prepare_dataset

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / 'model' / 'knn_model.pkl'


class SimpleKNN:
    def __init__(self, n_neighbors: int = 5):
        self.n_neighbors = n_neighbors
        self.dataset = []

    def fit(self, dataset: list[dict[str, object]]):
        self.dataset = dataset

    def _distance(self, left: list[float], right: list[float]) -> float:
        return math.sqrt(sum((a - b) ** 2 for a, b in zip(left, right)))

    def kneighbors(self, vector: list[float], n_neighbors: int | None = None):
        if not self.dataset:
            return [], []
        limit = n_neighbors or self.n_neighbors
        distances = []
        for index, row in enumerate(self.dataset):
            row_vector = [
                float(row.get('players_code') or 0) / 10,
                float(row.get('age_value') or 0) / 18,
                float(row.get('play_time_value') or 0) / 240,
                float(row.get('category_code') or 0) / 10,
                float(row.get('difficulty_code') or 0) / 3,
                float(row.get('price') or 0) / 1000000,
                float(row.get('tags_code') or 0) / 100,
            ]
            distances.append((self._distance(vector, row_vector), index))
        distances.sort(key=lambda item: item[0])
        top_items = distances[:limit]
        return [distance for distance, _ in top_items], [index for _, index in top_items]


def train_model(path: str | None = None):
    dataset = prepare_dataset(path)
    model = SimpleKNN(n_neighbors=5)
    model.fit(dataset)
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    with MODEL_PATH.open('wb') as handle:
        pickle.dump({'model': model, 'dataset': dataset}, handle)
    return model


if __name__ == '__main__':
    train_model()
