"""Create fresh submission archives from explicit public-source paths; never overwrite."""

import hashlib
import json
from datetime import datetime
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "extension/package.json").read_text())["version"]
STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")
OUT = ROOT / "submission/artifacts"


def main():
    built = ROOT / "extension/.output/chrome-mv3"
    manifest = built / "manifest.json"
    if not manifest.exists():
        raise SystemExit("Build the extension first: cd extension && npm run build")
    data = json.loads(manifest.read_text())
    if data.get("version") != VERSION or data.get("manifest_version") != 3:
        raise SystemExit(
            "Built manifest is stale or unsupported; rebuild before packaging"
        )
    OUT.mkdir(exist_ok=True)
    extension_zip = OUT / f"CheckoutGuard-v{VERSION}-chrome-{STAMP}.zip"
    source_zip = OUT / f"CheckoutGuard-v{VERSION}-source-{STAMP}.zip"
    with ZipFile(extension_zip, "x", ZIP_DEFLATED) as archive:
        for path in sorted(built.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(built))

    selected = set()
    for name in [
        "README.md",
        "Makefile",
        ".gitignore",
        ".editorconfig",
        "archive/README.md",
        "backend/pyproject.toml",
        "backend/uv.lock",
        "backend/.env.example",
        "extension/package.json",
        "extension/package-lock.json",
        "extension/.env.example",
        "extension/.prettierrc.json",
        "extension/.prettierignore",
    ]:
        selected.add(ROOT / name)
    for folder in [
        "backend/app",
        "backend/tests",
        "extension/entrypoints",
        "extension/lib",
        "extension/public",
        "extension/tests",
        "extension/scripts",
        "docs",
        "scripts",
    ]:
        for path in (ROOT / folder).rglob("*"):
            if (
                path.is_file()
                and path.suffix
                in {
                    ".py",
                    ".ts",
                    ".tsx",
                    ".js",
                    ".mjs",
                    ".json",
                    ".html",
                    ".css",
                    ".md",
                    ".png",
                    ".svg",
                }
                and not any(
                    p in {"__pycache__", "node_modules", ".venv", ".git"}
                    for p in path.relative_to(ROOT).parts
                )
            ):
                selected.add(path)
    for name in [
        "wxt.config.ts",
        "vitest.config.ts",
        "vite.preview.config.ts",
        "tsconfig.json",
        "tsconfig.ui.json",
        "tailwind.config.js",
        "postcss.config.js",
        "eslint.config.js",
        "preview.html",
    ]:
        selected.add(ROOT / "extension" / name)
    selected.update((ROOT / "submission").glob("*.md"))
    selected.update((ROOT / "submission").glob("cover.*"))
    selected = {p for p in selected if p.is_file()}
    for path in selected:
        if path.name == ".env" or path.name.endswith(".key") or path.is_symlink():
            raise SystemExit(f"Refusing private/symlink path: {path.relative_to(ROOT)}")
    with ZipFile(source_zip, "x", ZIP_DEFLATED) as archive:
        for path in sorted(selected):
            archive.write(path, Path("CheckoutGuard") / path.relative_to(ROOT))
    checksum = OUT / f"SHA256SUMS-{STAMP}.txt"
    with checksum.open("x") as file:
        for path in [extension_zip, source_zip]:
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            file.write(f"{digest}  {path.name}\n")
            print(f"{path.relative_to(ROOT)} ({path.stat().st_size:,} bytes)")
    print(checksum.relative_to(ROOT))


if __name__ == "__main__":
    main()
