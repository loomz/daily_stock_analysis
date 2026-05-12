# Roo Code Integration

This directory contains project-specific configuration and documentation for Roo Code integration with the stock analyzer project.

## Overview

The stock analyzer project (A股/港股/美股智能分析系统) is a comprehensive stock analysis system covering A-shares, Hong Kong stocks, and US stocks. It provides:

- **Data fetching**: Multi-source strategy with fallback (Eastmoney, Tushare, AKShare, Yahoo Finance, etc.)
- **Technical analysis**: Trend analysis, volume analysis, chip structure
- **News intelligence**: Real-time news retrieval and sentiment analysis
- **LLM-powered analysis**: Unified LLM client (LiteLLM) for market analysis
- **Report generation**: Jinja2 templates for customizable reports
- **Multi-channel notification**: Feishu, DingTalk, Discord, email
- **Web & Desktop apps**: FastAPI backend with React frontend and Electron desktop client

## Project Structure

```
.
├── main.py                    # Main entry point for analysis tasks
├── server.py                  # FastAPI service entry
├── requirements.txt           # Python dependencies
├── AGENTS.md                  # AI collaboration rules (single source of truth)
├── CLAUDE.md                  # Symlink to AGENTS.md
├── SKILL.md                   # Stock analyzer skill documentation
│
├── src/                       # Core backend logic
│   ├── core/                  # Main workflow orchestration
│   ├── services/              # Business services
│   ├── repositories/          # Data access layer
│   ├── reports/               # Report generation
│   └── schemas/               # Schema / data structures
│
├── data_provider/             # Multi-source data adapters
├── api/                       # FastAPI API endpoints
├── bot/                       # Bot integrations
├── scripts/                   # Local scripts
├── tests/                     # pytest test suite
├── docs/                      # Documentation
│
├── apps/
│   ├── dsa-web/               # Web frontend (React)
│   └── dsa-desktop/           # Electron desktop client
│
└── .github/
    └── workflows/              # CI/CD pipelines
```

## Quick Start

### Running the Application

```bash
# Run analysis task
python main.py

# Debug mode
python main.py --debug

# Dry run (fetch data only)
python main.py --dry-run

# Analyze specific stocks
python main.py --stocks 600519,hk00700,AAPL

# Market review
python main.py --market-review

# Run as FastAPI server
python main.py --serve
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

### Testing

```bash
# Run all CI gate checks
./scripts/ci_gate.sh

# Run offline tests
python -m pytest -m "not network"

# Run specific test scenarios
./scripts/test.sh quick       # Quick test (single stock)
./scripts/test.sh a-stock     # A-share analysis
./scripts/test.sh hk-stock    # Hong Kong stock analysis
./scripts/test.sh us-stock    # US stock analysis
./scripts/test.sh market      # Market review
./scripts/test.sh code        # Code recognition test
```

## Configuration

All configuration is managed via `.env` file. See `.env.example` for available options.

Key configuration categories:
- **API Keys**: LLM providers, search engines, data sources
- **Notification**: Feishu, DingTalk, Discord webhooks
- **Analysis**: Stock watchlist, analysis frequency, report format
- **Data Sources**: Source priority, timeout, retry settings

## AI Collaboration

This project uses `AGENTS.md` as the single source of truth for AI collaboration rules. See [`AGENTS.md`](../AGENTS.md) for:

- Hard rules and constraints
- AI asset governance
- Default workflow
- Verification matrix
- Stability guardrails
- Delivery requirements

## Stock Analyzer Skill

The project provides a `stock_analyzer` skill for analyzing stocks and markets. See [`SKILL.md`](../SKILL.md) for:

- [`analyze_stock()`](../src/services/analyzer_service.py) - Analyze a single stock
- [`analyze_stocks()`](../src/services/analyzer_service.py) - Analyze multiple stocks
- [`perform_market_review()`](../src/services/analyzer_service.py) - Market review

## Deployment

- **Docker**: See `docker/` directory
- **CI/CD**: See `.github/workflows/`
- **Desktop**: See `apps/dsa-desktop/`
- **Web**: See `apps/dsa-web/`

## License

See [LICENSE](../LICENSE) for project license information.
