#!/usr/bin/env python3
"""Validate question-bank JSON against the offline study-shell contract.

Default mode is strict (authoring rules). Use --lenient to approximate the
runtime importer. Lenient mode gives structural hints, not an exact UI emulator.

Usage:
  python3 tests/question-bank-schema.py
  python3 tests/question-bank-schema.py path/to/bank.json
  python3 tests/question-bank-schema.py --lenient bank.json
  python3 tests/question-bank-schema.py --extract-packaged /tmp/packaged.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def extract_packaged(html_path: Path) -> list:
    html = html_path.read_text(encoding="utf-8")
    marker = "const allQuizDataInGroupedFormat = ["
    start = html.find(marker)
    if start < 0:
        raise SystemExit(f"Cannot find packaged bank in {html_path}")
    i = html.find("[", start)
    # JSON's decoder understands brackets inside strings and escaped quotes.
    data, _ = json.JSONDecoder().raw_decode(html, i)
    if not isinstance(data, list):
        raise ValueError("Packaged bank must be an array")
    return data


def normalize_answer(value) -> list[str]:
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    if value is None or value == "":
        return []
    cleaned = re.sub(r"[，、;；\s]+", "", str(value))
    return [ch for ch in cleaned if ch]


def has_question_body(q: dict) -> bool:
    if q.get("q") or q.get("题干") or q.get("question"):
        return True
    for key in ("qImages", "questionImages", "题干图片", "images"):
        val = q.get(key)
        if isinstance(val, list) and val:
            return True
    return False


def as_groups(data):
    if not isinstance(data, list) or not data:
        raise ValueError("题库必须是非空 JSON 数组")
    # flat questions?
    def is_flat_item(x):
        return (
            isinstance(x, dict)
            and not isinstance(x.get("questions") or x.get("题目") or x.get("题库"), list)
            and has_question_body(x)
        )

    if all(is_flat_item(x) for x in data):
        return [
            {
                "chapter": "题库",
                "section": "全部题目",
                "topic": "人工校对",
                "questions": data,
                "__flat": True,
            }
        ]
    return data


def validate(data, *, strict: bool = True) -> list[str]:
    """Strict author format uses canonical keys; lenient gives import hints only."""
    errors: list[str] = []
    if strict:
        if not isinstance(data, list) or not data:
            return ["题库必须是非空 JSON 题组数组"]
        groups = data
    else:
        try:
            groups = as_groups(data)
        except ValueError as exc:
            return [str(exc)]

    for gi, group in enumerate(groups, start=1):
        label = f"第 {gi} 组"
        if not isinstance(group, dict):
            errors.append(f"{label}: 不是对象")
            continue
        if strict:
            case = group.get("caseInfo")
            questions = group.get("questions")
            for key in ("chapter", "section", "topic"):
                if not isinstance(group.get(key), str) or not group[key].strip():
                    errors.append(f"{label}: {key} 必须是非空字符串")
            if case is not None and not isinstance(case, (str, dict)):
                errors.append(f"{label}: caseInfo 只能是字符串、单个对象或 null；多个材料请拆组")
            if isinstance(case, str) and not case.strip():
                errors.append(f"{label}: caseInfo 字符串不能为空")
            if "caseUid" in group and not isinstance(group["caseUid"], str):
                errors.append(f"{label}: caseUid 必须是字符串")
        else:
            case = group.get("caseInfo") or group.get("材料") or group.get("背景") or group.get("案例")
            questions = group.get("questions") or group.get("题目") or group.get("题库")
            if isinstance(case, list):
                errors.append(f"{label}: caseInfo 不能是数组，请拆成多组")
        if not isinstance(questions, list) or not questions:
            errors.append(f"{label}: questions 必须是非空数组")
            continue
        for qi, q in enumerate(questions, start=1):
            qlabel = f"{label} 第 {qi} 题"
            if not isinstance(q, dict):
                errors.append(f"{qlabel}: 不是对象")
                continue
            if not strict:
                if not has_question_body(q):
                    errors.append(f"{qlabel}: 无题干且无题干图片")
                continue
            if any(k in q for k in ("caseInfo", "材料", "背景", "案例")):
                errors.append(f"{qlabel}: 案例材料应放在组级 caseInfo")
            if not isinstance(q.get("q"), str) or not q["q"].strip():
                errors.append(f"{qlabel}: q 必须是非空题干字符串")
            options = q.get("o")
            valid_options = isinstance(options, list) and 2 <= len(options) <= 26
            if not valid_options:
                errors.append(f"{qlabel}: o 必须是含 2–26 项的选项数组")
            elif any(not isinstance(opt, str) for opt in options):
                errors.append(f"{qlabel}: 选项必须都是字符串")
            answers = q.get("a")
            if not isinstance(answers, list) or not answers:
                errors.append(f"{qlabel}: a 必须是非空大写字母数组，例如 [\"A\"]")
            else:
                seen = set()
                for ans in answers:
                    if not isinstance(ans, str) or not re.fullmatch(r"[A-Z]", ans):
                        errors.append(f"{qlabel}: 答案 {ans!r} 必须是单个大写字母 A–Z")
                        continue
                    if ans in seen:
                        errors.append(f"{qlabel}: 答案 {ans} 重复")
                    seen.add(ans)
                    if valid_options and ord(ans) - ord("A") >= len(options):
                        errors.append(f"{qlabel}: 答案 {ans} 超出选项范围")
            qtype = q.get("type")
            if qtype not in ("single", "multiple", "judge"):
                errors.append(f"{qlabel}: type 必须显式写 single/multiple/judge")
            elif qtype in ("single", "judge") and isinstance(answers, list) and len(answers) != 1:
                errors.append(f"{qlabel}: {qtype} 必须恰好 1 个答案，实际 {len(answers)}")
            for key in ("uid", "e", "htmlContent", "aiAnalysis", "aiUpdatedAt"):
                if key in q and not isinstance(q[key], str):
                    errors.append(f"{qlabel}: {key} 必须是字符串")
            if "uid" in q and isinstance(q["uid"], str) and not q["uid"].strip():
                errors.append(f"{qlabel}: uid 不能为空")
    return errors


def self_test() -> None:
    """Regression cases for author mistakes missed by the original proposal."""
    import copy
    import tempfile
    base = [{"chapter": "章", "section": "节", "topic": "考点", "questions": [
        {"q": "含 [ 和 ] 的题干", "o": ["甲", "乙"], "a": ["A"], "type": "single"}
    ]}]
    assert not validate(base)
    cases = [
        ("a", ["a"]), ("a", ["C"]), ("a", ["A", "A"]),
        ("a", "A"), ("a", [1]), ("a", []), ("a", ["A", "B"]),
        ("type", "typo"), ("type", "multi"), ("type", "判断"),
        ("type", None), ("q", 123), ("q", " "), ("o", ["甲"]),
        ("o", ["甲", 1]), ("caseInfo", "小题材料"), ("e", 123),
    ]
    for key, value in cases:
        bad = copy.deepcopy(base)
        bad[0]["questions"][0][key] = value
        assert validate(bad), (key, value)
    for value in (["材料一", "材料二"], 7, False):
        bad = copy.deepcopy(base); bad[0]["caseInfo"] = value
        assert validate(bad), value
    for key in ("chapter", "section", "topic", "questions"):
        bad = copy.deepcopy(base); del bad[0][key]
        assert validate(bad), key
    flat = base[0]["questions"]
    assert validate(flat) and not validate(flat, strict=False)
    aliases = [{"章节": "章", "节": "节", "考点": "点", "题库": [
        {"题干": "题", "选项": ["甲", "乙"], "答案": "A", "类型": "single"}
    ]}]
    assert validate(aliases) and not validate(aliases, strict=False)
    assert normalize_answer("A,B") == ["A", ",", "B"]
    assert normalize_answer("A、B") == ["A", "B"]
    assert validate([]) and validate([None]) and validate({})
    for kind, answers in (("multiple", ["A", "B"]), ("judge", ["B"])):
        good = copy.deepcopy(base); good[0]["questions"][0].update(type=kind, a=answers)
        assert not validate(good)
    with tempfile.TemporaryDirectory() as directory:
        html = Path(directory) / "index.html"
        html.write_text("const allQuizDataInGroupedFormat = " + json.dumps(base) + "; trailing JS")
        assert extract_packaged(html) == base
    print("Validator regression cases passed (strict rejection, aliases, flat input, string brackets).")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", help="JSON bank files (default: packaged site/index.html)")
    parser.add_argument("--lenient", action="store_true", help="Approximate runtime importer checks only")
    parser.add_argument(
        "--extract-packaged",
        type=Path,
        help="Write packaged bank JSON extracted from site/index.html to this path",
    )
    parser.add_argument("--check-invalid-fixture", action="store_true", help="Verify every intentional bad example is rejected")
    parser.add_argument("--self-test", action="store_true", help="Run validator regression cases")
    args = parser.parse_args(argv)
    if args.self_test:
        self_test()
        return 0

    if args.check_invalid_fixture:
        fixture = ROOT / "fixtures" / "question-bank.invalid.examples.json"
        data = json.loads(fixture.read_text(encoding="utf-8"))
        expected = ("超出选项范围", "caseInfo 只能", "single 必须")
        if len(data) != len(expected):
            raise AssertionError("Invalid fixture must retain all three intentional errors")
        for group, reason in zip(data, expected):
            errors = validate([group])
            if not any(reason in error for error in errors):
                raise AssertionError(f"Bad example was not rejected for {reason}: {errors}")
            print(f"Rejected expected bad example: {reason}")
        return 0

    packaged_html = ROOT / "site" / "index.html"
    if args.extract_packaged:
        data = extract_packaged(packaged_html)
        args.extract_packaged.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"Wrote {len(data)} groups to {args.extract_packaged}")
        return 0

    targets: list[tuple[str, object]] = []
    if args.paths:
        for path in args.paths:
            p = Path(path)
            try:
                targets.append((str(p), json.loads(p.read_text(encoding="utf-8-sig"))))
            except (OSError, UnicodeError, json.JSONDecodeError) as exc:
                print(f"FAIL {p}: {exc}", file=sys.stderr)
                return 1
    else:
        targets.append(("site/index.html#allQuizDataInGroupedFormat", extract_packaged(packaged_html)))

    strict = not args.lenient
    failed = 0
    for name, data in targets:
        errors = validate(data, strict=strict)
        mode = "lenient" if args.lenient else "strict"
        if errors:
            failed += 1
            print(f"FAIL [{mode}] {name}: {len(errors)} issue(s)")
            for err in errors[:50]:
                print(" -", err)
            if len(errors) > 50:
                print(f" - … {len(errors) - 50} more")
        else:
            groups = as_groups(data)
            nq = sum(len(g.get("questions") or g.get("题目") or g.get("题库") or []) for g in groups)
            print(f"OK [{mode}] {name}: {len(groups)} group(s), {nq} question(s)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
