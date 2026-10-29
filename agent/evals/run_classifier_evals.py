"""Classifier evals: label the hand-labelled attempts and report per-technique precision/recall and micro-F1.

    cd agent && python evals/run_classifier_evals.py
    cd agent && python evals/run_classifier_evals.py --sample 15   # quick/cheap (CI)
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from evals.common import load_dotenv, load_jsonl, require_api_key, sample  # noqa: E402

load_dotenv()

from app.classifier import TECHNIQUES, ClassifyRequest, LLMClassifier  # noqa: E402
from app.config import get_settings  # noqa: E402
from evals.metrics import multilabel_scores, table  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sample", type=int)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()
    require_api_key()

    settings = get_settings()
    classifier = LLMClassifier(settings)
    rows = sample(load_jsonl("classifier_labels.jsonl"), args.sample, args.seed)
    sem = asyncio.Semaphore(args.concurrency)

    async def label(row: dict) -> list[str]:
        async with sem:
            req = ClassifyRequest(
                message=row["message"],
                level=row["level"],
                blocked_by=row.get("blocked_by"),
                leaked=row.get("leaked", False),
                inbox_email=row.get("inbox_email"),
            )
            try:
                return list((await classifier.classify(req)).techniques)
            except Exception as exc:
                print(f"  error on {row['message'][:40]!r}: {exc!r}")
                return []

    predicted = await asyncio.gather(*(label(r) for r in rows))
    gold = [r["labels"] for r in rows]
    per, micro = multilabel_scores(gold, predicted, TECHNIQUES)

    body = [
        [t, f"{s.precision:.2f}", f"{s.recall:.2f}", f"{s.f1:.2f}", s.tp + s.fn]
        for t, s in per.items()
        if s.tp + s.fn + s.fp
    ]
    body.append(["**micro avg**", f"{micro.precision:.2f}", f"{micro.recall:.2f}", f"**{micro.f1:.2f}**", micro.tp + micro.fn])
    print(f"\n## Classifier ({settings.classifier_model}, {len(rows)} labelled attempts)\n")
    print(table(["Technique", "Precision", "Recall", "F1", "Support"], body))

    misses = [(r["message"], g, p) for r, g, p in zip(rows, gold, predicted, strict=True) if set(g) != set(p)]
    if misses:
        print(f"\n{len(misses)} attempts with a different label set, e.g.:")
        for msg, g, p in misses[:5]:
            print(f"  - {msg[:60]!r}: gold={g} predicted={p}")


if __name__ == "__main__":
    asyncio.run(main())
