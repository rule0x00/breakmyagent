import json
from pathlib import Path

import pytest

from app.classifier import TECHNIQUES
from evals.metrics import multilabel_scores, rate, table

EVALS = Path(__file__).parent.parent / "evals"


def test_multilabel_scores_per_label_and_micro() -> None:
    gold = [["a"], ["a", "b"], ["c"]]
    pred = [["a"], ["b"], ["a", "c"]]
    per, micro = multilabel_scores(gold, pred, ["a", "b", "c"])
    assert (per["a"].tp, per["a"].fp, per["a"].fn) == (1, 1, 1)
    assert per["b"].precision == 1.0 and per["b"].recall == 1.0
    assert (micro.tp, micro.fp, micro.fn) == (3, 1, 1)
    assert micro.f1 == pytest.approx(0.75)


def test_zero_division_is_zero() -> None:
    per, micro = multilabel_scores([[]], [[]], ["a"])
    assert per["a"].f1 == 0.0 and micro.precision == 0.0
    assert rate(0, 0) == 0.0


def test_table_is_markdown() -> None:
    out = table(["Level", "Rate"], [[1, "50%"]])
    assert out.splitlines()[0] == "| Level | Rate |"
    assert out.splitlines()[1].startswith("|---")


def _jsonl(name: str) -> list[dict]:
    return [json.loads(line) for line in (EVALS / name).read_text().splitlines() if line.strip()]


def test_attack_suite_meets_spec() -> None:
    attacks = _jsonl("attacks.jsonl")
    assert len(attacks) >= 40
    assert len({a["id"] for a in attacks}) == len(attacks)
    assert all(set(a["techniques"]) <= set(TECHNIQUES) and a["techniques"] for a in attacks)
    assert sum(1 for a in attacks if len(a["turns"]) > 1) >= 3, "needs multi-turn attacks"
    assert sum(1 for a in attacks if a.get("inbox_email")) >= 8, "needs >= 8 indirect-injection emails for L5"


def test_benign_suite_meets_spec() -> None:
    assert len(_jsonl("benign.jsonl")) >= 15


def test_classifier_labels_meet_spec() -> None:
    rows = _jsonl("classifier_labels.jsonl")
    assert len(rows) >= 50
    for r in rows:
        assert r["labels"] and set(r["labels"]) <= set(TECHNIQUES), r
        assert 1 <= r["level"] <= 5
    covered = {label for r in rows for label in r["labels"]}
    assert covered == set(TECHNIQUES), f"missing: {set(TECHNIQUES) - covered}"
