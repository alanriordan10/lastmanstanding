package com.lastmanstanding.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCallback;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

@Service
public class FixtureMutationLockService {

    private static final long FIXTURE_MUTATION_LOCK_KEY = 4815162342L;

    private final ReentrantLock lock = new ReentrantLock(true);
    private final JdbcTemplate jdbcTemplate;

    public FixtureMutationLockService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void runWithLock(Runnable action) {
        lock.lock();
        try {
            acquireDbLock();
            action.run();
        } finally {
            lock.unlock();
        }
    }

    public <T> T callWithLock(Supplier<T> action) {
        lock.lock();
        try {
            acquireDbLock();
            return action.get();
        } finally {
            lock.unlock();
        }
    }

    public boolean tryRunWithLock(Runnable action) {
        if (!lock.tryLock()) {
            return false;
        }
        try {
            if (!tryAcquireDbLock()) {
                return false;
            }
            action.run();
            return true;
        } finally {
            lock.unlock();
        }
    }

    private void acquireDbLock() {
        ensureTransaction();
        jdbcTemplate.execute(
                "select pg_advisory_xact_lock(?)",
                (PreparedStatementCallback<Void>) preparedStatement -> {
                    preparedStatement.setLong(1, FIXTURE_MUTATION_LOCK_KEY);
                    preparedStatement.execute();
                    return null;
                }
        );
    }

    private boolean tryAcquireDbLock() {
        ensureTransaction();
        Boolean acquired = jdbcTemplate.queryForObject(
                "select pg_try_advisory_xact_lock(?)",
                Boolean.class,
                FIXTURE_MUTATION_LOCK_KEY
        );
        return Boolean.TRUE.equals(acquired);
    }

    private void ensureTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("Fixture mutation lock requires an active transaction");
        }
    }
}
