# 9e Léger Uniform Guide

Website of the uniform guide of the 9e Léger, with member accounts, members-only sections and in-page editing.

- `site/` — the static website published by Netlify (configured in `netlify.toml`).
- `supabase/` — database schema, squads list and multilingual e-mail templates.
- `test/` — browser tests against an in-memory stand-in for Supabase.

Content is stored in the Supabase database, not in this repository. Members-only content (`seed.json`, evidence images) must never be committed.
