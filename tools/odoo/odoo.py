#!/usr/bin/env python3
"""Minimal Odoo external-API client and CLI.

Talks to Odoo over XML-RPC, which is available on Odoo Online (SaaS),
Odoo.sh and self-hosted alike. Standard library only.

Credentials come from the environment or from a `.env.odoo` file next to
this script (or at the repo root). Never pass them on the command line.

    ODOO_URL      https://yourcompany.odoo.com
    ODOO_DB       database name (defaults to the subdomain of ODOO_URL)
    ODOO_USER     the login email you sign in with
    ODOO_API_KEY  API key from Preferences > Account Security > New API Key

Usage:
    ./odoo.py ping
    ./odoo.py apps
    ./odoo.py models project
    ./odoo.py fields project.task
    ./odoo.py query project.task --fields name,stage_id --limit 10
    ./odoo.py query res.partner --domain '[["is_company","=",true]]'
    ./odoo.py call project.project create --args '[{"name":"MadGigz"}]'
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import xmlrpc.client
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
ENV_CANDIDATES = [HERE / ".env.odoo", HERE.parent.parent / ".env.odoo"]


class OdooError(Exception):
    pass


def load_env() -> dict:
    """Environment wins; a `.env.odoo` file fills in the rest."""
    values = {}
    for path in ENV_CANDIDATES:
        if not path.exists():
            continue
        for raw in path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            values.setdefault(key.strip(), val.strip().strip("'\""))
        break
    for key in ("ODOO_URL", "ODOO_DB", "ODOO_USER", "ODOO_API_KEY"):
        if os.environ.get(key):
            values[key] = os.environ[key]
    return values


class Odoo:
    def __init__(self, url: str, db: str, user: str, api_key: str):
        self.url = url.rstrip("/")
        self.db = db
        self.user = user
        self._key = api_key
        self._common = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/common")
        self._models = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/object")
        self.uid = None
        self.version = None

    def connect(self) -> int:
        try:
            self.version = self._common.version()
        except Exception as exc:  # network, DNS, TLS, wrong path
            raise OdooError(f"Could not reach {self.url}: {exc}") from exc
        try:
            uid = self._common.authenticate(self.db, self.user, self._key, {})
        except xmlrpc.client.Fault as exc:
            raise OdooError(
                f"Odoo rejected the login for database '{self.db}': {exc.faultString.strip()}"
            ) from exc
        if not uid:
            raise OdooError(
                "Authentication failed. Check ODOO_DB, ODOO_USER and that the "
                "API key is still active (Preferences > Account Security)."
            )
        self.uid = uid
        return uid

    def execute(self, model: str, method: str, args=None, kwargs=None):
        if self.uid is None:
            self.connect()
        try:
            return self._models.execute_kw(
                self.db, self.uid, self._key, model, method, args or [], kwargs or {}
            )
        except xmlrpc.client.Fault as exc:
            raise OdooError(f"{model}.{method} failed: {exc.faultString.strip()}") from exc

    # Convenience wrappers -------------------------------------------------
    def search_read(self, model, domain=None, fields=None, limit=None, order=None):
        kwargs = {}
        if fields:
            kwargs["fields"] = fields
        if limit:
            kwargs["limit"] = limit
        if order:
            kwargs["order"] = order
        return self.execute(model, "search_read", [domain or []], kwargs)

    def fields_get(self, model):
        return self.execute(
            model, "fields_get", [], {"attributes": ["string", "type", "required", "relation"]}
        )


def client() -> Odoo:
    env = load_env()
    url = env.get("ODOO_URL")
    if not url:
        raise OdooError(
            "No credentials found. Create tools/odoo/.env.odoo — see "
            "tools/odoo/README.md for the four values it needs."
        )
    db = env.get("ODOO_DB") or urlparse(url).hostname.split(".")[0]
    user, key = env.get("ODOO_USER"), env.get("ODOO_API_KEY")
    if not user or not key:
        raise OdooError("ODOO_USER and ODOO_API_KEY must both be set in .env.odoo.")
    return Odoo(url, db, user, key)


def out(data):
    print(json.dumps(data, indent=2, default=str))


# Commands -----------------------------------------------------------------
def cmd_ping(args):
    odoo = client()
    uid = odoo.connect()
    server = odoo.version.get("server_version", "unknown")
    print(f"Connected to {odoo.url}")
    print(f"  database      {odoo.db}")
    print(f"  odoo version  {server}")
    print(f"  user          {odoo.user} (uid {uid})")
    company = odoo.search_read("res.company", fields=["name", "currency_id"], limit=5)
    for row in company:
        print(f"  company       {row['name']}  [{row['currency_id'][1]}]")


def cmd_apps(args):
    odoo = client()
    mods = odoo.search_read(
        "ir.module.module",
        [["state", "=", "installed"]],
        ["name", "shortdesc"],
        order="name",
    )
    for m in mods:
        print(f"{m['name']:<32} {m['shortdesc']}")
    print(f"\n{len(mods)} modules installed.")


def cmd_models(args):
    odoo = client()
    domain = [["model", "like", args.filter]] if args.filter else []
    rows = odoo.search_read("ir.model", domain, ["model", "name"], order="model")
    for r in rows:
        print(f"{r['model']:<40} {r['name']}")
    print(f"\n{len(rows)} models.")


def cmd_fields(args):
    odoo = client()
    data = odoo.fields_get(args.model)
    for name in sorted(data):
        f = data[name]
        rel = f" -> {f['relation']}" if f.get("relation") else ""
        req = " *required" if f.get("required") else ""
        print(f"{name:<32} {f['type']}{rel}{req}  ({f.get('string','')}){req}")


def cmd_query(args):
    odoo = client()
    domain = json.loads(args.domain) if args.domain else []
    fields = args.fields.split(",") if args.fields else None
    out(odoo.search_read(args.model, domain, fields, args.limit, args.order))


def cmd_call(args):
    odoo = client()
    out(
        odoo.execute(
            args.model,
            args.method,
            json.loads(args.args) if args.args else [],
            json.loads(args.kwargs) if args.kwargs else {},
        )
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Odoo external-API client")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("ping", help="verify credentials and show server info").set_defaults(
        func=cmd_ping
    )
    sub.add_parser("apps", help="list installed modules").set_defaults(func=cmd_apps)

    p = sub.add_parser("models", help="list models, optionally filtered")
    p.add_argument("filter", nargs="?")
    p.set_defaults(func=cmd_models)

    p = sub.add_parser("fields", help="describe a model's fields")
    p.add_argument("model")
    p.set_defaults(func=cmd_fields)

    p = sub.add_parser("query", help="search_read records")
    p.add_argument("model")
    p.add_argument("--fields")
    p.add_argument("--domain", help="JSON domain, e.g. '[[\"active\",\"=\",true]]'")
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("--order")
    p.set_defaults(func=cmd_query)

    p = sub.add_parser("call", help="call any model method")
    p.add_argument("model")
    p.add_argument("method")
    p.add_argument("--args", help="JSON list of positional args")
    p.add_argument("--kwargs", help="JSON object of keyword args")
    p.set_defaults(func=cmd_call)

    args = parser.parse_args()
    try:
        args.func(args)
    except OdooError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
