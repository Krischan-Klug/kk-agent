"""Trusted local document ingestion and retrieval worker for KK-Agent.

The Node host owns paths, limits, process lifetime, and session cleanup.  This
worker delegates document understanding, chunking, embeddings, and retrieval to
the pinned upstream libraries started by the host through uvx.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import traceback
from pathlib import Path
from typing import Any

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
logging.basicConfig(stream=sys.stderr, level=logging.WARNING)

PROTOCOL_VERSION = 1
EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

_converter: Any = None
_chunker: Any = None
_embedder: Any = None


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write("KK_RAG " + json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def converter() -> Any:
    global _converter
    if _converter is None:
        from docling.document_converter import DocumentConverter

        _converter = DocumentConverter()
    return _converter


def chunker() -> Any:
    global _chunker
    if _chunker is None:
        from docling.chunking import HybridChunker

        _chunker = HybridChunker()
    return _chunker


def embedder() -> Any:
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer

        _embedder = SentenceTransformer(EMBEDDING_MODEL, device="cpu")
    return _embedder


def safe_asset_paths(raw_asset_dir: str, raw_source_path: str | None = None) -> tuple[Path, Path | None]:
    asset_dir = Path(raw_asset_dir).resolve(strict=True)
    if not asset_dir.is_dir():
        raise ValueError("asset_dir must be an existing directory")
    source_path = Path(raw_source_path).resolve(strict=True) if raw_source_path else None
    if source_path is not None and source_path.parent != asset_dir:
        raise ValueError("source_path must be a direct child of asset_dir")
    return asset_dir, source_path


def chunk_locator(headings: list[str], pages: list[int], index: int) -> str:
    parts: list[str] = []
    if pages:
        parts.append("pages:" + ",".join(str(page) for page in pages))
    if headings:
        parts.append("section:" + " > ".join(headings))
    return "; ".join(parts) or f"chunk:{index}"


def ingest(request: dict[str, Any]) -> dict[str, Any]:
    asset_dir, source_path = safe_asset_paths(request["assetDir"], request["sourcePath"])
    assert source_path is not None

    plain_text = bool(request.get("plainText"))
    conversion_path = source_path
    shadow_path: Path | None = None
    if plain_text:
        raw_text = source_path.read_text(encoding="utf-8").lstrip("\ufeff")
        if source_path.suffix.lower() == ".rtf":
            from striprtf.striprtf import rtf_to_text

            raw_text = rtf_to_text(raw_text)
            markdown = raw_text.strip()
        else:
            markdown = raw_text
        shadow_path = asset_dir / ".docling-source.md"
        shadow_path.write_text(markdown, encoding="utf-8")
        conversion_path = shadow_path
    try:
        document = converter().convert(conversion_path).document
    finally:
        if shadow_path is not None:
            shadow_path.unlink(missing_ok=True)
    if not plain_text:
        markdown = document.export_to_markdown().strip()
    doc_chunker = chunker()
    chunks: list[dict[str, Any]] = []
    for index, chunk in enumerate(doc_chunker.chunk(document)):
        headings = [str(value) for value in (chunk.meta.headings or []) if str(value).strip()]
        pages = sorted(
            {
                int(provenance.page_no)
                for item in chunk.meta.doc_items
                for provenance in (item.prov or [])
                if provenance.page_no is not None
            }
        )
        text = doc_chunker.contextualize(chunk).strip()
        if text:
            chunks.append(
                {
                    "chunk_index": index,
                    "locator": chunk_locator(headings, pages, index),
                    "text": text,
                    "headings": json.dumps(headings, ensure_ascii=False),
                    "pages": json.dumps(pages),
                }
            )

    if not markdown and chunks:
        markdown = "\n\n".join(chunk["text"] for chunk in chunks)
    (asset_dir / "content.txt").write_text(markdown, encoding="utf-8")

    index_dir = asset_dir / "retrieval.lance"
    if chunks:
        vectors = embedder().encode(
            [chunk["text"] for chunk in chunks],
            batch_size=32,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        for chunk, vector in zip(chunks, vectors, strict=True):
            chunk["vector"] = vector.astype("float32").tolist()

        import lancedb
        from lancedb.index import FTS

        database = lancedb.connect(index_dir)
        table = database.create_table("chunks", chunks, mode="overwrite")
        table.create_index(
            "text",
            config=FTS(lower_case=True, stem=False, remove_stop_words=False, ascii_folding=True),
        )

    page_count = len(document.pages) if getattr(document, "pages", None) else 0
    return {
        "textAvailable": bool(markdown.strip()),
        "chunkCount": len(chunks),
        "pageCount": page_count,
        "embeddingModel": EMBEDDING_MODEL,
    }


def search(request: dict[str, Any]) -> dict[str, Any]:
    asset_dir, _ = safe_asset_paths(request["assetDir"])
    query = str(request["query"]).strip()
    if not query or len(query) > 4096:
        raise ValueError("query must contain between 1 and 4096 characters")
    limit = max(1, min(25, int(request.get("limit", 10))))
    index_dir = asset_dir / "retrieval.lance"
    if not index_dir.is_dir():
        return {"matches": []}

    import lancedb
    from lancedb.rerankers import RRFReranker

    query_vector = embedder().encode(query, normalize_embeddings=True, show_progress_bar=False)
    table = lancedb.connect(index_dir).open_table("chunks")
    selected = ["chunk_index", "locator", "text", "headings", "pages"]
    try:
        rows = (
            table.search(query_type="hybrid", vector_column_name="vector", fts_columns="text")
            .vector(query_vector.astype("float32").tolist())
            .text(query)
            .rerank(RRFReranker())
            .select(selected)
            .limit(limit)
            .to_list()
        )
    except Exception:
        # Tantivy query syntax must never make semantic document search unusable.
        rows = (
            table.search(query_vector.astype("float32").tolist(), vector_column_name="vector")
            .select(selected)
            .limit(limit)
            .to_list()
        )
    matches = [
        {
            "index": int(row["chunk_index"]),
            "locator": str(row["locator"]),
            "text": str(row["text"]),
            "headings": json.loads(row["headings"]),
            "pages": json.loads(row["pages"]),
            "score": float(
                row.get("_relevance_score")
                if row.get("_relevance_score") is not None
                else 1.0 / (1.0 + max(0.0, float(row.get("_distance", 0.0))))
            ),
        }
        for row in rows
    ]
    return {"matches": matches, "embeddingModel": EMBEDDING_MODEL}


def handle(request: dict[str, Any]) -> dict[str, Any]:
    action = request.get("action")
    if action == "ingest":
        return ingest(request)
    if action == "search":
        return search(request)
    if action == "shutdown":
        raise SystemExit(0)
    raise ValueError(f"Unsupported RAG worker action: {action}")


emit({"type": "ready", "protocolVersion": PROTOCOL_VERSION})
for raw_line in sys.stdin:
    try:
        request = json.loads(raw_line)
        request_id = request.get("id")
        result = handle(request)
        emit({"type": "result", "id": request_id, "ok": True, "result": result})
    except SystemExit:
        break
    except Exception as error:  # worker boundary: return structured diagnostics to the host
        emit(
            {
                "type": "result",
                "id": request.get("id") if "request" in locals() else None,
                "ok": False,
                "error": str(error),
                "traceback": traceback.format_exc(limit=8),
            }
        )
