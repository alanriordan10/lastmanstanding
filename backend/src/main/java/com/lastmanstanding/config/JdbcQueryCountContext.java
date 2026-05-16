package com.lastmanstanding.config;

public final class JdbcQueryCountContext {

    private static final ThreadLocal<Long> QUERY_COUNT = ThreadLocal.withInitial(() -> 0L);

    private JdbcQueryCountContext() {}

    public static void reset() {
        QUERY_COUNT.set(0L);
    }

    public static void increment(long count) {
        if (count <= 0) return;
        QUERY_COUNT.set(QUERY_COUNT.get() + count);
    }

    public static long get() {
        return QUERY_COUNT.get();
    }

    public static void clear() {
        QUERY_COUNT.remove();
    }
}

