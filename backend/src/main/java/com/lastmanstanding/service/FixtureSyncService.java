package com.lastmanstanding.service;

import com.lastmanstanding.entity.*;
import com.lastmanstanding.provider.FixtureProvider;
import com.lastmanstanding.provider.FixtureProvider.ProviderFixture;
import com.lastmanstanding.provider.FixtureProvider.ProviderTeam;
import com.lastmanstanding.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service that syncs teams, fixtures, and results from a FixtureProvider into the DB.
 * Only updates imported fields; admin overrides are never touched.
 */
@Service
public class FixtureSyncService {

    private static final Logger log = LoggerFactory.getLogger(FixtureSyncService.class);

    private final FixtureProvider fixtureProvider;
    private final TeamRepository teamRepository;
    private final FixtureRepository fixtureRepository;
    private final GameweekRepository gameweekRepository;
    private final CompetitionRepository competitionRepository;

    public FixtureSyncService(FixtureProvider fixtureProvider,
                              TeamRepository teamRepository,
                              FixtureRepository fixtureRepository,
                              GameweekRepository gameweekRepository,
                              CompetitionRepository competitionRepository) {
        this.fixtureProvider = fixtureProvider;
        this.teamRepository = teamRepository;
        this.fixtureRepository = fixtureRepository;
        this.gameweekRepository = gameweekRepository;
        this.competitionRepository = competitionRepository;
    }

    @Transactional
    public void syncTeams() {
        List<ProviderTeam> providerTeams = fixtureProvider.fetchTeams();

        // Pre-load all existing teams in one query
        Map<String, Team> teamByExternalId = teamRepository.findAll().stream()
                .filter(t -> t.getExternalTeamId() != null)
                .collect(Collectors.toMap(Team::getExternalTeamId, t -> t, (a, b) -> a));

        List<Team> toSave = new ArrayList<>();
        for (ProviderTeam pt : providerTeams) {
            Team team = teamByExternalId.getOrDefault(pt.externalId(),
                    new Team(pt.name(), pt.shortName(), pt.externalId(), pt.logoUrl()));
            team.setName(pt.name());
            team.setShortName(pt.shortName());
            if (pt.logoUrl() != null) team.setLogoUrl(pt.logoUrl());
            toSave.add(team);
        }
        teamRepository.saveAll(toSave);
        log.info("Synced {} teams", providerTeams.size());
    }

    @Transactional
    public void syncFixturesAndResults() {
        LocalDate from = LocalDate.now().minusDays(30);
        LocalDate to = LocalDate.now().plusDays(60);
        List<ProviderFixture> fixtures = fixtureProvider.fetchFixtures(from, to);
        List<ProviderFixture> results = fixtureProvider.fetchResults(from, to);
        upsertFixtures(mergeProviderFixtures(fixtures, results));
        log.info("Synced {} fixtures and {} results", fixtures.size(), results.size());
    }

    @Transactional
    public void fullSync() {
        syncTeams();
        syncFixturesAndResults();
    }

    /**
     * Immediately populate fixtures for a single newly-created competition.
     */
    @Transactional
    public int syncForCompetition(Competition competition) {
        LocalDate compStart = competition.getStartDate() != null
                ? competition.getStartDate() : LocalDate.now();
        LocalDate from = compStart.minusDays(7);
        LocalDate to   = compStart.plusDays(120);

        log.info("syncForCompetition: competition='{}' fetchRange={} → {} compStart={}",
                competition.getName(), from, to, compStart);

        fixtureProvider.evictAll();
        syncTeams();

        List<ProviderFixture> fixtures = fixtureProvider.fetchFixtures(from, to);
        List<ProviderFixture> results  = fixtureProvider.fetchResults(from, to);
        log.info("syncForCompetition: provider returned {} fixtures, {} results", fixtures.size(), results.size());

        Map<String, ProviderFixture> merged = mergeProviderFixtures(fixtures, results);
        return upsertFixturesForCompetition(competition, new ArrayList<>(merged.values()));
    }

    // ── helpers ─────────────────────────────────────────────────────────────────

    private Map<String, ProviderFixture> mergeProviderFixtures(
            List<ProviderFixture> fixtures, List<ProviderFixture> results) {
        Map<String, ProviderFixture> merged = new LinkedHashMap<>();
        fixtures.forEach(f -> merged.put(f.externalFixtureId(), f));
        results.forEach(r -> merged.put(r.externalFixtureId(), r));
        return merged;
    }

    /**
     * Upsert fixtures for all active/upcoming competitions.
     * Pre-loads teams, gameweeks, and fixtures into maps to avoid N+1 queries.
     */
    private void upsertFixtures(Map<String, ProviderFixture> merged) {
        List<Competition> competitions = competitionRepository.findByStatusInOrderByStartDateAsc(
                List.of(CompetitionStatus.UPCOMING, CompetitionStatus.ACTIVE));
        if (competitions.isEmpty()) return;

        List<ProviderFixture> allFixtures = new ArrayList<>(merged.values());

        // Pre-load ALL teams into a map once — avoids N+1
        Map<String, Team> teamByExternalId = teamRepository.findAll().stream()
                .filter(t -> t.getExternalTeamId() != null)
                .collect(Collectors.toMap(Team::getExternalTeamId, t -> t, (a, b) -> a));

        LocalDateTime now = LocalDateTime.now(java.time.ZoneOffset.UTC);
        Set<Integer> startedWeeks = allFixtures.stream()
                .filter(pf -> pf.kickoffAt().isBefore(now))
                .map(ProviderFixture::weekNumber)
                .collect(Collectors.toSet());

        for (Competition comp : competitions) {
            upsertFixturesForCompetition(comp, allFixtures, teamByExternalId, startedWeeks);
        }
    }

    /**
     * Upsert fixtures for a single competition — fetches its own teams map.
     * Used from syncForCompetition where we want isolated logic.
     */
    private int upsertFixturesForCompetition(Competition competition, List<ProviderFixture> allFixtures) {
        // Pre-load all teams once
        Map<String, Team> teamByExternalId = teamRepository.findAll().stream()
                .filter(t -> t.getExternalTeamId() != null)
                .collect(Collectors.toMap(Team::getExternalTeamId, t -> t, (a, b) -> a));

        LocalDateTime now = LocalDateTime.now(java.time.ZoneOffset.UTC);
        log.info("syncForCompetition: current UTC time = {}", now);

        Set<Integer> startedWeeks = allFixtures.stream()
                .filter(pf -> pf.kickoffAt().isBefore(now))
                .map(ProviderFixture::weekNumber)
                .collect(Collectors.toSet());

        // Log per-week earliest kickoff
        allFixtures.stream()
                .collect(Collectors.groupingBy(ProviderFixture::weekNumber,
                        Collectors.minBy(Comparator.comparing(ProviderFixture::kickoffAt))))
                .forEach((week, earliest) -> earliest.ifPresent(pf ->
                        log.info("syncForCompetition: PL week {} earliest kickoff={} started={}",
                                week, pf.kickoffAt(), startedWeeks.contains(week))));

        return upsertFixturesForCompetition(competition, allFixtures, teamByExternalId, startedWeeks);
    }

    /**
     * Core upsert logic — uses pre-loaded maps to avoid any N+1 queries inside loops.
     */
    private int upsertFixturesForCompetition(Competition comp, List<ProviderFixture> allFixtures,
                                              Map<String, Team> teamByExternalId,
                                              Set<Integer> globalStartedWeeks) {
        // Weeks started globally
        Set<Integer> startedWeeks = new HashSet<>(globalStartedWeeks);

        // Skip weeks starting before comp start date
        Map<Integer, LocalDateTime> weekEarliestKickoff = new HashMap<>();
        allFixtures.forEach(pf -> weekEarliestKickoff.merge(pf.weekNumber(), pf.kickoffAt(),
                (a, b) -> a.isBefore(b) ? a : b));

        Set<Integer> weeksTooEarly = weekEarliestKickoff.entrySet().stream()
                .filter(e -> comp.getStartDate() != null
                        && e.getValue().toLocalDate().isBefore(comp.getStartDate()))
                .map(Map.Entry::getKey)
                .collect(Collectors.toSet());

        Set<Integer> allSkipped = new HashSet<>();
        allSkipped.addAll(startedWeeks);
        allSkipped.addAll(weeksTooEarly);

        // Filter eligible fixtures
        List<ProviderFixture> eligible = allFixtures.stream()
                .filter(pf -> comp.getStartDate() == null
                        || !pf.kickoffAt().toLocalDate().isBefore(comp.getStartDate()))
                .filter(pf -> !allSkipped.contains(pf.weekNumber()))
                .sorted(Comparator.comparingInt(ProviderFixture::weekNumber)
                        .thenComparing(ProviderFixture::kickoffAt))
                .toList();

        if (eligible.isEmpty()) return 0;

        // Determine valid weeks (≥3 playable fixtures)
        final int MIN_PLAYABLE = 3;
        Set<Integer> validWeeks = allFixtures.stream()
                .collect(Collectors.groupingBy(ProviderFixture::weekNumber,
                        Collectors.filtering(pf -> !"POSTPONED".equals(pf.status()) && !"CANCELLED".equals(pf.status()),
                                Collectors.counting())))
                .entrySet().stream()
                .filter(e -> e.getValue() >= MIN_PLAYABLE)
                .map(Map.Entry::getKey)
                .collect(Collectors.toSet());

        if (validWeeks.isEmpty()) return 0;

        log.info("syncForCompetition: {} valid weeks for '{}': {}",
                validWeeks.size(), comp.getName(), validWeeks.stream().sorted().toList());

        // ── Pre-load ALL gameweeks for this competition ──────────────────────────
        List<Gameweek> existingGameweeks = gameweekRepository.findByCompetitionIdOrderByWeekNumberAsc(comp.getId());
        Map<Integer, Gameweek> gwByCompWeekNum = existingGameweeks.stream()
                .collect(Collectors.toMap(Gameweek::getWeekNumber, gw -> gw));

        // ── Pre-load ALL fixtures for this competition in ONE query ───────────────
        List<Long> gwIds = existingGameweeks.stream().map(Gameweek::getId).toList();
        Map<String, Fixture> existingFixtureByExtId = gwIds.isEmpty()
                ? new HashMap<>()
                : fixtureRepository.findByGameweekIdIn(gwIds).stream()
                        .collect(Collectors.toMap(Fixture::getExternalFixtureId, f -> f, (a, b) -> a));

        // Build providerWeek → compGwNumber mapping anchored to existing gameweeks
        Map<Integer, Integer> providerWeekToCompGw = new LinkedHashMap<>();
        for (Gameweek existingGw : existingGameweeks) {
            for (ProviderFixture pf : eligible) {
                if (existingFixtureByExtId.containsKey(pf.externalFixtureId())) {
                    Fixture ef = existingFixtureByExtId.get(pf.externalFixtureId());
                    if (ef.getGameweek().getId().equals(existingGw.getId())) {
                        providerWeekToCompGw.put(pf.weekNumber(), existingGw.getWeekNumber());
                        break;
                    }
                }
            }
        }

        int nextGwNum = existingGameweeks.stream().mapToInt(Gameweek::getWeekNumber).max().orElse(0) + 1;
        for (ProviderFixture pf : eligible) {
            if (validWeeks.contains(pf.weekNumber()) && !providerWeekToCompGw.containsKey(pf.weekNumber())) {
                providerWeekToCompGw.put(pf.weekNumber(), nextGwNum++);
            }
        }

        // ── Process fixtures — no DB queries inside this loop ────────────────────
        List<Fixture> fixturesToSave = new ArrayList<>();
        List<Gameweek> gameweeksToSave = new ArrayList<>();

        for (ProviderFixture pf : eligible) {
            if (!providerWeekToCompGw.containsKey(pf.weekNumber())) continue;

            Team homeTeam = teamByExternalId.get(pf.homeTeamExternalId());
            Team awayTeam = teamByExternalId.get(pf.awayTeamExternalId());
            if (homeTeam == null || awayTeam == null) continue;

            FixtureStatus status;
            try { status = FixtureStatus.valueOf(pf.status()); }
            catch (IllegalArgumentException e) { status = FixtureStatus.SCHEDULED; }

            int compWeekNumber = providerWeekToCompGw.get(pf.weekNumber());

            // Get or create gameweek — use in-memory map, no DB query
            Gameweek gw = gwByCompWeekNum.get(compWeekNumber);
            if (gw == null) {
                LocalDateTime earliest = weekEarliestKickoff.get(pf.weekNumber());
                LocalDateTime lockAt   = earliest.minusHours(1);
                LocalDateTime weekStart = earliest.toLocalDate().atStartOfDay();
                gw = new Gameweek(comp, compWeekNumber, lockAt, weekStart,
                        weekStart.plusDays(3), GameweekStatus.UPCOMING);
                // Save immediately so FK is available for fixtures
                gw = gameweekRepository.save(gw);
                gwByCompWeekNum.put(compWeekNumber, gw);
            }

            Fixture existing = existingFixtureByExtId.get(pf.externalFixtureId());
            if (existing != null) {
                existing.setImportedHomeTeam(homeTeam);
                existing.setImportedAwayTeam(awayTeam);
                existing.setImportedKickoffAt(pf.kickoffAt());
                existing.setImportedStatus(status);
                existing.setImportedScoreHome(pf.scoreHome());
                existing.setImportedScoreAway(pf.scoreAway());
                existing.setLastSyncedAt(LocalDateTime.now());
                fixturesToSave.add(existing);
            } else {
                Fixture f = new Fixture(gw, pf.externalFixtureId(), homeTeam, awayTeam, pf.kickoffAt(), status);
                f.setImportedScoreHome(pf.scoreHome());
                f.setImportedScoreAway(pf.scoreAway());
                f.setLastSyncedAt(LocalDateTime.now());
                fixturesToSave.add(f);
                existingFixtureByExtId.put(pf.externalFixtureId(), f); // prevent duplicate insert
            }
        }

        // Batch save all fixtures at once
        fixtureRepository.saveAll(fixturesToSave);
        long newCount = fixturesToSave.stream().filter(f -> f.getId() == null).count();
        log.info("Synced {} fixtures for competition '{}' ({} new)", fixturesToSave.size(), comp.getName(), newCount);
        return fixturesToSave.size();
    }
}
