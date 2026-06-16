package com.lastmanstanding.scheduler;

import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionStatus;
import com.lastmanstanding.entity.Gameweek;
import com.lastmanstanding.entity.GameweekStatus;
import com.lastmanstanding.provider.FootballDataProvider;
import com.lastmanstanding.repository.CompetitionRepository;
import com.lastmanstanding.repository.GameweekRepository;
import com.lastmanstanding.service.FixtureSyncService;
import com.lastmanstanding.service.FixtureOddsSyncService;
import com.lastmanstanding.service.GameweekProcessingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

@Component
public class FixtureSyncScheduler {

    private static final Logger log = LoggerFactory.getLogger(FixtureSyncScheduler.class);
    private static final int MIN_UPCOMING_BUFFER = 3;

    private final FixtureSyncService fixtureSyncService;
    private final GameweekProcessingService gameweekProcessingService;
    private final FixtureOddsSyncService fixtureOddsSyncService;
    private final CompetitionRepository competitionRepository;
    private final GameweekRepository gameweekRepository;
    private final Optional<FootballDataProvider> footballDataProvider;

    public FixtureSyncScheduler(FixtureSyncService fixtureSyncService,
                                GameweekProcessingService gameweekProcessingService,
                                FixtureOddsSyncService fixtureOddsSyncService,
                                CompetitionRepository competitionRepository,
                                GameweekRepository gameweekRepository,
                                Optional<FootballDataProvider> footballDataProvider) {
        this.fixtureSyncService = fixtureSyncService;
        this.gameweekProcessingService = gameweekProcessingService;
        this.fixtureOddsSyncService = fixtureOddsSyncService;
        this.competitionRepository = competitionRepository;
        this.gameweekRepository = gameweekRepository;
        this.footballDataProvider = footballDataProvider;
    }

    /** Runs every 5 minutes. Cache TTLs handle whether a real API call is made. */
    @Scheduled(fixedRate = 300_000)
    public void syncFixtures() {
        try {
            if (footballDataProvider.isPresent() && hasTrackedLiveMatches(footballDataProvider.get())) {
                log.debug("Skipping standard fixture sync because live sync cadence is active.");
                return;
            }
            if (!fixtureSyncService.trySyncFixturesAndResults()) {
                log.info("Skipping scheduled fixture sync because another fixture update is already running.");
            }
        } catch (Exception e) {
            log.error("Fixture sync failed: {}", e.getMessage());
        }
    }

    /**
     * Runs every minute, but only when the upstream provider reports live matches.
     * This keeps live scores fresher without pushing normal traffic near the API limit.
     */
    @Scheduled(fixedRate = 60_000)
    public void syncLiveFixtures() {
        try {
            if (footballDataProvider.isEmpty() || !hasTrackedLiveMatches(footballDataProvider.get())) {
                return;
            }
            if (!fixtureSyncService.trySyncFixturesAndResults()) {
                log.info("Skipping live fixture sync because another fixture update is already running.");
            }
        } catch (Exception e) {
            log.error("Live fixture sync failed: {}", e.getMessage());
        }
    }

    private boolean hasTrackedLiveMatches(FootballDataProvider provider) {
        Set<String> sourceCodes = activeFixtureSourceCodes();
        for (String sourceCode : sourceCodes) {
            if (provider.hasLiveMatchesNow(sourceCode)) {
                log.debug("Live fixture sync active for source {}", sourceCode);
                return true;
            }
        }
        return false;
    }

    private Set<String> activeFixtureSourceCodes() {
        List<Competition> competitions = competitionRepository.findByStatusInOrderByStartDateAsc(
                List.of(CompetitionStatus.UPCOMING, CompetitionStatus.ACTIVE));
        Set<String> sourceCodes = new LinkedHashSet<>();
        for (Competition competition : competitions) {
            sourceCodes.add(normalizeFixtureSourceCode(competition.getFixtureCompetitionCode()));
        }
        return sourceCodes;
    }

    private String normalizeFixtureSourceCode(String sourceCode) {
        if (sourceCode == null || sourceCode.isBlank()) return "PL";
        return sourceCode.trim().toUpperCase(Locale.ROOT);
    }

    /** Odds sync cadence is configurable to balance freshness and API quota usage. */
    @Scheduled(cron = "${odds.sync-cron:0 */20 * * * *}")
    public void syncOdds() {
        try {
            int updated = fixtureOddsSyncService.syncOdds();
            if (updated > 0) {
                log.info("Synced odds for {} fixture(s)", updated);
            }
        } catch (Exception e) {
            log.error("Odds sync failed: {}", e.getMessage());
        }
    }

    /** Full sync once per day at 3am — evicts cache first so data is always fresh. */
    @Scheduled(cron = "0 0 3 * * *")
    public void dailyFullSync() {
        log.info("Running daily full sync...");
        try {
            footballDataProvider.ifPresent(FootballDataProvider::evictAll);
            if (fixtureSyncService.tryFullSync()) {
                log.info("Daily full sync complete.");
            } else {
                log.info("Skipping daily full sync because another fixture update is already running.");
            }
        } catch (Exception e) {
            log.error("Daily full sync failed: {}", e.getMessage());
        }
    }


    /**
     * Low-frequency top-up for future gameweeks.
     *
     * The normal 5-minute sync keeps nearby fixtures/results fresh, but it uses a tight
     * date window. This job uses the wider competition-specific sync only when a
     * competition is running low on future UPCOMING gameweeks.
     */
    @Scheduled(cron = "${fixture.buffer.sync-cron:0 17 */6 * * *}")
    public void maintainFutureGameweekBuffer() {
        try {
            List<Competition> comps = competitionRepository
                    .findByStatusInOrderByStartDateAsc(List.of(CompetitionStatus.UPCOMING, CompetitionStatus.ACTIVE));

            for (Competition comp : comps) {
                try {
                    long upcomingCount = gameweekRepository.findByCompetitionIdOrderByWeekNumberAsc(comp.getId()).stream()
                            .filter(gw -> gw.getStatus() == GameweekStatus.UPCOMING)
                            .count();

                    if (upcomingCount >= MIN_UPCOMING_BUFFER) {
                        log.debug("Competition {} has {} upcoming gameweek(s); buffer is healthy.",
                                comp.getId(), upcomingCount);
                        continue;
                    }

                    log.info("Competition {} has only {} upcoming gameweek(s); topping up future fixtures.",
                            comp.getId(), upcomingCount);
                    int synced = fixtureSyncService.syncForCompetition(comp);
                    log.info("Future fixture buffer sync for competition {} processed {} fixture(s).",
                            comp.getId(), synced);
                    if (synced == 0) {
                        log.info("Competition {} future fixture buffer unchanged; provider returned no eligible future fixtures.",
                                comp.getId());
                    }
                } catch (Exception e) {
                    log.warn("Future fixture buffer sync failed for competition {}: {}", comp.getId(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("Future fixture buffer maintenance failed: {}", e.getMessage());
        }
    }

    /** Process gameweek locks and results every 2 minutes. */
    @Scheduled(fixedRate = 120_000)
    public void processGameweeks() {
        // Auto-activate UPCOMING competitions whose first gameweek has locked
        List<Competition> upcomingComps = competitionRepository
                .findByStatusInOrderByStartDateAsc(List.of(CompetitionStatus.UPCOMING));
        for (Competition comp : upcomingComps) {
            List<Gameweek> gwList = gameweekRepository.findByCompetitionIdOrderByWeekNumberAsc(comp.getId());
            if (!gwList.isEmpty()) {
                Gameweek firstGw = gwList.get(0);
                if (firstGw.getLockAt() != null && LocalDateTime.now().isAfter(firstGw.getLockAt())) {
                    comp.setStatus(CompetitionStatus.ACTIVE);
                    competitionRepository.save(comp);
                    log.info("Auto-activated competition {} — first GW locked at {}", comp.getId(), firstGw.getLockAt());
                }
            }
        }

        // Lock + process results for UPCOMING and ACTIVE competitions
        List<Competition> comps = competitionRepository
                .findByStatusInOrderByStartDateAsc(List.of(CompetitionStatus.UPCOMING, CompetitionStatus.ACTIVE));

        for (Competition comp : comps) {
            List<Gameweek> gameweeks = gameweekRepository.findByCompetitionIdOrderByWeekNumberAsc(comp.getId());
            for (Gameweek gw : gameweeks) {
                try {
                    if (gw.getStatus() == GameweekStatus.UPCOMING &&
                            LocalDateTime.now().isAfter(gw.getLockAt())) {
                        gameweekProcessingService.lockGameweek(gw.getId());
                    }
                    if (comp.getStatus() == CompetitionStatus.ACTIVE &&
                            (gw.getStatus() == GameweekStatus.LOCKED ||
                             gw.getStatus() == GameweekStatus.IN_PROGRESS)) {
                        gameweekProcessingService.processGameweekResults(gw.getId());
                    }
                } catch (Exception e) {
                    log.error("Error processing GW{} for competition {}", gw.getWeekNumber(), comp.getId(), e);
                }
            }
        }
    }
}
