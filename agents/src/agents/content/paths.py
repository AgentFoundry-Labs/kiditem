from __future__ import annotations

import pathlib
import shutil

import structlog

logger = structlog.get_logger()

_PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[4]

DATA_DIR = _PROJECT_ROOT / "data"
PRODUCTS_DIR = DATA_DIR / "products"
IMAGES_DIR = DATA_DIR / "images"
PAGES_DIR = DATA_DIR / "pages"
ASSETS_DIR = _PROJECT_ROOT / "assets"
FONTS_DIR = ASSETS_DIR / "fonts"


def product_images_dir(product_id: str) -> pathlib.Path:
    d = PRODUCTS_DIR / product_id / "images"
    d.mkdir(parents=True, exist_ok=True)
    return d


def product_edited_dir(product_id: str) -> pathlib.Path:
    d = PRODUCTS_DIR / product_id / "images" / "edited"
    d.mkdir(parents=True, exist_ok=True)
    return d


def product_pages_dir(product_id: str) -> pathlib.Path:
    d = PRODUCTS_DIR / product_id / "pages"
    d.mkdir(parents=True, exist_ok=True)
    return d


def to_processed_url(file_path: pathlib.Path) -> str:
    relative = file_path.relative_to(PRODUCTS_DIR)
    return f"/processed/{relative}"


def cleanup_product_artifacts(product_id: str) -> None:
    product_dir = PRODUCTS_DIR / product_id
    if product_dir.exists():
        shutil.rmtree(product_dir)
        logger.info("Cleaned up product artifacts", product_id=product_id)
