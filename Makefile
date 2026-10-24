.PHONY: backend extension test format
backend:
	cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
extension:
	cd extension && npm run build
test:
	cd backend && uv run pytest -q && uv run ruff check . && uv run ruff format --check .
	cd extension && npm run test && npm run typecheck && npm run lint && npm run format:check && npm run build
format:
	cd backend && uv run ruff format .
	cd extension && npm run format
