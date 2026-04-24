package com.lastmanstanding.provider;

import java.time.LocalDate;
import java.util.List;

/**
 * Provider interface for importing teams, fixtures and results from an external source.
 */
public interface FixtureProvider {

    List<ProviderTeam> fetchTeams();

    List<ProviderFixture> fetchFixtures(LocalDate from, LocalDate to);

    List<ProviderFixture> fetchResults(LocalDate from, LocalDate to);

    /** Evict any cached data so the next fetch goes to the source. */
    default void evictAll() {}

    // ── DTOs ────────────────────────────────────────────────────────────

    record ProviderTeam(
            String externalId,
            String name,
            String shortName,
            String logoUrl
    ) {}

    record ProviderFixture(
            String externalFixtureId,
            String homeTeamExternalId,
            String awayTeamExternalId,
            java.time.LocalDateTime kickoffAt,
            String status,      // SCHEDULED, FINISHED, POSTPONED, IN_PLAY, CANCELLED
            Integer scoreHome,
            Integer scoreAway,
            int weekNumber       // gameweek number
    ) {}
}
