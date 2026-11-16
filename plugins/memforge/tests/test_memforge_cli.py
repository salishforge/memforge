#!/usr/bin/env python3
"""Contract test for skills/memforge/scripts/memforge.py against a fake MemForge.

The fake mirrors the request/response shapes of src/app.ts on main (Jul 2026):
{ok, data} envelopes, /health without envelope, namespace only from the query
string on reads, 5xx bodies masked to 'Internal server error'.
Run: python3 -I tests/test_memforge_cli.py  (no network, no dependencies)
"""
import json
import os
import subprocess
import sys
import threading
import unittest
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "skills", "memforge", "scripts", "memforge.py")
TOKEN = "test-token-not-a-secret"


class Fake(BaseHTTPRequestHandler):
    calls = []
    fail_hybrid = False
    dream_polls = 0

    def log_message(self, *args):
        pass

    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _record(self, body=None):
        url = urllib.parse.urlparse(self.path)
        Fake.calls.append({"method": self.command, "path": url.path,
                           "query": dict(urllib.parse.parse_qsl(url.query)),
                           "auth": self.headers.get("Authorization"), "body": body})
        return url.path, dict(urllib.parse.parse_qsl(url.query))

    def do_GET(self):
        path, q = self._record()
        if path == "/health":
            return self._send(200, {"status": "ok", "ts": "2026-11-16T00:00:00Z"})
        if self.headers.get("Authorization") != "Bearer " + TOKEN:
            return self._send(401, {"ok": False, "error": "Invalid token"})
        if path.endswith("/stats"):
            return self._send(200, {"ok": True, "data": {"hot_count": 2, "warm_count": 5, "cold_count": 0,
                                                         "stale_embedding_count": 0}})
        if path.endswith("/query"):
            if Fake.fail_hybrid and q.get("mode") != "keyword":
                return self._send(500, {"ok": False, "error": "Internal server error"})
            return self._send(200, {"ok": True, "data": [
                {"id": "41", "content": "[assistant]: Decision: use advisory locks.", "metadata": {},
                 "occurred_at": "2026-03-02T10:00:00Z", "time_start": "2026-11-01T00:00:00Z",
                 "consolidated_at": "2026-11-01T00:00:00Z", "rank": 0.9, "epistemic_status": "provisional"},
                {"id": "77", "content": "[assistant]: Team uses pnpm.", "rank": 0.4,
                 "metadata": {"_from_pool": "eng", "_source_agent": "bob", "_trust_score": 0.64},
                 "occurred_at": None, "time_start": "2026-10-01T00:00:00Z", "consolidated_at": "2026-10-01T00:00:00Z"}]})
        if path.endswith("/resume"):
            return self._send(200, {"ok": True, "data": {
                "agent_id": "alice", "time_since_last_activity_ms": 172800000,
                "top_memories": [{"id": "9", "content": "x" * 2000, "importance": 0.8,
                                  "consolidated_at": "2026-11-10T00:00:00Z"}],
                "active_procedures": [], "open_contradictions": [], "memory_health": {}}})
        if path.endswith("/timeline"):
            return self._send(200, {"ok": True, "data": []})
        if "/dreams/" in path:
            Fake.dream_polls += 1
            status = "completed" if Fake.dream_polls >= 1 else "running"
            return self._send(200, {"ok": True, "data": {"id": "run-1", "status": status, "namespace": "proj"}})
        if path.endswith("/sleep/advisory"):
            return self._send(200, {"ok": True, "data": {"recommended": True, "urgency": "medium",
                                                         "reason": "hot backlog", "signals": [],
                                                         "hot_tier_count": 60, "warm_tier_count": 5}})
        return self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length) or b"{}")
        path, _ = self._record(body)
        if self.headers.get("Authorization") != "Bearer " + TOKEN:
            return self._send(401, {"ok": False, "error": "Invalid token"})
        if path.endswith("/add"):
            return self._send(200, {"ok": True, "data": {"id": "123", "agent_id": "alice",
                                                         "created_at": "2026-11-16T00:00:00Z",
                                                         "classification": {"sensitivity": "public",
                                                                            "findings_count": 0, "redacted": False}}})
        if path.endswith("/consolidate"):
            return self._send(200, {"ok": True, "data": {"hot_rows_processed": 2, "warm_rows_created": 1,
                                                         "status": "complete"}})
        if path.endswith("/dreams"):
            return self._send(202, {"ok": True, "data": {"id": "run-1", "status": "pending", "namespace": "proj"}})
        if path.endswith("/sleep"):
            return self._send(400, {"ok": False, "error": "Sleep cycle requires an LLM provider"})
        return self._send(404, {"ok": False, "error": "not found"})


class CliTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), Fake)
        cls.url = "http://127.0.0.1:%d" % cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        Fake.calls = []
        Fake.fail_hybrid = False
        Fake.dream_polls = 0

    def run_cli(self, *args, token=TOKEN, url=None):
        env = {"PATH": os.environ.get("PATH", ""), "MEMFORGE_URL": url or self.url,
               "MEMFORGE_AGENT_ID": "alice", "MEMFORGE_NAMESPACE": "proj"}
        if token:
            env["MEMFORGE_TOKEN"] = token
        p = subprocess.run([sys.executable, "-I", SCRIPT] + list(args), env=env,
                           capture_output=True, text=True, timeout=30)
        return p.returncode, p.stdout, p.stderr

    def test_check(self):
        code, out, _ = self.run_cli("check")
        self.assertEqual(code, 0)
        self.assertIn("warm (searchable)=5", out)
        self.assertEqual(Fake.calls[1]["query"], {"namespace": "proj"})
        self.assertNotIn(TOKEN, out)

    def test_add_sends_namespace_type_and_supersedes(self):
        code, out, _ = self.run_cli("add", "[user]: we chose X\n[assistant]: Decision: X because Y.",
                                    "--type", "decision", "--supersedes", "41",
                                    "--occurred-at", "2026-03-02", "--meta", "source=standup")
        self.assertEqual(code, 0, out)
        body = Fake.calls[0]["body"]
        self.assertEqual(body["namespace"], "proj")
        self.assertEqual(body["outcome_type"], "decision")
        self.assertEqual(body["hints"], {"supersedes": "41"})
        self.assertEqual(body["occurred_at"], "2026-03-02")
        self.assertEqual(body["metadata"], {"source": "standup"})
        self.assertIn("searchable after consolidate", out)

    def test_add_refuses_secrets_without_calling_server(self):
        for text in ("deploy key AKIAIOSFODNN7EXAMPLE", "db is postgres://app:hunter2x@db:5432/x",
                     "password = Sup3r-secret!", "-----BEGIN OPENSSH PRIVATE KEY-----"):
            code, _, err = self.run_cli("add", text)
            self.assertEqual(code, 3, text)
            self.assertIn("Never store credentials", err)
        self.assertEqual(Fake.calls, [])

    def test_add_allows_ordinary_text(self):
        code, _, _ = self.run_cli("add", "[assistant]: The password rotation policy is quarterly; token budget 20000.")
        self.assertEqual(code, 0)

    def test_query_params_and_rendering(self):
        code, out, _ = self.run_cli("query", "sleep mutex locking", "--after", "2026-01-01")
        self.assertEqual(code, 0)
        q = Fake.calls[0]["query"]
        self.assertEqual(q["namespace"], "proj")
        self.assertEqual(q["snippet_tokens"], "1500")
        self.assertEqual(q["after"], "2026-01-01")
        self.assertIn("happened 2026-03-02", out)
        self.assertIn("SECOND-HAND from agent bob", out)

    def test_query_refuses_today(self):
        code, _, err = self.run_cli("query", "what is on my agenda today")
        self.assertEqual(code, 2)
        self.assertIn("--after", err)
        self.assertEqual(Fake.calls, [])

    def test_query_retries_keyword_on_5xx(self):
        Fake.fail_hybrid = True
        code, out, err = self.run_cli("query", "release checklist")
        self.assertEqual(code, 0, err)
        self.assertEqual([c["query"].get("mode") for c in Fake.calls], [None, "keyword"])

    def test_global_flags_after_subcommand(self):
        code, _, _ = self.run_cli("query", "release checklist", "--ns", "other", "--agent", "bob")
        self.assertEqual(code, 0)
        self.assertEqual(Fake.calls[0]["path"], "/memory/bob/query")
        self.assertEqual(Fake.calls[0]["query"]["namespace"], "other")

    def test_consolidate_and_resume(self):
        self.assertEqual(self.run_cli("consolidate")[0], 0)
        self.assertEqual(Fake.calls[0]["body"], {"namespace": "proj"})
        code, out, _ = self.run_cli("resume")
        self.assertEqual(code, 0)
        self.assertEqual(Fake.calls[1]["query"], {"limit": "3", "namespace": "proj"})
        self.assertIn("2.0 days ago", out)
        self.assertLess(len(out), 1200)  # content trimmed to --chars

    def test_dream_wait(self):
        code, out, _ = self.run_cli("dream", "--wait", "10")
        self.assertEqual(code, 0)
        self.assertIn("status=completed", out)

    def test_bad_token_and_unreachable(self):
        code, _, err = self.run_cli("query", "x y", token="wrong")
        self.assertEqual(code, 1)
        self.assertIn("HTTP 401", err)
        code, _, err = self.run_cli("check", url="http://127.0.0.1:9")
        self.assertEqual(code, 4)
        self.assertIn("continue without it", err)

    def test_invalid_namespace(self):
        code, _, err = self.run_cli("query", "x", "--ns", "-bad")
        self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
