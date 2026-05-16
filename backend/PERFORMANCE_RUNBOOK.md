# Performance Runbook

## Enabled instrumentation

The backend records duration and SQL statement count for these hotspots:

- `GET /competitions/my/details`
- `GET /competitions/{id}/survivor-table`
- `GET /competitions/{id}/gameweeks/{gwId}/selections`

Metrics emitted:

- `app.endpoint.duration` (Timer)
- `app.endpoint.sql.statements` (DistributionSummary)

Tags:

- `endpoint`
- `status`
- `outcome`

## Toggle

Set env var to disable quickly:

- `ENDPOINT_METRICS_ENABLED=false`

Default is enabled.

## Where to read metrics

- `GET /actuator/metrics/app.endpoint.duration`
- `GET /actuator/metrics/app.endpoint.sql.statements`
- `GET /actuator/prometheus`

## Quick interpretation guide

1. Track latency first:
- Watch `p95`/`p99` for `app.endpoint.duration` per endpoint tag.

2. Correlate with SQL count:
- If duration rises with SQL/request, optimize query shape first.
- If SQL/request is flat but duration rises, inspect DB plans, locks, and payload size.

3. Log sampling:
- Filter logs by `perf endpoint=` to review per-request timing and SQL statements.

## Practical thresholds (starting point)

- `my/details`: target `< 200ms` p95 and low double-digit SQL/request
- `survivor-table`: target `< 350ms` p95 and stable SQL/request
- `gameweek selections`: target `< 250ms` p95 and stable SQL/request

Tune thresholds with real traffic.

