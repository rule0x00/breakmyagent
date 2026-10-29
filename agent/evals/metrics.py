"""Pure scoring helpers for the eval scripts (unit-tested; no LLM calls)."""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass


@dataclass
class PRF:
    tp: int = 0
    fp: int = 0
    fn: int = 0

    @property
    def precision(self) -> float:
        return self.tp / (self.tp + self.fp) if self.tp + self.fp else 0.0

    @property
    def recall(self) -> float:
        return self.tp / (self.tp + self.fn) if self.tp + self.fn else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if p + r else 0.0


def multilabel_scores(
    gold: Sequence[Iterable[str]], predicted: Sequence[Iterable[str]], labels: Sequence[str]
) -> tuple[dict[str, PRF], PRF]:
    """Per-label precision/recall counts and the micro-averaged total."""
    if len(gold) != len(predicted):
        raise ValueError("gold and predicted must be the same length")
    per = {label: PRF() for label in labels}
    for g, p in zip(gold, predicted, strict=True):
        gs, ps = set(g), set(p)
        for label in labels:
            if label in gs and label in ps:
                per[label].tp += 1
            elif label in ps:
                per[label].fp += 1
            elif label in gs:
                per[label].fn += 1
    micro = PRF(
        tp=sum(s.tp for s in per.values()), fp=sum(s.fp for s in per.values()), fn=sum(s.fn for s in per.values())
    )
    return per, micro


def rate(part: int, whole: int) -> float:
    return part / whole if whole else 0.0


def table(headers: Sequence[str], rows: Sequence[Sequence[object]]) -> str:
    """Plain Markdown table, so output pastes straight into the README."""
    cells = [[str(h) for h in headers]] + [[str(c) for c in r] for r in rows]
    widths = [max(len(row[i]) for row in cells) for i in range(len(headers))]
    fmt = lambda row: "| " + " | ".join(c.ljust(w) for c, w in zip(row, widths, strict=True)) + " |"  # noqa: E731
    sep = "|" + "|".join("-" * (w + 2) for w in widths) + "|"
    return "\n".join([fmt(cells[0]), sep, *(fmt(r) for r in cells[1:])])
