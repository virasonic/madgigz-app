# Odoo access

`odoo.py` is a small XML-RPC client so Claude Code can read and write your
Odoo data — projects, tasks, invoices, contacts, website pages — from this
repo. Python standard library only, nothing to install.

## One-time setup (you do this part)

Claude never handles your password. Odoo API keys are per-user and revocable,
which is what we use instead.

1. Sign in to Odoo in your browser.
2. Click your avatar (top right) → **My Profile** (or *Preferences*).
3. Open the **Account Security** tab → **New API Key**.
4. Name it `claude-code`, set a duration, copy the key. Odoo shows it once.
5. Create `tools/odoo/.env.odoo` with these four lines:

```
ODOO_URL=https://yourcompany.odoo.com
ODOO_DB=yourcompany
ODOO_USER=you@example.com
ODOO_API_KEY=paste-the-key-here
```

`.env.odoo` is covered by the repo's `.gitignore` (`.env*`) so it will not be
committed. If you're on Odoo Online and unsure of `ODOO_DB`, leave the line
out — it defaults to the subdomain of `ODOO_URL`.

To revoke access later, delete the key from that same Account Security tab.

## Checking it works

```bash
python3 "tools/odoo/odoo.py" ping
```

Prints the server version, your uid, and your company — that means the
connection is live.

## Other commands

```bash
python3 tools/odoo/odoo.py apps                  # what's installed
python3 tools/odoo/odoo.py models project        # find model names
python3 tools/odoo/odoo.py fields project.task   # a model's fields
python3 tools/odoo/odoo.py query project.task --fields name,stage_id --limit 10
python3 tools/odoo/odoo.py query res.partner --domain '[["is_company","=",true]]'
python3 tools/odoo/odoo.py call project.project create --args '[{"name":"MadGigz"}]'
```

`call` reaches any model method, so anything the Odoo UI can do, this can do
as the same user — with the same access rights as that user, no more.
