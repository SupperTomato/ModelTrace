"""English-only interfaces and preserved historical numeric evidence."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import unittest
from unittest.mock import patch

import app as web
from challenge_suite import fingerprint_suite
from fingerprint import generate_challenges, parse_numbers

ROOT = Path(__file__).resolve().parents[1]
NON_ENGLISH_SCRIPT = re.compile(r"[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff]")
CJK_PUNCTUATION = re.compile(r"[\u3000-\u303f\uff01-\uff65]")


class EnglishEditionTests(unittest.TestCase):
    def assert_english(self, text):
        self.assertIsNone(NON_ENGLISH_SCRIPT.search(text), text[:300])
        self.assertIsNone(CJK_PUNCTUATION.search(text), text[:300])

    def test_repository_text_and_decoded_json_are_english(self):
        paths = subprocess.check_output(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            cwd=ROOT,
        ).decode().split("\0")
        for name in filter(None, paths):
            with self.subTest(path=name):
                text = (ROOT / name).read_text(encoding="utf-8")
                self.assert_english(text)
                if name.endswith(".json"):
                    self.assert_english(json.dumps(json.loads(text), ensure_ascii=False))
                elif name.endswith(".jsonl"):
                    for line in text.splitlines():
                        self.assert_english(json.dumps(json.loads(line), ensure_ascii=False))

    def test_new_manual_and_enrollment_challenges_are_english(self):
        suite = fingerprint_suite()
        self.assertEqual(len(suite), 36)
        for challenge in suite + generate_challenges():
            self.assert_english(json.dumps(challenge, ensure_ascii=False))
            self.assertIn(str(challenge["expected_count"]), challenge["prompt"])
            self.assertIn("355", challenge["prompt"])
            self.assertIn("current language model", challenge["prompt"])
            self.assertRegex(challenge["prompt"], r"Do not (?:count|sort)")
            self.assertIn("tools", challenge["prompt"])
        for _ in range(20):
            counts = [item["expected_count"] for item in generate_challenges()]
            self.assertEqual(len(set(counts)), 3)
            self.assertTrue(all(292 <= count <= 332 for count in counts))

    def test_banks_and_historical_numeric_sequences_are_preserved(self):
        manifest = json.loads((ROOT / "data/localization.json").read_text())
        for name, expected in manifest["bank_sha256"].items():
            self.assertEqual(hashlib.sha256((ROOT / "data" / name).read_bytes()).hexdigest(), expected)
        for name, expected in manifest["references"].items():
            rows = [json.loads(line) for line in (ROOT / "data" / name).read_text().splitlines()]
            self.assertEqual(len(rows), expected["row_count"])
            arrays = [parse_numbers(row["text"]) for row in rows]
            digest = hashlib.sha256(json.dumps(arrays, separators=(",", ":")).encode()).hexdigest()
            self.assertEqual(digest, expected["parsed_sequences_sha256"])
            translated = 0
            for row in rows:
                for field, provenance in row.get("localization", {}).items():
                    self.assertIn(field, row)
                    self.assertEqual(provenance["rendered_language"], "en")
                    self.assertIn(provenance["representation"], ("translation", "punctuation-normalization"))
                    self.assertRegex(provenance["source_sha256"], r"^[a-f0-9]{64}$")
                    translated += 1
            self.assertEqual(translated, expected["translated_fields"])

    def test_web_routes_return_english_success_and_errors(self):
        client = web.app.test_client()
        page = client.get("/")
        self.assertEqual(page.status_code, 200)
        self.assert_english(page.get_data(as_text=True))
        self.assertIn('lang="en"', page.get_data(as_text=True))
        challenges = client.get("/api/challenges").get_json()["challenges"]
        self.assertEqual(len(challenges), 3)
        self.assert_english(json.dumps(challenges))
        cases = [
            client.get("/api/bank?bank_id=missing"),
            client.post("/api/banks", json={"label": " "}),
            client.post("/api/banks", json={"label": "GPT"}),
            client.post("/api/analyze", json={"outputs": [{"text": "", "expected_count": 300}]}),
        ]
        for response in cases:
            self.assertEqual(response.status_code, 400)
            self.assert_english(response.get_json()["error"])
        rows = (ROOT / "data/gpt_reference.jsonl").read_text().splitlines()
        sample = json.loads(rows[0])
        response = client.post("/api/analyze", json={"outputs": [{"text": sample["text"], "expected_count": sample["requested_count"]}]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.get_json()["results"]), 18)
        self.assert_english(json.dumps(response.get_json()))
        # Use a local API stub: no provider requests or live account usage.
        with patch.object(web, "request_completion", return_value=sample["text"]) as completion:
            response = client.post("/api/test/probe", json={"base_url": "https://example.invalid/v1", "api_key": "test-only", "api_model": "fixture", "prompt": challenges[0]["prompt"], "expected_count": sample["requested_count"]})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.get_json()["accepted"])
            self.assert_english(completion.call_args.kwargs["prompt"])


if __name__ == "__main__":
    unittest.main()
