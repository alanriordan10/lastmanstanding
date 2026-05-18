package com.lastmanstanding.service;

import com.lastmanstanding.entity.*;
import com.lastmanstanding.provider.FixtureProvider;
import com.lastmanstanding.provider.FixtureProvider.ProviderFixture;
import com.lastmanstanding.provider.FixtureProvider.ProviderTeam;
import com.lastmanstanding.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service that syncs teams, fixtures, and results from a FixtureProvider into the DB.
 * Only updates imported fields; admin overrides are never touched.
 */
@Service
public class FixtureSyncService {

    private static final Logger log = LoggerFactory.getLogger(FixtureSyncService.class);
    // Keep scheduled incremental sync tight to avoid long-running transactions.
    // Broad historical refresh remains covered by daily full sync.
    private final int incrementalFromDays;
    private final int incrementalToDays;
    private final int worldCupMaxFixturesPerGameweek;
    private final int worldCupMinFixturesPerGameweek;
    private final ZoneId fixtureSplitZone;

    private final FixtureProvider fixtureProvider;
    private final TeamRepository teamRepository;
    private final FixtureRepository fixtureRepository;
    private final GameweekRepository gameweekRepository;
    private final CompetitionRepository competitionRepository;
    private final FixtureMutationLockService fixtureMutationLockService;
    private final TransactionTemplate transactionTemplate;

    public FixtureSyncService(FixtureProvider fixtureProvider,
                              TeamRepository teamRepository,
                              FixtureRepository fixtureRepository,
                              GameweekRepository gameweekRepository,
                              CompetitionRepository competitionRepository,
                              FixtureMutationLockService fixtureMutationLockService,
                              TransactionTemplate transactionTemplate,
                              @Value("${fixture.sync.from-days:2}") int incrementalFromDays,
                              @Value("${fixture.sync.to-days:10}") int incrementalToDays,
                              @Value("${fixture.sync.world-cup-max-fixtures-per-gameweek:10}") int worldCupMaxFixturesPerGameweek,
                              @Value("${fixture.sync.world-cup-min-fixtures-per-gameweek:6}") int worldCupMinFixturesPerGameweek,
                              @Value("${fixture.sync.split-zone:Europe/Dublin}") String fixtureSplitZone) {
        this.fixtureProvider = fixtureProvider;
        this.teamRepository = teamRepository;
        this.fixtureRepository = fixtureRepository;
        this.gameweekRepository = gameweekRepository;
        this.competitionRepository = competitionRepository;
        this.fixtureMutationLockService = fixtureMutationLockService;
        this.transactionTemplate = transactionTemplate;
        this.incrementalFromDays = Math.max(0, incrementalFromDays);
        this.incrementalToDays = Math.max(1, incrementalToDays);
        this.worldCupMaxFixturesPerGameweek = Math.max(1, worldCupMaxFixturesPerGameweek);
        this.worldCupMinFixturesPerGameweek = Math.max(1, worldCupMinFixturesPerGameweek);
        this.fixtureSplitZone = ZoneId.of(fixtureSplitZone);
    }

    public void syncTeams() {
        List<ProviderTeam> providerTeams = fixtureProvider.fetchTeams();
        transactionTemplate.executeWithoutResult(status -> syncTeamsInternal(providerTeams));
    }

    private void syncTeamsInternal(List<ProviderTeam> providerTeams) {
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

    public void syncFixturesAndResults() {
        LocalDate from = LocalDate.now().minusDays(incrementalFromDays);
        LocalDate to = LocalDate.now().plusDays(incrementalToDays);
        transactionTemplate.executeWithoutResult(status ->
                fixtureMutationLockService.runWithLock(() -> syncFixturesAndResultsInternal(from, to)));
    }

    public boolean trySyncFixturesAndResults() {
        LocalDate from = LocalDate.now().minusDays(incrementalFromDays);
        LocalDate to = LocalDate.now().plusDays(incrementalToDays);
        return Boolean.TRUE.equals(transactionTemplate.execute(status ->
                fixtureMutationLockService.tryRunWithLock(() -> syncFixturesAndResultsInternal(from, to))));
    }

    public void fullSync() {
        LocalDate from = LocalDate.now().minusDays(30);
        LocalDate to = LocalDate.now().plusDays(60);
        transactionTemplate.executeWithoutResult(status ->
                fixtureMutationLockService.runWithLock(() -> fullSyncInternal(from, to)));
    }

    public boolean tryFullSync() {
        LocalDate from = LocalDate.now().minusDays(30);
        LocalDate to = LocalDate.now().plusDays(60);
        return Boolean.TRUE.equals(transactionTemplate.execute(status ->
                fixtureMutationLockService.tryRunWithLock(() -> fullSyncInternal(from, to))));
    }

    /**
     * Immediately populate fixtures for a single newly-created competition.
     */
    public int syncForCompetition(Competition competition) {
        LocalDate compStart = competition.getStartDate() != null
                ? competition.getStartDate() : LocalDate.now();
        LocalDate from = compStart.minusDays(7);
        LocalDate to   = compStart.plusDays(120);

        log.debug("syncForCompetition: competition='{}' fetchRange={} → {} compStart={}",
                competition.getName(), from, to, compStart);

        fixtureProvider.evictAll();
        String competitionCode = normalizeCompetitionCode(competition.getFixtureCompetitionCode());
        List<ProviderTeam> teams = fixtureProvider.fetchTeams(competitionCode);
        List<ProviderFixture> fixtures = fixtureProvider.fetchFixtures(from, to, competitionCode);
        List<ProviderFixture> results  = fixtureProvider.fetchResults(from, to, competitionCode);
        log.debug("syncForCompetition: provider returned {} fixtures, {} results", fixtures.size(), results.size());

        return transactionTemplate.execute(status ->
                fixtureMutationLockService.callWithLock(() -> syncForCompetitionInternal(competition, teams, fixtures, results)));
    }

    private void syncFixturesAndResultsInternal(LocalDate from, LocalDate to) {
        List<Competition> competitions = competitionRepository.findByStatusInOrderByStartDateAsc(
                List.of(CompetitionStatus.UPCOMING, CompetitionStatus.ACTIVE));
        if (competitions.isEmpty()) return;
        syncByCompetitionCode(competitions, from, to);
    }

    private void fullSyncInternal(LocalDate from, LocalDate to) {
        List<Competition> competitions = competitionRepository.findByStatusInOrderByStartDateAsc(
                List.of(CompetitionStatus.UPCOMING, CompetitionStatus.ACTIVE));
        if (competitions.isEmpty()) return;
        syncByCompetitionCode(competitions, from, to);
    }

    private int syncForCompetitionInternal(Competition competition,
                                           List<ProviderTeam> teams,
                                           List<ProviderFixture> fixtures,
                                           List<ProviderFixture> results) {
        syncTeamsInternal(teams);
        Map<String, ProviderFixture> merged = mergeProviderFixtures(fixtures, results);
        return upsertFixturesForCompetition(competition, new ArrayList<>(merged.values()));
    }

    private void syncByCompetitionCode(List<Competition> competitions, LocalDate from, LocalDate to) {
        Map<String, List<Competition>> competitionsByCode = competitions.stream()
                .collect(Collectors.groupingBy(c -> normalizeCompetitionCode(c.getFixtureCompetitionCode())));

        int totalFixtures = 0;
        int totalResults = 0;
        for (Map.Entry<String, List<Competition>> entry : competitionsByCode.entrySet()) {
            String competitionCode = entry.getKey();
            List<Competition> compsForCode = entry.getValue();
            List<ProviderTeam> teams = fixtureProvider.fetchTeams(competitionCode);
            syncTeamsInternal(teams);
            List<ProviderFixture> fixtures = fixtureProvider.fetchFixtures(from, to, competitionCode);
            List<ProviderFixture> results = fixtureProvider.fetchResults(from, to, competitionCode);
            Map<String, ProviderFixture> merged = mergeProviderFixtures(fixtures, results);
            List<ProviderFixture> mergedFixtures = new ArrayList<>(merged.values());
            for (Competition competition : compsForCode) {
                upsertFixturesForCompetition(competition, mergedFixtures);
            }
            totalFixtures += fixtures.size();
            totalResults += results.size();
        }
        log.info("Synced {} fixtures and {} results across {} competition source(s)",
                totalFixtures, totalResults, competitionsByCode.size());
    }

    private String normalizeCompetitionCode(String competitionCode) {
        if (competitionCode == null || competitionCode.isBlank()) return "PL";
        return competitionCode.trim().toUpperCase(Locale.ROOT);
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
        log.debug("syncForCompetition: current UTC time = {}", now);

        Set<Integer> startedWeeks = allFixtures.stream()
                .filter(pf -> pf.kickoffAt().isBefore(now))
                .map(ProviderFixture::weekNumber)
                .collect(Collectors.toSet());

        // Log per-week earliest kickoff
        if (log.isDebugEnabled()) {
            allFixtures.stream()
                    .collect(Collectors.groupingBy(ProviderFixture::weekNumber,
                            Collectors.minBy(Comparator.comparing(ProviderFixture::kickoffAt))))
                    .forEach((week, earliest) -> earliest.ifPresent(pf ->
                            log.debug("syncForCompetition: PL week {} earliest kickoff={} started={}",
                                    week, pf.kickoffAt(), startedWeeks.contains(week))));
        }

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

        // Filter eligible fixtures.
        // Started weeks must still be updated if the fixture already belongs to this competition,
        // otherwise live status and scores will never propagate after kickoff.
        List<ProviderFixture> eligible = allFixtures.stream()
                .filter(pf -> comp.getStartDate() == null
                        || !pf.kickoffAt().toLocalDate().isBefore(comp.getStartDate()))
                .filter(pf -> !weeksTooEarly.contains(pf.weekNumber()))
                .filter(pf -> !startedWeeks.contains(pf.weekNumber()) || existingFixtureByExtId.containsKey(pf.externalFixtureId()))
                .sorted(Comparator.comparingInt(ProviderFixture::weekNumber)
                        .thenComparing(ProviderFixture::kickoffAt))
                .toList();

        if (eligible.isEmpty()) return 0;

        // Preload any existing fixtures (across competitions) for the same external IDs,
        // so new fixtures can inherit already-synced odds immediately.
        List<String> eligibleExternalIds = eligible.stream()
                .map(ProviderFixture::externalFixtureId)
                .distinct()
                .toList();
        Map<String, Fixture> oddsSourceByExtId = fixtureRepository.findByExternalFixtureIdIn(eligibleExternalIds).stream()
                .filter(f -> f.getOddsImpliedHome() != null || f.getOddsHomeWin() != null)
                .collect(Collectors.toMap(Fixture::getExternalFixtureId, f -> f, (a, b) -> {
                    LocalDateTime aUpdated = a.getOddsUpdatedAt();
                    LocalDateTime bUpdated = b.getOddsUpdatedAt();
                    if (aUpdated == null) return b;
                    if (bUpdated == null) return a;
                    return bUpdated.isAfter(aUpdated) ? b : a;
                }));

        // Determine valid provider weeks (≥3 playable fixtures).
        // This is useful for league formats, but World Cup chunking is day-based
        // and should include all eligible fixtures.
        final int MIN_PLAYABLE = 3;
        Set<Integer> validWeeks = allFixtures.stream()
                .collect(Collectors.groupingBy(ProviderFixture::weekNumber,
                        Collectors.filtering(pf -> !"POSTPONED".equals(pf.status()) && !"CANCELLED".equals(pf.status()),
                                Collectors.counting())))
                .entrySet().stream()
                .filter(e -> e.getValue() >= MIN_PLAYABLE)
                .map(Map.Entry::getKey)
                .collect(Collectors.toSet());

        if (validWeeks.isEmpty() && !"WC".equalsIgnoreCase(comp.getFixtureCompetitionCode())) return 0;

        log.debug("syncForCompetition: {} valid weeks for '{}': {}",
                validWeeks.size(), comp.getName(), validWeeks.stream().sorted().toList());

        // Build provider fixture → compGwNumber mapping anchored to existing fixtures.
        // For World Cup sources we allow splitting large provider weeks into chunks of 10 fixtures.
        boolean splitLargeWeeks = "WC".equalsIgnoreCase(comp.getFixtureCompetitionCode());
        final int maxFixturesPerGameweek = splitLargeWeeks ? worldCupMaxFixturesPerGameweek : Integer.MAX_VALUE;

        Map<String, Integer> fixtureToCompGw = new HashMap<>();
        for (ProviderFixture pf : eligible) {
            Fixture existing = existingFixtureByExtId.get(pf.externalFixtureId());
            if (existing != null) {
                fixtureToCompGw.put(pf.externalFixtureId(), existing.getGameweek().getWeekNumber());
            }
        }

        int nextGwNum = existingGameweeks.stream().mapToInt(Gameweek::getWeekNumber).max().orElse(0) + 1;
        if (splitLargeWeeks) {
            final int minFixturesPerGameweek = Math.min(worldCupMinFixturesPerGameweek, maxFixturesPerGameweek);

            // Group by UTC date across the full competition window so dates never overlap across gameweeks.
            Map<LocalDate, List<ProviderFixture>> byDay = eligible.stream()
                    .sorted(Comparator.comparing(ProviderFixture::kickoffAt).thenComparing(ProviderFixture::externalFixtureId))
                    .collect(Collectors.groupingBy(
                            pf -> pf.kickoffAt().atZone(java.time.ZoneOffset.UTC).withZoneSameInstant(fixtureSplitZone).toLocalDate(),
                            LinkedHashMap::new,
                            Collectors.toList()
                    ));

            class DayGroup {
                final LocalDate day;
                final List<ProviderFixture> fixtures;
                DayGroup(LocalDate day, List<ProviderFixture> fixtures) {
                    this.day = day;
                    this.fixtures = fixtures;
                }
            }
            class DayChunk {
                final List<DayGroup> groups = new ArrayList<>();
                int size() {
                    return groups.stream().mapToInt(g -> g.fixtures.size()).sum();
                }
                List<ProviderFixture> flatten() {
                    return groups.stream().flatMap(g -> g.fixtures.stream()).toList();
                }
            }

            List<DayChunk> chunks = new ArrayList<>();
            DayChunk currentChunk = new DayChunk();

            for (Map.Entry<LocalDate, List<ProviderFixture>> dayEntry : byDay.entrySet()) {
                List<ProviderFixture> dayFixtures = dayEntry.getValue();
                int currentSize = currentChunk.size();
                int daySize = dayFixtures.size();
                int nextSize = currentSize + daySize;

                if (!currentChunk.groups.isEmpty() && nextSize > maxFixturesPerGameweek) {
                    // If current chunk is too small, absorb this day to avoid tiny gameweeks (unless it's the first chunk).
                    if (currentSize < minFixturesPerGameweek && !chunks.isEmpty()) {
                        currentChunk.groups.add(new DayGroup(dayEntry.getKey(), dayFixtures));
                    } else {
                        chunks.add(currentChunk);
                        currentChunk = new DayChunk();
                        currentChunk.groups.add(new DayGroup(dayEntry.getKey(), dayFixtures));
                    }
                } else {
                    currentChunk.groups.add(new DayGroup(dayEntry.getKey(), dayFixtures));
                }
            }
            if (!currentChunk.groups.isEmpty()) {
                chunks.add(currentChunk);
            }

            // Rebalance from the end: move whole days from previous chunk when possible.
            for (int i = chunks.size() - 1; i > 0; i--) {
                DayChunk cur = chunks.get(i);
                DayChunk prev = chunks.get(i - 1);
                while (cur.size() < minFixturesPerGameweek && !prev.groups.isEmpty()) {
                    DayGroup candidate = prev.groups.get(prev.groups.size() - 1);
                    int candidateSize = candidate.fixtures.size();
                    if (prev.size() - candidateSize < minFixturesPerGameweek) {
                        break;
                    }
                    prev.groups.remove(prev.groups.size() - 1);
                    cur.groups.add(0, candidate);
                }
            }

            // Ensure no chunk remains below minimum by merging with a neighbor (whole days only).
            for (int i = 0; i < chunks.size(); i++) {
                DayChunk chunk = chunks.get(i);
                if (chunk.size() >= minFixturesPerGameweek || chunks.size() <= 1) {
                    continue;
                }
                if (i + 1 < chunks.size()) {
                    // Prefer merging into next to keep forward chronology stable.
                    DayChunk next = chunks.get(i + 1);
                    next.groups.addAll(0, chunk.groups);
                    chunks.remove(i);
                    i = Math.max(-1, i - 2); // reset to re-evaluate from prior position
                } else {
                    // Last chunk: merge into previous.
                    DayChunk prev = chunks.get(i - 1);
                    prev.groups.addAll(chunk.groups);
                    chunks.remove(i);
                    i = Math.max(-1, i - 2);
                }
            }

            for (DayChunk chunk : chunks) {
                List<ProviderFixture> flat = chunk.flatten();
                Integer chunkGwNum = flat.stream()
                        .map(pf -> fixtureToCompGw.get(pf.externalFixtureId()))
                        .filter(Objects::nonNull)
                        .findFirst()
                        .orElse(null);
                if (chunkGwNum == null) {
                    chunkGwNum = nextGwNum++;
                }
                Integer finalChunkGwNum = chunkGwNum;
                flat.forEach(pf -> fixtureToCompGw.put(pf.externalFixtureId(), finalChunkGwNum));
            }

            // Hard guarantee: no WC chunk should remain below minimum if we can merge by day.
            Map<Integer, List<ProviderFixture>> fixturesByGw = new HashMap<>();
            for (ProviderFixture pf : eligible) {
                Integer gwNum = fixtureToCompGw.get(pf.externalFixtureId());
                if (gwNum == null) continue;
                fixturesByGw.computeIfAbsent(gwNum, __ -> new ArrayList<>()).add(pf);
            }
            List<Integer> orderedGw = fixturesByGw.entrySet().stream()
                    .sorted(Comparator.comparing(e -> e.getValue().stream()
                            .map(ProviderFixture::kickoffAt)
                            .min(LocalDateTime::compareTo)
                            .orElse(LocalDateTime.MAX)))
                    .map(Map.Entry::getKey)
                    .toList();

            for (int i = 0; i < orderedGw.size(); i++) {
                Integer gwNum = orderedGw.get(i);
                List<ProviderFixture> gwFixtures = fixturesByGw.getOrDefault(gwNum, List.of());
                if (gwFixtures.size() >= minFixturesPerGameweek) continue;

                Integer targetGw = null;
                if (i > 0) {
                    targetGw = orderedGw.get(i - 1);
                } else if (i + 1 < orderedGw.size()) {
                    targetGw = orderedGw.get(i + 1);
                }
                if (targetGw == null) continue;

                for (ProviderFixture pf : gwFixtures) {
                    fixtureToCompGw.put(pf.externalFixtureId(), targetGw);
                }
            }
        } else {
            Map<Integer, Integer> providerWeekToCompGw = new LinkedHashMap<>();
            for (ProviderFixture pf : eligible) {
                Integer existingGwNum = fixtureToCompGw.get(pf.externalFixtureId());
                if (existingGwNum != null) {
                    providerWeekToCompGw.putIfAbsent(pf.weekNumber(), existingGwNum);
                }
            }
            for (ProviderFixture pf : eligible) {
                if (!validWeeks.contains(pf.weekNumber())) continue;
                if (!providerWeekToCompGw.containsKey(pf.weekNumber())) {
                    providerWeekToCompGw.put(pf.weekNumber(), nextGwNum++);
                }
                fixtureToCompGw.putIfAbsent(pf.externalFixtureId(), providerWeekToCompGw.get(pf.weekNumber()));
            }
        }

        Map<Integer, LocalDateTime> earliestKickoffByCompGw = new HashMap<>();
        for (ProviderFixture pf : eligible) {
            Integer gwNumber = fixtureToCompGw.get(pf.externalFixtureId());
            if (gwNumber == null) continue;
            earliestKickoffByCompGw.merge(gwNumber, pf.kickoffAt(), (a, b) -> a.isBefore(b) ? a : b);
        }

        // ── Process fixtures — no DB queries inside this loop ────────────────────
        List<Fixture> fixturesToSave = new ArrayList<>();
        List<Gameweek> gameweeksToSave = new ArrayList<>();

        for (ProviderFixture pf : eligible) {
            Integer compWeekNumber = fixtureToCompGw.get(pf.externalFixtureId());
            if (compWeekNumber == null) continue;

            Team homeTeam = teamByExternalId.get(pf.homeTeamExternalId());
            Team awayTeam = teamByExternalId.get(pf.awayTeamExternalId());
            if (homeTeam == null || awayTeam == null) continue;

            FixtureStatus status;
            try { status = FixtureStatus.valueOf(pf.status()); }
            catch (IllegalArgumentException e) { status = FixtureStatus.SCHEDULED; }

            // Get or create gameweek — use in-memory map, no DB query
            Gameweek gw = gwByCompWeekNum.get(compWeekNumber);
            if (gw == null) {
                LocalDateTime earliest = earliestKickoffByCompGw.getOrDefault(compWeekNumber, weekEarliestKickoff.get(pf.weekNumber()));
                LocalDateTime lockAt   = earliest;
                LocalDateTime weekStart = earliest.toLocalDate().atStartOfDay();
                gw = new Gameweek(comp, compWeekNumber, lockAt, weekStart,
                        weekStart.plusDays(3), GameweekStatus.UPCOMING);
                // Save immediately so FK is available for fixtures
                gw = gameweekRepository.save(gw);
                gwByCompWeekNum.put(compWeekNumber, gw);
            } else if (gw.getStatus() == GameweekStatus.UPCOMING) {
                LocalDateTime earliest = earliestKickoffByCompGw.getOrDefault(compWeekNumber, weekEarliestKickoff.get(pf.weekNumber()));
                if (earliest != null && !earliest.equals(gw.getLockAt())) {
                    gw.setLockAt(earliest);
                    gw = gameweekRepository.save(gw);
                    gwByCompWeekNum.put(compWeekNumber, gw);
                }
            }

            Fixture existing = existingFixtureByExtId.get(pf.externalFixtureId());
            if (existing != null) {
                if (existing.getGameweek() == null || !existing.getGameweek().getId().equals(gw.getId())) {
                    existing.setGameweek(gw);
                }
                existing.setImportedHomeTeam(homeTeam);
                existing.setImportedAwayTeam(awayTeam);
                existing.setImportedKickoffAt(pf.kickoffAt());
                existing.setImportedStatus(status);
                existing.setImportedScoreHome(pf.scoreHome());
                existing.setImportedScoreAway(pf.scoreAway());
                if (existing.getOddsImpliedHome() == null && existing.getOddsHomeWin() == null) {
                    Fixture oddsTemplate = oddsSourceByExtId.get(pf.externalFixtureId());
                    if (oddsTemplate != null) {
                        existing.setOddsHomeWin(oddsTemplate.getOddsHomeWin());
                        existing.setOddsDraw(oddsTemplate.getOddsDraw());
                        existing.setOddsAwayWin(oddsTemplate.getOddsAwayWin());
                        existing.setOddsImpliedHome(oddsTemplate.getOddsImpliedHome());
                        existing.setOddsImpliedDraw(oddsTemplate.getOddsImpliedDraw());
                        existing.setOddsImpliedAway(oddsTemplate.getOddsImpliedAway());
                        existing.setOddsSource(oddsTemplate.getOddsSource());
                        existing.setOddsUpdatedAt(oddsTemplate.getOddsUpdatedAt());
                    }
                }
                existing.setLastSyncedAt(LocalDateTime.now());
                fixturesToSave.add(existing);
            } else {
                Fixture f = new Fixture(gw, pf.externalFixtureId(), homeTeam, awayTeam, pf.kickoffAt(), status);
                f.setImportedScoreHome(pf.scoreHome());
                f.setImportedScoreAway(pf.scoreAway());
                Fixture oddsTemplate = oddsSourceByExtId.get(pf.externalFixtureId());
                if (oddsTemplate != null) {
                    f.setOddsHomeWin(oddsTemplate.getOddsHomeWin());
                    f.setOddsDraw(oddsTemplate.getOddsDraw());
                    f.setOddsAwayWin(oddsTemplate.getOddsAwayWin());
                    f.setOddsImpliedHome(oddsTemplate.getOddsImpliedHome());
                    f.setOddsImpliedDraw(oddsTemplate.getOddsImpliedDraw());
                    f.setOddsImpliedAway(oddsTemplate.getOddsImpliedAway());
                    f.setOddsSource(oddsTemplate.getOddsSource());
                    f.setOddsUpdatedAt(oddsTemplate.getOddsUpdatedAt());
                }
                f.setLastSyncedAt(LocalDateTime.now());
                fixturesToSave.add(f);
                existingFixtureByExtId.put(pf.externalFixtureId(), f); // prevent duplicate insert
            }
        }

        // Batch save all fixtures at once
        fixtureRepository.saveAll(fixturesToSave);
        if ("WC".equalsIgnoreCase(comp.getFixtureCompetitionCode()) && comp.getStatus() == CompetitionStatus.UPCOMING) {
            rebalancePersistedWorldCupGameweeks(comp);
        }
        long newCount = fixturesToSave.stream().filter(f -> f.getId() == null).count();
        if (newCount > 0) {
            log.info("Synced {} fixtures for competition '{}' ({} new)", fixturesToSave.size(), comp.getName(), newCount);
        } else {
            log.debug("Synced {} fixtures for competition '{}' ({} new)", fixturesToSave.size(), comp.getName(), newCount);
        }
        return fixturesToSave.size();
    }

    private void rebalancePersistedWorldCupGameweeks(Competition comp) {
        List<Gameweek> gameweeks = gameweekRepository.findByCompetitionIdOrderByWeekNumberAsc(comp.getId());
        if (gameweeks.isEmpty()) return;
        List<Long> gwIds = gameweeks.stream().map(Gameweek::getId).toList();
        List<Fixture> fixtures = fixtureRepository.findByGameweekIdIn(gwIds);
        if (fixtures.isEmpty()) return;

        int maxPerGw = Math.max(1, worldCupMaxFixturesPerGameweek);
        int minPerGw = Math.min(worldCupMinFixturesPerGameweek, maxPerGw);

        Map<LocalDate, List<Fixture>> byDay = fixtures.stream()
                .sorted(Comparator.comparing((Fixture f) -> f.getEffectiveKickoffAt()).thenComparing(Fixture::getExternalFixtureId))
                .collect(Collectors.groupingBy(
                        f -> f.getEffectiveKickoffAt().atZone(java.time.ZoneOffset.UTC).withZoneSameInstant(fixtureSplitZone).toLocalDate(),
                        LinkedHashMap::new,
                        Collectors.toList()
                ));

        class DayChunk {
            final List<List<Fixture>> days = new ArrayList<>();
            int size() { return days.stream().mapToInt(List::size).sum(); }
            List<Fixture> flatten() { return days.stream().flatMap(List::stream).toList(); }
        }

        List<DayChunk> chunks = new ArrayList<>();
        DayChunk current = new DayChunk();
        for (List<Fixture> dayFixtures : byDay.values()) {
            if (!current.days.isEmpty() && current.size() + dayFixtures.size() > maxPerGw) {
                if (current.size() < minPerGw && !chunks.isEmpty()) {
                    current.days.add(dayFixtures);
                } else {
                    chunks.add(current);
                    current = new DayChunk();
                    current.days.add(dayFixtures);
                }
            } else {
                current.days.add(dayFixtures);
            }
        }
        if (!current.days.isEmpty()) chunks.add(current);

        for (int i = chunks.size() - 1; i > 0; i--) {
            DayChunk cur = chunks.get(i);
            DayChunk prev = chunks.get(i - 1);
            while (cur.size() < minPerGw && !prev.days.isEmpty()) {
                List<Fixture> candidate = prev.days.get(prev.days.size() - 1);
                if (prev.size() - candidate.size() < minPerGw) break;
                prev.days.remove(prev.days.size() - 1);
                cur.days.add(0, candidate);
            }
        }
        for (int i = 0; i < chunks.size(); i++) {
            if (chunks.get(i).size() >= minPerGw || chunks.size() <= 1) continue;
            if (i + 1 < chunks.size()) {
                chunks.get(i + 1).days.addAll(0, chunks.get(i).days);
                chunks.remove(i);
                i = Math.max(-1, i - 2);
            } else {
                chunks.get(i - 1).days.addAll(chunks.get(i).days);
                chunks.remove(i);
                i = Math.max(-1, i - 2);
            }
        }

        // Ensure we have enough gameweeks to map all chunks.
        List<Gameweek> ordered = new ArrayList<>(gameweeks);
        int nextWeekNumber = ordered.stream().mapToInt(Gameweek::getWeekNumber).max().orElse(0) + 1;
        while (ordered.size() < chunks.size()) {
            LocalDateTime fallback = fixtures.stream()
                    .map(Fixture::getEffectiveKickoffAt)
                    .min(LocalDateTime::compareTo)
                    .orElse(LocalDateTime.now(java.time.ZoneOffset.UTC));
            Gameweek gw = new Gameweek(comp, nextWeekNumber++, fallback, fallback.toLocalDate().atStartOfDay(), fallback.toLocalDate().atStartOfDay().plusDays(3), GameweekStatus.UPCOMING);
            ordered.add(gameweekRepository.save(gw));
        }
        ordered.sort(Comparator.comparingInt(Gameweek::getWeekNumber));

        List<Gameweek> gwToSave = new ArrayList<>();
        List<Fixture> fixturesToSave = new ArrayList<>();
        for (int i = 0; i < chunks.size(); i++) {
            Gameweek target = ordered.get(i);
            List<Fixture> chunkFixtures = chunks.get(i).flatten();
            LocalDateTime earliest = chunkFixtures.stream().map(Fixture::getEffectiveKickoffAt).min(LocalDateTime::compareTo).orElse(target.getLockAt());
            if (target.getStatus() == GameweekStatus.UPCOMING && earliest != null && !earliest.equals(target.getLockAt())) {
                target.setLockAt(earliest);
                target.setStartsAt(earliest.toLocalDate().atStartOfDay());
                target.setEndsAt(earliest.toLocalDate().atStartOfDay().plusDays(3));
                gwToSave.add(target);
            }
            for (Fixture fixture : chunkFixtures) {
                if (fixture.getGameweek() == null || !fixture.getGameweek().getId().equals(target.getId())) {
                    fixture.setGameweek(target);
                    fixturesToSave.add(fixture);
                }
            }
        }
        if (!gwToSave.isEmpty()) gameweekRepository.saveAll(gwToSave);
        if (!fixturesToSave.isEmpty()) fixtureRepository.saveAll(fixturesToSave);
    }
}
