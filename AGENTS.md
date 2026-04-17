# Repository Guidelines

## Project Structure & Module Organization
This repository is currently a bootstrap workspace with no application files yet. Keep the root minimal and organize new code with this layout:
- `src/canteen/`: application modules
- `tests/`: automated tests mirroring `src/`
- `assets/`: static files (images, fixtures, sample data)
- `scripts/`: local automation helpers
- `docs/`: design notes and architecture decisions

Example path pattern: `src/canteen/orders/service.py` with tests in `tests/orders/test_service.py`.

## Build, Test, and Development Commands
Standardize local development around Python tooling:
- `python -m venv .venv`: create virtual environment
- `.\\.venv\\Scripts\\Activate.ps1`: activate environment (PowerShell)
- `pip install -r requirements-dev.txt`: install runtime and dev dependencies
- `pytest -q`: run test suite
- `ruff check .`: run linting
- `ruff format .`: apply code formatting

If you introduce another stack, add equivalent commands in `README.md` and keep this file updated.

## Coding Style & Naming Conventions
- Use 4-space indentation and UTF-8 text files.
- Prefer type hints for public functions and module-level constants.
- Use `snake_case` for files, functions, and variables.
- Use `PascalCase` for classes and `UPPER_SNAKE_CASE` for constants.
- Keep modules focused; avoid large multi-purpose files.

## Testing Guidelines
- Use `pytest` with files named `test_*.py`.
- Mirror source structure in `tests/`.
- Add a regression test for every bug fix.
- Target at least 80% line coverage for core modules.

Coverage example: `pytest --cov=src --cov-report=term-missing`.

## Commit & Pull Request Guidelines
Git history is not initialized yet, so adopt this convention from the start:
- Commit format: `type(scope): short summary` (for example, `feat(api): add order endpoint`).
- Keep commits atomic and focused on one logical change.
- PRs should include: purpose, linked issue (`#123`), test evidence, and screenshots for UI changes.
- Merge only after lint and tests pass.

## Security & Configuration Tips
- Never commit secrets, tokens, or local credentials.
- Store local settings in `.env` and provide safe defaults in `.env.example`.
- Ignore generated artifacts such as `.venv/`, `__pycache__/`, and coverage outputs.
