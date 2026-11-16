#!/usr/bin/env python3
"""MemForge REST helper for the memforge skill. Python 3.8+, standard library only.

Configuration comes from the environment (flags override):
  MEMFORGE_URL        server base URL (default http://localhost:3333)
  MEMFORGE_TOKEN      bearer token; never printed
  MEMFORGE_AGENT_ID   one stable id per person, e.g. "alice" (skill convention)
  MEMFORGE_NAMESPACE  project slug (default "default")

Every call sends the namespace explicitly (body for writes, query string for
reads) because read routes ignore the X-Memforge-Namespace header.

Exit codes: 0 ok, 1 server/HTTP error, 2 usage or config error,
3 refused locally (looks like a secret, or too large), 4 server unreachable.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

AGENT_RE = re.compile(r"^[\w.@:=-]{1,256}$")
NS_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
MAX_CONTENT_CHARS = 20000  # server body limit is 100 KB; small memories retrieve better

# High-precision credential shapes. Rewrite the memory without the value
# (say where the secret lives instead); there is deliberately no override.
SECRET_PATTERNS = [
    ("private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY")),
    ("AWS access key", re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")),
    ("API key", re.compile(r"\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}")),
    ("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}")),
    ("Slack token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
    ("JWT", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    ("connection string with password", re.compile(r"\b[a-z][a-z0-9+.-]*://[^\s:/@]+:[^\s@/]+@", re.I)),
    ("password/secret assignment", re.compile(
        r"\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*['\"]?"
        r"(?=[^\s'\"]*[0-9!@#$%^&*+=/_-])[^\s'\"]{8,}", re.I)),
]

# Mirrors the server's query parser (src/memory-manager.ts parseQuery).
TODAY_RE = re.compile(r"\btoday\b", re.I)
TIME_RE = re.compile(r"\b(yesterday|last week|last month|recently|this week)\b", re.I)
SPLIT_RE = re.compile(r"\b(and also|and|as well as|plus|along with)\b", re.I)


class CliError(Exception):
    def __init__(self, message, code=1):
        super().__init__(message)
        self.code = code


def env(name, default=None):
    value = os.environ.get(name, "").strip()
    return value or default


class Client:
    def __init__(self, url, token, agent, namespace, timeout):
        self.url = url.rstrip("/")
        self.token = token
        self.agent = agent
        self.namespace = namespace
        self.timeout = timeout

    def need_agent(self):
        if not self.agent:
            raise CliError("No agent id. Set MEMFORGE_AGENT_ID or pass --agent "
                           "(ask the user once; use one stable id per person).", 2)
        return urllib.parse.quote(self.agent, safe="")

    def request(self, method, path, params=None, body=None, auth=True):
        query = ""
        if params:
            clean = {k: v for k, v in params.items() if v is not None and v != ""}
            if clean:
                query = "?" + urllib.parse.urlencode(clean)
        headers = {"Accept": "application/json", "X-Memforge-Namespace": self.namespace}
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if auth and self.token:
            headers["Authorization"] = "Bearer " + self.token
        req = urllib.request.Request(self.url + path + query, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8")
                status = resp.status
        except urllib.error.HTTPError as err:
            raw = err.read().decode("utf-8", "replace")
            raise CliError(explain_http(err.code, error_message(raw), bool(self.token)), 1)
        except (urllib.error.URLError, OSError) as err:
            raise CliError("Cannot reach MemForge at %s (%s). Tell the user memory is unavailable "
                           "and continue without it." % (self.url, getattr(err, "reason", err)), 4)
        payload = json.loads(raw) if raw else {}
        if isinstance(payload, dict) and payload.get("ok") is False:
            raise CliError(explain_http(status, payload.get("error", ""), bool(self.token)), 1)
        if isinstance(payload, dict) and "data" in payload:
            return payload["data"]
        return payload


def error_message(raw):
    try:
        payload = json.loads(raw)
        if isinstance(payload, dict):
            return str(payload.get("error") or payload)
    except ValueError:
        pass
    return raw[:300]


def explain_http(code, message, sent_token):
    hint = ""
    if code == 401:
        hint = "Token missing or wrong: check MEMFORGE_TOKEN (do not print it)."
    elif code == 403:
        hint = "The token lacks permission for this operation."
    elif code == 404:
        hint = "Not found: unknown agent id, run id, or a route this server version lacks."
    elif code == 429:
        hint = "Rate limited (default 100 requests/minute per client IP). Wait, then make fewer calls."
    elif code == 503 and sent_token:
        hint = ("Either the server has no token configured (it then answers 503 to any token) "
                "or its OAuth2 backend is down. Tell the user; drop MEMFORGE_TOKEN only if the "
                "operator confirms the server runs without auth.")
    elif "requires an LLM" in message:
        hint = "This server has no LLM configured: skip sleep/dreams/reflection; consolidate is enough."
    elif "already running" in message:
        hint = "A sleep cycle is already running for this agent. Do not retry in a loop."
    elif code >= 500:
        hint = "Server error (details are hidden by the server). For add: shorten or split the content."
    return "HTTP %s: %s %s" % (code, message, hint)


def when(item):
    for key, label in (("occurred_at", "happened"), ("time_start", "stored"), ("consolidated_at", "stored")):
        if item.get(key):
            return "%s %s" % (label, str(item[key])[:10])
    return "date unknown"


def trim(text, limit):
    text = (text or "").strip()
    if limit and len(text) > limit:
        return text[:limit].rstrip() + " [...]"
    return text


def indent(text):
    return "\n".join("    " + line for line in text.splitlines())


def print_json(data):
    print(json.dumps(data, indent=2, ensure_ascii=False))


def scan_secrets(text):
    return [name for name, pattern in SECRET_PATTERNS if pattern.search(text)]


# ─── Commands ──────────────────────────────────────────────────────────────

def cmd_check(c, a):
    health = c.request("GET", "/health", auth=False)
    print("server: reachable at %s (%s)" % (c.url, health.get("status", "?") if isinstance(health, dict) else "?"))
    print("token: %s" % ("set" if c.token else "NOT set"))
    print("agent: %s   namespace: %s" % (c.agent or "(not set)", c.namespace))
    if not c.agent:
        print("next: ask the user which agent id to use, then export MEMFORGE_AGENT_ID.")
        return
    try:
        stats = c.request("GET", "/memory/%s/stats" % c.need_agent(), {"namespace": c.namespace})
    except CliError as err:
        if "HTTP 404" in str(err):
            print("memory: no memories yet for this agent (it is created on first add).")
            return
        raise
    if not c.token:
        print("WARNING: the server accepted a request without a token, so it runs without "
              "authentication. Tell the user; store nothing sensitive there.")
    print("memory: hot (not yet searchable)=%s warm (searchable)=%s cold (archived)=%s" % (
        stats.get("hot_count"), stats.get("warm_count"), stats.get("cold_count")))
    print("embeddings: %s" % ("enabled (hybrid search)" if "stale_embedding_count" in stats
                              else "not reported (keyword search only, or older server)"))
    if a.json:
        print_json(stats)


def cmd_resume(c, a):
    data = c.request("GET", "/memory/%s/resume" % c.need_agent(),
                     {"limit": a.limit, "namespace": c.namespace})
    if a.json:
        return print_json(data)
    idle = data.get("time_since_last_activity_ms")
    print("namespace=%s  last activity: %s" % (
        c.namespace, "%.1f days ago" % (idle / 86400000.0) if isinstance(idle, (int, float)) else "unknown"))
    mems = data.get("top_memories") or []
    print("top memories by importance (not recency): %d" % len(mems))
    for m in mems:
        print("- id=%s  %s  importance=%s" % (m.get("id"), when(m), m.get("importance")))
        print(indent(trim(m.get("content"), a.chars)))
    for p in data.get("active_procedures") or []:
        print("procedure: IF %s THEN %s (confidence %s)" % (p.get("condition"), p.get("action"), p.get("confidence")))
    for item in data.get("open_contradictions") or []:
        print("open contradiction: %s" % item)


def cmd_query(c, a):
    q = a.q.strip()
    if TODAY_RE.search(q) and not a.allow_time_words:
        raise CliError("'today' in a query becomes a hard server-side filter that matches nothing. "
                       "Remove it and pass --after YYYY-MM-DD instead "
                       "(or --allow-time-words to send it anyway).", 2)
    m = TIME_RE.search(q)
    if m and not a.allow_time_words:
        print("note: '%s' becomes a hard time window counted back from the server clock; "
              "prefer --after/--before." % m.group(1), file=sys.stderr)
    if SPLIT_RE.search(q) and a.mode != "code":
        print("note: the server splits queries at and/plus/as well as/along with and searches the "
              "parts separately; one topic per query works better.", file=sys.stderr)
    params = {"q": q, "limit": a.limit, "namespace": c.namespace, "mode": a.mode,
              "after": a.after, "before": a.before, "epistemic": a.epistemic,
              "max_tokens": a.max_tokens}
    if a.snippet and a.snippet > 0:
        params["snippet_tokens"] = a.snippet
    path = "/memory/%s/query" % c.need_agent()
    try:
        rows = c.request("GET", path, params)
    except CliError as err:
        if "HTTP 5" in str(err) and a.mode in (None, "hybrid"):
            print("note: query failed (%s); retrying once in keyword mode." % str(err)[:60], file=sys.stderr)
            params["mode"] = "keyword"
            rows = c.request("GET", path, params)
        else:
            raise
    if a.json:
        return print_json(rows)
    rows = rows or []
    print("%d result(s) in namespace=%s for: %s" % (len(rows), c.namespace, q))
    if not rows:
        print("Empty does not prove absence: memories are searchable only after consolidate, "
              "may be in another namespace, or excluded by a time filter.")
    for i, r in enumerate(rows, 1):
        meta = r.get("metadata") or {}
        status = r.get("epistemic_status") or "n/a"
        rank = r.get("rank")
        line = "[%d] id=%s  %s  status=%s  rank=%s" % (
            i, r.get("id"), when(r), status, ("%.3f" % rank) if isinstance(rank, (int, float)) else rank)
        if meta.get("_from_pool"):
            line += "  SECOND-HAND from agent %s via pool %s (trust %s)" % (
                meta.get("_source_agent"), meta.get("_from_pool"), meta.get("_trust_score"))
        if meta.get("_superseded"):
            line += "  SUPERSEDED (a newer correction exists)"
        print(line)
        print(indent(trim(r.get("content"), a.chars)))


def cmd_add(c, a):
    content = sys.stdin.read() if a.stdin else (a.content or "")
    content = content.strip()
    if not content:
        raise CliError("Nothing to store: pass the content as an argument or with --stdin.", 2)
    if len(content) > MAX_CONTENT_CHARS:
        raise CliError("Content is %d chars. Store one self-contained fact, decision or outcome per "
                       "memory (aim for under 1,500 chars); split long material." % len(content), 3)
    found = scan_secrets(content + "\n" + " ".join(a.meta or []))
    if found:
        raise CliError("Refused: content looks like it contains a %s. Never store credentials; "
                       "store where the secret lives instead (e.g. 'in the team vault')." % ", ".join(found), 3)
    body = {"content": content, "namespace": c.namespace}
    if a.type:
        body["outcome_type"] = a.type
    if a.occurred_at:
        body["occurred_at"] = a.occurred_at
    if a.supersedes:
        body["hints"] = {"supersedes": str(a.supersedes)}
    if a.meta:
        meta = {}
        for pair in a.meta:
            key, sep, value = pair.partition("=")
            if not sep or not key or key.startswith("_"):
                raise CliError("--meta takes key=value and keys must not start with '_': %r" % pair, 2)
            meta[key] = value
        body["metadata"] = meta
    data = c.request("POST", "/memory/%s/add" % c.need_agent(), body=body)
    if a.json:
        return print_json(data)
    cls = data.get("classification") or {}
    if data.get("deduplicated"):
        print("already stored within the last hour (deduplicated) id=%s namespace=%s" % (data.get("id"), c.namespace))
    else:
        print("stored id=%s namespace=%s (hot tier: searchable after consolidate)" % (data.get("id"), c.namespace))
    if cls.get("redacted") or cls.get("sensitivity") in ("confidential", "restricted"):
        print("WARNING: server classified this memory as %s and redacted=%s (%s finding(s)). "
              "Tell the user what was stored." % (cls.get("sensitivity"), cls.get("redacted"), cls.get("findings_count")))


def cmd_consolidate(c, a):
    body = {"namespace": c.namespace}
    if a.mode:
        body["mode"] = a.mode
    data = c.request("POST", "/memory/%s/consolidate" % c.need_agent(), body=body)
    if a.json:
        return print_json(data)
    print("consolidated namespace=%s: hot rows processed=%s, searchable rows created=%s, status=%s" % (
        c.namespace, data.get("hot_rows_processed"), data.get("warm_rows_created"), data.get("status")))


def cmd_timeline(c, a):
    rows = c.request("GET", "/memory/%s/timeline" % c.need_agent(),
                     {"from": a.since, "to": a.until, "limit": a.limit, "namespace": c.namespace})
    if a.json:
        return print_json(rows)
    rows = rows or []
    print("%d row(s), oldest first, by storage time, namespace=%s" % (len(rows), c.namespace))
    for r in rows:
        print("- id=%s  %s" % (r.get("id"), when(r)))
        print(indent(trim(r.get("content"), a.chars)))


def cmd_advisory(c, a):
    data = c.request("GET", "/memory/%s/sleep/advisory" % c.need_agent())
    if a.json:
        return print_json(data)
    print("recommended=%s urgency=%s reason=%s" % (data.get("recommended"), data.get("urgency"), data.get("reason")))
    for s in data.get("signals") or []:
        print("- %s=%s (threshold %s, %s)" % (s.get("name"), s.get("value"), s.get("threshold"), s.get("urgency")))
    print("hot rows waiting=%s, searchable rows=%s" % (data.get("hot_tier_count"), data.get("warm_tier_count")))


def show_run(run):
    print("dream run %s: status=%s namespace=%s%s" % (
        run.get("id"), run.get("status"), run.get("namespace"),
        ("  error=%s" % run.get("error")) if run.get("error") else ""))


def cmd_dream(c, a):
    agent = c.need_agent()
    run = c.request("POST", "/memory/%s/dreams" % agent, body={"namespace": c.namespace})
    show_run(run)
    deadline = time.time() + max(0, a.wait)
    while a.wait and run.get("status") in ("pending", "running") and time.time() < deadline:
        time.sleep(3)
        run = c.request("GET", "/memory/%s/dreams/%s" % (agent, urllib.parse.quote(str(run.get("id")), safe="")))
    if a.wait:
        show_run(run)
        if run.get("status") in ("pending", "running"):
            print("Still %s after %ss. Do not start another run; check later with dream-status."
                  % (run.get("status"), a.wait))


def cmd_dream_status(c, a):
    show_run(c.request("GET", "/memory/%s/dreams/%s" % (c.need_agent(), urllib.parse.quote(a.run_id, safe=""))))


def cmd_dream_cancel(c, a):
    show_run(c.request("POST", "/memory/%s/dreams/%s/cancel" % (c.need_agent(), urllib.parse.quote(a.run_id, safe="")), body={}))


def cmd_explain(c, a):
    print_json(c.request("GET", "/memory/%s/explain" % c.need_agent(), {"warm_id": a.warm_id}))


def cmd_stats(c, a):
    print_json(c.request("GET", "/memory/%s/stats" % c.need_agent(), {"namespace": c.namespace}))


def add_common(parser, defaults):
    """Global options, accepted before or after the subcommand."""
    d = (lambda value: value) if defaults else (lambda value: argparse.SUPPRESS)
    parser.add_argument("--url", default=d(env("MEMFORGE_URL", "http://localhost:3333")))
    parser.add_argument("--agent", default=d(env("MEMFORGE_AGENT_ID")))
    parser.add_argument("--ns", default=d(env("MEMFORGE_NAMESPACE", "default")), help="namespace (project slug)")
    parser.add_argument("--json", action="store_true", default=d(False), help="print raw response data")
    parser.add_argument("--timeout", type=float, default=d(30.0))


def build_parser():
    p = argparse.ArgumentParser(prog="memforge.py", description="MemForge REST helper for the memforge skill.")
    add_common(p, True)
    common = argparse.ArgumentParser(add_help=False)
    add_common(common, False)
    sub = p.add_subparsers(dest="cmd", required=True)

    def cmd(name, **kw):
        return sub.add_parser(name, parents=[common], **kw)

    cmd("check", help="reachability, auth and counts").set_defaults(fn=cmd_check)

    s = cmd("resume", help="warm-start bundle for this namespace")
    s.add_argument("--limit", type=int, default=3)
    s.add_argument("--chars", type=int, default=600)
    s.set_defaults(fn=cmd_resume)

    s = cmd("query", help="search searchable (consolidated) memory")
    s.add_argument("q")
    s.add_argument("--limit", type=int, default=8)
    s.add_argument("--snippet", type=int, default=1500, help="per-result token budget; 0 = full content")
    s.add_argument("--mode", choices=["keyword", "hybrid", "code"], default=None,
                   help="omit for the server default; 'code' for identifiers, paths, error strings")
    s.add_argument("--after")
    s.add_argument("--before")
    s.add_argument("--epistemic", choices=["only_established", "include_provisional", "include_contested", "all"])
    s.add_argument("--max-tokens", type=int, dest="max_tokens")
    s.add_argument("--chars", type=int, default=0, help="local display cap per result; 0 = none")
    s.add_argument("--allow-time-words", action="store_true")
    s.set_defaults(fn=cmd_query)

    s = cmd("add", help="store one memory (hot tier)")
    s.add_argument("content", nargs="?")
    s.add_argument("--stdin", action="store_true")
    s.add_argument("--type", choices=["decision", "error", "success", "observation"])
    s.add_argument("--occurred-at", dest="occurred_at", help="ISO 8601 time the event happened")
    s.add_argument("--supersedes", help="id of your own query result that this corrects (never a SECOND-HAND one)")
    s.add_argument("--meta", action="append", help="key=value provenance, repeatable")
    s.set_defaults(fn=cmd_add)

    s = cmd("consolidate", help="make stored memories searchable")
    s.add_argument("--mode", choices=["concat", "summarize"])
    s.set_defaults(fn=cmd_consolidate)

    s = cmd("timeline", help="rows by storage time, oldest first")
    s.add_argument("--since", help="ISO start; set it to get recent rows")
    s.add_argument("--until")
    s.add_argument("--limit", type=int, default=20)
    s.add_argument("--chars", type=int, default=400)
    s.set_defaults(fn=cmd_timeline)

    cmd("advisory", help="should maintenance run?").set_defaults(fn=cmd_advisory)

    s = cmd("dream", help="queue an async maintenance run (needs an LLM on the server)")
    s.add_argument("--wait", type=int, default=0, help="seconds to poll for completion")
    s.set_defaults(fn=cmd_dream)
    s = cmd("dream-status")
    s.add_argument("run_id")
    s.set_defaults(fn=cmd_dream_status)
    s = cmd("dream-cancel")
    s.add_argument("run_id")
    s.set_defaults(fn=cmd_dream_cancel)

    s = cmd("explain", help="why a memory has its scores")
    s.add_argument("warm_id")
    s.set_defaults(fn=cmd_explain)
    cmd("stats").set_defaults(fn=cmd_stats)
    return p


def main(argv=None):
    a = build_parser().parse_args(argv)
    try:
        if a.agent and not AGENT_RE.match(a.agent):
            raise CliError("Invalid agent id %r: 1-256 chars of letters, digits, _ . @ : = -" % a.agent, 2)
        if not NS_RE.match(a.ns):
            raise CliError("Invalid namespace %r: start with a letter or digit; then letters, digits, _ or -" % a.ns, 2)
        client = Client(a.url, env("MEMFORGE_TOKEN"), a.agent, a.ns, a.timeout)
        a.fn(client, a)
        return 0
    except CliError as err:
        print("memforge: %s" % err, file=sys.stderr)
        return err.code
    except ValueError as err:
        print("memforge: unexpected response from server: %s" % err, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
