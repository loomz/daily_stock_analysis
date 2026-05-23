# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. Hard Rules

- Follow existing directory boundaries:
  - Backend logic goes in `src/`, `data_provider/`, `api/`, `bot/`
  - Web frontend changes in `apps/dsa-web/`
  - Desktop changes in `apps/dsa-desktop/`
  - Deployment and CI changes in `scripts/`, `.github/workflows/`, `docker/`
- Do not run `git commit`, `git tag`, or `git push` without explicit user confirmation.
- Commit messages in English, no `Co-Authored-By`.
- Never hardcode secrets, accounts, paths, model names, ports, or environment-specific logic.
- Reuse existing modules, config entrypoints, scripts, and tests instead of creating parallel implementations.
- Stability over convenience refactors. Skip restructuring, abstractions, or infrastructure migration unless directly required by the current task.
- When adding new config options, sync `.env.example` and relevant docs.
- When changing user-visible capabilities, CLI/API behavior, deployment, notifications, or report structure, update relevant docs and `docs/CHANGELOG.md`.
- `docs/CHANGELOG.md` `[Unreleased]` section uses **flat format**: one entry per line as `- [类型] 描述`. Type values: `新功能`/`改进`/`修复`/`文档`/`测试`/`chore`. **Do not add `### category headers` inside `[Unreleased]`** to reduce merge conflicts. Maintainer reorganizes at release time.
- `README.md` is for project positioning, high-level capabilities, quick start, main entrypoints, and sponsorship only; avoid updating unless homepage-level change.
- Detailed module behavior, page interaction, config, troubleshooting, field contracts go in `docs/*.md`, not README.
- When updating one language version of a doc, evaluate whether the counterpart needs syncing; explain why if not.
- Comments, docstrings, log messages should be clear and accurate. Chinese or English is fine, match the file's existing language.

### PR Title Convention (non-blocking)

- Use `<type>: <change summary>`, e.g. `fix: 修复大盘分析历史记录丢失`. Types: `fix`/`feat`/`refactor`/`docs`/`chore`/`test`/`ci`.
- Avoid `[codex]`, `codex`, `autocode`, `copilot` or other tool/agent source prefixes.
- This is guidance, not a review blocker.

## 2. AI Collaboration Assets

- `CLAUDE.md` is the single source of truth for AI collaboration rules in this repository.
- `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md` are mirrors for Copilot; if they conflict with `CLAUDE.md`, follow `CLAUDE.md`.
- Repository collaboration skills live in `.claude/skills/`; analysis artifacts go in `.claude/reviews/`.
- Root `SKILL.md` and `docs/openclaw-skill-integration.md` describe product/external integration, not repository governance.
- When modifying AI governance assets, run:

```bash
python scripts/check_ai_assets.py
```

## 3. Repository Overview

- **Project**: Stock AI analysis system covering A-shares, Hong Kong stocks, and US stocks.
- **Pipeline**: Fetch data → Technical analysis/News search → LLM analysis → Generate report → Push notifications.
- **Key entry points**:
  - `main.py`: Main analysis task entry
  - `server.py`: FastAPI service entry
  - `apps/dsa-web/`: Web frontend (Vite + React)
  - `apps/dsa-desktop/`: Electron desktop app
  - `.github/workflows/`: CI, releases, daily tasks
- **Core modules**:
  - `src/core/`: Pipeline orchestration (pipeline, market review, backtest, config, trading calendar)
  - `src/services/`: Business services (analysis, alert, backtest, portfolio, agent, task, etc.)
  - `src/repositories/`: Data access layer
  - `src/reports/`: Report generation
  - `src/schemas/`: Schema / data structures
  - `src/notification_sender/`: Notification senders (email, wechat, feishu, telegram, discord, slack, etc.)
  - `src/agent/`: Agent strategy executor
  - `src/llm/`: LLM routing
  - `data_provider/`: Multi-data-source adapters with fallback
  - `api/`: FastAPI API
  - `bot/`: Bot integrations
  - `static/`: Pre-built frontend static assets (from `apps/dsa-web/` build)
  - `scripts/`: Local scripts
  - `.github/scripts/`: GitHub automation scripts
  - `tests/`: pytest tests
  - `docs/`: Documentation

## 4. Common Commands

### Run Application

```bash
python main.py                          # Full analysis pipeline
python main.py --debug                  # Debug mode
python main.py --dry-run                # Fetch data only, no AI analysis
python main.py --stocks 600519,hk00700,AAPL  # Specify stocks
python main.py --market-review          # Market review only
python main.py --no-market-review       # Skip market review
python main.py --force-run              # Skip trading day check, force run
python main.py --schedule               # Scheduled task mode
python main.py --webui                  # Web UI + auto analysis
python main.py --webui-only             # Web service only, no auto analysis
python main.py --serve                  # FastAPI + run analysis tasks
python main.py --serve-only             # FastAPI backend only, no auto analysis
python main.py --port 8000 --host 0.0.0.0  # Custom port/host
python main.py --no-notify              # Disable push notifications
python main.py --single-notify          # Push per-stock instead of batch
python main.py --check-notify           # Read-only check notification config
python main.py --backtest               # Run backtest
python main.py --backtest-code 600519   # Backtest specific stock
python main.py --backtest-days 60       # Backtest window (trading days)
python main.py --backtest-force         # Force re-backtest
```

### Backend Validation

```bash
pip install -r requirements.txt
./scripts/ci_gate.sh                    # Full CI gate (syntax + flake8 + deterministic + offline-tests)
./scripts/ci_gate.sh syntax             # Syntax check only
./scripts/ci_gate.sh flake8             # Flake8 only
./scripts/ci_gate.sh deterministic      # Deterministic checks only
./scripts/ci_gate.sh offline-tests      # Offline test suite only
python -m py_compile <changed_file>     # Minimum requirement
```

### Tests

```bash
python -m pytest                        # All tests
python -m pytest -m "not network"       # Exclude network tests
python -m pytest -m network             # Network tests only
python -m pytest tests/test_xxx.py      # Single file
python -m pytest tests/test_xxx.py::test_func  # Single function
./scripts/test.sh quick                 # Quick integration test (single stock)
./scripts/test.sh full                  # Full pipeline integration test
```

### Code Formatting (local)

```bash
black .                                 # Format code (line-length=120)
isort .                                 # Sort imports
```

### Integration Test Script

```bash
./scripts/test.sh quick                 # Quick test
./scripts/test.sh market                # Market review
./scripts/test.sh a-stock               # A-share analysis
./scripts/test.sh hk-stock              # HK stock analysis
./scripts/test.sh us-stock              # US stock analysis
./scripts/test.sh mixed                 # Mixed market
./scripts/test.sh dry-run               # Data fetch only
```

### Web / Desktop

```bash
cd apps/dsa-web && npm ci && npm run lint && npm run build
cd apps/dsa-desktop && npm install && npm run build
```

### PR / CI Evidence

```bash
gh pr view <pr_number>
gh pr checks <pr_number>
gh run view <run_id> --log-failed
```

## 5. Default Workflow

1. Determine task type: `fix / feat / refactor / docs / chore / test / review`
2. Read existing implementation, config, tests, scripts, workflows, and docs before modifying.
3. Identify change boundary: backend / API / Web / Desktop / Workflow / Docs / AI assets.
4. Check if hitting high-risk areas: config semantics, API/Schema, data source fallback, report structure, auth, scheduling, release, desktop launch.
5. Make only the minimum change directly related to the current task.
6. If docs/scripts/workflows are inconsistent with code, trust actual code and workflows, then decide whether to fix docs.
7. Run verification matrix after changes.
8. Default delivery format:
   - What changed
   - Why
   - Verification status
   - Unverified items
   - Risks
   - Rollback plan

## 6. Verification Matrix

### CI Coverage

| Check | Source | Description | Blocking |
| --- | --- | --- | --- |
| `ai-governance` | `.github/workflows/ci.yml` | Validates AI governance assets | Yes |
| `backend-gate` | `.github/workflows/ci.yml` | Runs `./scripts/ci_gate.sh` | Yes |
| `docker-build` | `.github/workflows/ci.yml` | Docker build + key module import smoke | Yes |
| `web-gate` | `.github/workflows/ci.yml` | `npm run lint` + `npm run build` on frontend changes | Yes (when triggered) |
| `network-smoke` | `.github/workflows/network-smoke.yml` | `pytest -m network` + `scripts/test.sh quick` | No, observational |
| `pr-review` | `.github/workflows/pr-review.yml` | Static check + AI review + auto-label | No, advisory |

If CI already covers the PR, reference CI results. If CI doesn't cover the change, add local verification notes.

### By Change Area

- **Python backend**: `main.py`, `src/`, `data_provider/`, `api/`, `bot/`, `tests/`
  - Run `./scripts/ci_gate.sh` or at minimum `python -m py_compile` on changed files.
  - Note API, pipeline, report, notification, data source fallback, auth, scheduling coverage.

- **Web frontend**: `apps/dsa-web/`
  - Run `cd apps/dsa-web && npm ci && npm run lint && npm run build`
  - If touching API integration, routing, state management, Markdown/chart rendering, or auth, document the impact.

- **Desktop**: `apps/dsa-desktop/`, `scripts/run-desktop.ps1`, `scripts/build-desktop*.ps1`, `scripts/build-*.sh`
  - Build web first, then desktop.
  - If platform limits prevent full Electron validation, document the risk.

- **API / Schema / Auth**: `api/**`, `src/schemas/**`, `src/services/**`, client apps
  - Cover backend validation + affected client build verification.
  - Document compatibility impact for login, cookies, sessions, polling, field changes.

- **Docs / governance**: `README.md`, `docs/**`, `CLAUDE.md`, `.github/**`, `.claude/skills/**`
  - No code tests required. Verify commands, config keys, filenames, workflow names match reality.
  - Run `python scripts/check_ai_assets.py` for AI governance changes.

- **Workflow / scripts / Docker**: `.github/**`, `scripts/**`, `docker/**`
  - Run closest local validation. Document affected pipeline/release/deployment path.

- **Network / third-party deps**:
  - Run offline/deterministic checks first.
  - Verify timeout, retry, fallback, error messages, degradation paths.
  - If online verification is skipped, explain why.

## 7. Stability Guardrails

- **Config & entry points**: Changes to `.env` semantics, defaults, CLI args, service startup, or scheduling must assess impact on local, Docker, GitHub Actions, API, Web, and Desktop.
- **Data sources & fallback**: Changes to `data_provider/` must preserve provider priority, normalization, timeout/retry, and graceful degradation. Single provider failure should not break the pipeline unless explicitly required.
- **API / Web / Desktop compatibility**: API/Schema/auth/report payload changes require checking backend, Web, and Desktop. Prefer additive fields, keep old fields, or provide compat layers.
- **Reports / Prompts / notifications**: Upstream-downstream compatibility check. Single notification channel failure should not break the main flow. When modifying `EXTRACT_PROMPT` in `src/services/image_stock_extractor.py`, include the full updated prompt in the PR description.
- **Workflow / release / packaging**: Assess trigger conditions, artifact paths, permission boundaries, rollback. Auto-tag is opt-in: only commit titles with `#patch`/`#minor`/`#major` trigger version bumps.

## 8. Issue / PR / Skill Workflow

- Available skills in `.claude/skills/`:
  - `analyze-issue/SKILL.md`
  - `analyze-pr/SKILL.md`
  - `fix-issue/SKILL.md`
- For issue analysis, PR review, or issue fixes, use the corresponding skill and save artifacts to `.claude/reviews/`.
- Skills must align with `CLAUDE.md`.
- Skills must not execute `git pull`, `git push`, `git tag`, `gh pr create` without user confirmation.
- PR review order: necessity → relevance → title suggestion → description completeness → verification evidence → correctness → merge decision.
- For `fix` PRs: document original issue, root cause, fix point, regression risk.
- Merge blockers: correctness/security issues, failing blocking CI, PR description mismatch with changes, missing rollback plan.

## 9. Delivery & Release

- Default delivery structure: `改了什么` → `为什么这么改` → `验证情况` → `未验证项` → `风险点` → `回滚方式`
- For `docs` tasks: `Docs only, tests not run` + note whether commands/filenames were verified.
- Auto-tag is opt-in via `#patch`/`#minor`/`#major` in commit title.
- Manual tags must use annotated tags.
- User-visible changes should go through PRs with labels and verification notes.
