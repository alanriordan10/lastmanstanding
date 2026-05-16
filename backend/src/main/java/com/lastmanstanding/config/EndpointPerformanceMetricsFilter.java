package com.lastmanstanding.config;

import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@ConditionalOnProperty(name = "app.perf.endpoint-metrics-enabled", havingValue = "true", matchIfMissing = true)
public class EndpointPerformanceMetricsFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(EndpointPerformanceMetricsFilter.class);

    private final MeterRegistry meterRegistry;

    public EndpointPerformanceMetricsFilter(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!"GET".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        return endpointTag(request.getRequestURI()).isEmpty();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String uri = request.getRequestURI();
        String endpoint = endpointTag(uri).orElse("unknown");
        JdbcQueryCountContext.reset();
        long startNanos = System.nanoTime();
        int status = 500;
        String outcome = "success";

        try {
            filterChain.doFilter(request, response);
            status = response.getStatus();
        } catch (Exception ex) {
            outcome = "error";
            throw ex;
        } finally {
            long elapsedNanos = System.nanoTime() - startNanos;
            long sqlStatements = JdbcQueryCountContext.get();
            JdbcQueryCountContext.clear();

            Timer.builder("app.endpoint.duration")
                    .description("Duration for selected high-traffic endpoints")
                    .tag("endpoint", endpoint)
                    .tag("status", Integer.toString(status))
                    .tag("outcome", outcome)
                    .register(meterRegistry)
                    .record(elapsedNanos, TimeUnit.NANOSECONDS);

            DistributionSummary.builder("app.endpoint.sql.statements")
                    .description("Prepared statement count for selected high-traffic endpoints")
                    .baseUnit("statements")
                    .tag("endpoint", endpoint)
                    .tag("status", Integer.toString(status))
                    .tag("outcome", outcome)
                    .register(meterRegistry)
                    .record(sqlStatements);

            long elapsedMs = TimeUnit.NANOSECONDS.toMillis(elapsedNanos);
            log.info("perf endpoint={} method={} status={} durationMs={} sqlStatements={}",
                    endpoint, request.getMethod(), status, elapsedMs, sqlStatements);
        }
    }

    private Optional<String> endpointTag(String uri) {
        if ("/competitions/my/details".equals(uri)) {
            return Optional.of("competitions_my_details");
        }
        if (uri.matches("^/competitions/\\d+/survivor-table$")) {
            return Optional.of("competition_survivor_table");
        }
        if (uri.matches("^/competitions/\\d+/gameweeks/\\d+/selections$")) {
            return Optional.of("competition_gameweek_selections");
        }
        return Optional.empty();
    }
}
