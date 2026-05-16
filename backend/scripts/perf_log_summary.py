#!/usr/bin/env python3
import math
import re
import statistics
import sys
from collections import defaultdict

LINE_RE = re.compile(
    r"perf endpoint=(?P<endpoint>\S+)\s+method=(?P<method>\S+)\s+status=(?P<status>\d+)\s+durationMs=(?P<duration>\d+)\s+sqlStatements=(?P<sql>\d+)"
)


def percentile(values, p):
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    k = (len(values) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return float(values[int(k)])
    d0 = values[f] * (c - k)
    d1 = values[c] * (k - f)
    return float(d0 + d1)


def fmt(n):
    return f"{n:.1f}"


def main():
    lines = sys.stdin.read().splitlines()
    if not lines:
        print("No input. Pipe logs into this script.")
        print("Example: cat app.log | python3 backend/scripts/perf_log_summary.py")
        return

    by_endpoint = defaultdict(list)
    parse_count = 0
    for line in lines:
        m = LINE_RE.search(line)
        if not m:
            continue
        parse_count += 1
        endpoint = m.group("endpoint")
        duration = int(m.group("duration"))
        sql = int(m.group("sql"))
        status = m.group("status")
        method = m.group("method")
        by_endpoint[endpoint].append((duration, sql, status, method))

    if parse_count == 0:
        print("No perf lines matched.")
        print("Expected format: perf endpoint=... method=GET status=200 durationMs=... sqlStatements=...")
        return

    print(f"Parsed perf lines: {parse_count}")
    print("")
    for endpoint in sorted(by_endpoint.keys()):
        rows = by_endpoint[endpoint]
        durations = sorted(r[0] for r in rows)
        sqls = sorted(r[1] for r in rows)
        statuses = defaultdict(int)
        methods = defaultdict(int)
        for _, _, st, mt in rows:
            statuses[st] += 1
            methods[mt] += 1

        print(f"Endpoint: {endpoint}")
        print(f"  Count: {len(rows)}")
        print(f"  Methods: {dict(sorted(methods.items()))}")
        print(f"  Statuses: {dict(sorted(statuses.items()))}")
        print(
            "  Duration ms: "
            f"avg={fmt(statistics.mean(durations))} "
            f"p50={fmt(percentile(durations, 50))} "
            f"p95={fmt(percentile(durations, 95))} "
            f"p99={fmt(percentile(durations, 99))} "
            f"max={fmt(float(durations[-1]))}"
        )
        print(
            "  SQL statements: "
            f"avg={fmt(statistics.mean(sqls))} "
            f"p50={fmt(percentile(sqls, 50))} "
            f"p95={fmt(percentile(sqls, 95))} "
            f"max={fmt(float(sqls[-1]))}"
        )
        print("")


if __name__ == "__main__":
    main()

