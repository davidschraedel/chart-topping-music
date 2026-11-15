# Documentation Directory - AI Context & Reference

This is the central reference index and navigation map for AI assistants working on the **Chart-topping Music Data Collection** repository.

To avoid redundancy and maintain a Single Source of Truth (SSOT), detailed goals, strategy, rules, and technical conventions are maintained in their respective authoritative files.

---

## 1. Project Overview

We are building a standalone weekly data collector that compiles the owner's own dataset of Global 50 chart hits enriched with deep audio stats (BPM, key, mode, energy, danceability, valence, acousticness) into a single flat CSV (`data/chart_dataset.csv`).

For full details on project purpose, boundaries, strategy, and current progress:
- **Problem, Vision, Mission, and Strategy**: See [steering-ladder.md](file:///Users/davidschraedel/Desktop/Files/Projects/code/ChartToppingMusicScraper/chart-topping-music/aiDocs/steering-ladder.md)

---

## 2. Authoritative Documentation Index (SSOT)

| Document | Primary Responsibility / What to Look Up Here |
| :--- | :--- |
| [steering-ladder.md](file:///Users/davidschraedel/Desktop/Files/Projects/code/ChartToppingMusicScraper/chart-topping-music/aiDocs/steering-ladder.md) | **Goals, Strategy & State**: Core problem, long-term vision, two-step pipeline policy, feasibility gates, and current phase progress. |
| [coding-style.md](file:///Users/davidschraedel/Desktop/Files/Projects/code/ChartToppingMusicScraper/chart-topping-music/aiDocs/coding-style.md) | **Engineering Standards**: TypeScript types (`ChartEntry`), string normalization & matching rules, locator practices, and error handling. |
| [README.md](file:///Users/davidschraedel/Desktop/Files/Projects/code/ChartToppingMusicScraper/chart-topping-music/README.md) | **User Guide & Ops**: Prerequisites, `.env` configuration keys, CLI execution commands, output file paths, and scheduling instructions. |
| [AGENTS.md](file:///Users/davidschraedel/Desktop/Files/Projects/code/ChartToppingMusicScraper/chart-topping-music/AGENTS.md) | **Agent Conduct**: Rules of engagement for AI assistants. |

---

## Repository Structure

```
chart-topping-music/
├── aiDocs/                     # TRACKED permanent project knowledge
│   ├── context.md              # This file (AI context & architectural reference)
│   ├── steering-ladder.md      # Problem, Vision, Mission, Strategy, Plan, State
│   └── coding-style.md         # Engineering standards & schema definitions
├── ai/                         # Workspace notes & research scratchpad
│   ├── notes/                  # Reference notes (e.g., Playwright best practices)
│   └── roadmaps/               # Task checklists
├── data/                       # Scraped and normalized output
│   ├── chart_dataset.csv       # Master append-only weekly dataset
│   └── raw/                    # Raw JSON captures and failure screenshots (<source>/<date>/)
├── scripts/                    # Standalone automation scripts
│   └── chart-dataset.ts        # Main weekly scraper script (npx tsx scripts/chart-dataset.ts)
├── AGENTS.md                   # Agent guidelines & rules of engagement
├── README.md                   # Project overview & quickstart
├── .env.example                # Blank environment config template
└── package.json                # Dependencies and npm scripts
```

## Technology Stack

- **Runtime & Execution**: Node.js (v18+), TypeScript, executed directly via `tsx` (`npx tsx scripts/chart-dataset.ts`)
- **Browser Automation**: Playwright (Chromium headless, used strictly for Step 2)
- **Data Serialization**: `csv-parse` and `csv-stringify`
- **Configuration**: `dotenv` with validated required keys
- **Scheduling**: Manual execution initially; documented macOS `launchd` or `cron` for unattended runs
