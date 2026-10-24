from collections import OrderedDict
from copy import deepcopy
from datetime import timedelta
from time import monotonic

from .models import SourceResult


class TTLCache:
    def __init__(self, ttl: int = 900, capacity: int = 256):
        self.ttl, self.capacity = ttl, capacity
        self.items: OrderedDict[str, tuple[float, SourceResult]] = OrderedDict()

    def get(self, key: str):
        item = self.items.get(key)
        if item is None or monotonic() >= item[0]:
            self.items.pop(key, None)
            return None
        self.items.move_to_end(key)
        result = deepcopy(item[1])
        result.cached = True
        return result

    def put(self, key: str, value: SourceResult):
        if value.status in {"error", "unavailable"}:
            return
        value.expiresAt = value.checkedAt + timedelta(seconds=self.ttl)
        self.items[key] = (monotonic() + self.ttl, deepcopy(value))
        self.items.move_to_end(key)
        while len(self.items) > self.capacity:
            self.items.popitem(last=False)
