# x402 Ecosystem Snapshot

This workspace pulls the public partner directory from [x402.org](https://www.x402.org/ecosystem) and normalises it into a lightweight dataset you can query locally.  
Canonical repository: [Calcutatator/x402archive](https://github.com/Calcutatator/x402archive).

## Generated artifacts
- `data/projects.json` – structured array of partner records.
- `data/projects.csv` – the same records in tabular form.
- `data/projects.sql` – SQL to recreate the table and insert the rows.
- `data/projects.sqlite` – ready-to-query SQLite database built from the SQL.

All rows share these columns:

| Column | Notes |
| --- | --- |
| `project_name` | Display name from the x402 ecosystem listing. |
| `project_twitter` | Discovered X/Twitter profile (falls back to `unknown` if one was not found automatically). |
| `project_x402_mainnet` | Categorical summary derived from facilitator metadata; `Yes (...)`, `No (...)`, or `Unknown`. |
| `project_link` | Primary URL from the ecosystem listing. |
| `earliest_x402_mention` | Placeholder (`unknown`) for now; see “Next steps”. |
| `category` | Category label used on x402.org. |
| `slug` | Convenience slug derived from the upstream metadata or URL. |

## Request a project submission
Want to see a new project listed? Here’s the lightweight workflow:

1. **Fork & edit (preferred).** Fork [Calcutatator/x402archive](https://github.com/Calcutatator/x402archive), add a new directory under `scripts/overrides` or edit `scripts/build-db.mjs` to include your project details (name, category, primary link, optional Twitter override), then open a pull request against `main`.
2. **Open an issue.** If you’re not comfortable with Git, file an issue at [github.com/Calcutatator/x402archive/issues/new](https://github.com/Calcutatator/x402archive/issues/new) containing:
   - Project name & short description  
   - Primary URL (docs or landing page)  
   - Category (match an existing one if you can)  
   - Optional metadata: facilitator networks, earliest mention, Twitter/X handle
3. **Signal updates.** Already listed but something changed? Issues or PRs on the same repository work the same way—just flag the row to update.

Submissions stay in the `data/` artifacts only after being vetted against the upstream x402 ecosystem list so the dataset remains aligned.

## Query examples

```bash
# List facilitators that advertise Base mainnet support
sqlite3 data/projects.sqlite \\
  \"SELECT project_name, project_x402_mainnet FROM projects WHERE category = 'Facilitators';\"

# Dump the rows that still need manual Twitter review
sqlite3 data/projects.sqlite \\
  \"SELECT project_name, project_link FROM projects WHERE project_twitter = 'unknown';\"
```
