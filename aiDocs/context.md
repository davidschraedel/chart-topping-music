# Documentation Directory - AI Context & Reference

This is the central reference index and navigation map for AI assistants working on the **Chart-topping Music Data Collection** repository.

---

## 1. Project Overview

A weekly data collector that compiles a personal dataset of top music chart hits enriched with song audio characteristics into a flat CSV.

---

## 2. Documentation Index

| Document | Responsibility |
| :--- | :--- |
| [steering-ladder.md](file:///Users/davidschraedel/Desktop/Files/Projects/code/ChartToppingMusicScraper/chart-topping-music/aiDocs/steering-ladder.md) | Project goals, strategy, plan, and current progress. |
| [coding-style.md](file:///Users/davidschraedel/Desktop/Files/Projects/code/ChartToppingMusicScraper/chart-topping-music/aiDocs/coding-style.md) | Engineering standards, conventions, and data schemas. |
| [README.md](file:///Users/davidschraedel/Desktop/Files/Projects/code/ChartToppingMusicScraper/chart-topping-music/README.md) | Setup, configuration, and execution instructions. |
| [AGENTS.md](file:///Users/davidschraedel/Desktop/Files/Projects/code/ChartToppingMusicScraper/chart-topping-music/AGENTS.md) | Rules of engagement for AI assistants. |

---

## 3. Repository Structure

```
chart-topping-music/
├── aiDocs/                     # Permanent documentation
│   ├── context.md              # Central AI reference index (this file)
│   ├── steering-ladder.md      # Project steering and status
│   └── coding-style.md         # Conventions and schemas
├── ai/                         # Temporary scratchpad (gitignored)
│   ├── notes/                  # Reference notes
│   └── roadmaps/               # Task checklists
├── data/                       # Scraped dataset and raw captures
├── scripts/                    # Automation scripts
├── AGENTS.md                   # AI rules of engagement
├── README.md                   # Project overview and setup
├── .env.example                # Config template
└── package.json                # Project dependencies
```

---

## 4. Technology Stack

- **Runtime & Language**: Node.js, TypeScript
- **Browser Automation**: Playwright (Chromium)
- **Data Serialization**: `csv-parse`, `csv-stringify`
- **Configuration**: `dotenv`
