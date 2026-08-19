package com.lastmanstanding.service;

import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionParticipant;
import com.lastmanstanding.entity.CompetitionStatus;
import com.lastmanstanding.entity.Fixture;
import com.lastmanstanding.entity.FixtureStatus;
import com.lastmanstanding.entity.Gameweek;
import com.lastmanstanding.entity.GameweekStatus;
import com.lastmanstanding.entity.ManualPaymentPolicy;
import com.lastmanstanding.entity.MissedPickMode;
import com.lastmanstanding.entity.ParticipantStatus;
import com.lastmanstanding.entity.PaymentMode;
import com.lastmanstanding.entity.Pick;
import com.lastmanstanding.entity.PickOutcome;
import com.lastmanstanding.entity.PickResult;
import com.lastmanstanding.entity.PickSource;
import com.lastmanstanding.entity.Team;
import com.lastmanstanding.entity.User;
import com.lastmanstanding.repository.CompetitionParticipantRepository;
import com.lastmanstanding.repository.CompetitionRepository;
import com.lastmanstanding.repository.FixtureRepository;
import com.lastmanstanding.repository.GameweekRepository;
import com.lastmanstanding.repository.PaymentRepository;
import com.lastmanstanding.repository.PickRepository;
import com.lastmanstanding.repository.PickResultRepository;
import com.lastmanstanding.repository.TeamRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

/**
 * Core business logic: processes gameweek results, handles auto-assign, determines elimination.
 */
@Service
public class GameweekProcessingService {

    private static final Logger log = LoggerFactory.getLogger(GameweekProcessingService.class);

    private final GameweekRepository gameweekRepository;
    private final FixtureRepository fixtureRepository;
    private final PickRepository pickRepository;
    private final PickResultRepository pickResultRepository;
    private final CompetitionParticipantRepository participantRepository;
    private final TeamRepository teamRepository;
    private final PaymentRepository paymentRepository;
    private final CompetitionRepository competitionRepository;
    private final CompetitionCacheService competitionCacheService;
    private final ApplicationEventPublisher eventPublisher;

    public GameweekProcessingService(GameweekRepository gameweekRepository,
                                     FixtureRepository fixtureRepository,
                                     PickRepository pickRepository,
                                     PickResultRepository pickResultRepository,
                                     CompetitionParticipantRepository participantRepository,
                                     TeamRepository teamRepository,
                                     PaymentRepository paymentRepository,
                                     CompetitionRepository competitionRepository,
                                     CompetitionCacheService competitionCacheService,
                                     ApplicationEventPublisher eventPublisher) {
        this.gameweekRepository = gameweekRepository;
        this.fixtureRepository = fixtureRepository;
        this.pickRepository = pickRepository;
        this.pickResultRepository = pickResultRepository;
        this.participantRepository = participantRepository;
        this.teamRepository = teamRepository;
        this.paymentRepository = paymentRepository;
        this.competitionRepository = competitionRepository;
        this.competitionCacheService = competitionCacheService;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Lock picks at lock time, handle auto-assign for missed picks.
     */
    @Transactional
    public void lockGameweek(Long gameweekId) {
        // Re-fetch inside transaction so all lazy proxies (Competition etc.) are in session
        Gameweek gw = gameweekRepository.findById(gameweekId).orElseThrow();
        if (gw.getStatus() != GameweekStatus.UPCOMING) return;
        if (gw.getCompetition().isPaused()) return;
        if (LocalDateTime.now().isBefore(gw.getLockAt())) return;
        doLockGameweek(gw);
    }

    /**
     * Force-lock a gameweek immediately, bypassing the lock-time check.
     * Used for simulation/testing purposes only.
     */
    @Transactional
    public void forceLockGameweek(Long gameweekId) {
        Gameweek gw = gameweekRepository.findById(gameweekId).orElseThrow();
        if (gw.getStatus() != GameweekStatus.UPCOMING) return;
        if (gw.getCompetition().isPaused()) return;
        doLockGameweek(gw);
    }

    private void doLockGameweek(Gameweek gw) {
        Competition comp = competitionRepository.findById(gw.getCompetition().getId()).orElseThrow();
        if (comp.getStatus() == CompetitionStatus.UPCOMING) {
            comp.setStatus(CompetitionStatus.ACTIVE);
            competitionRepository.save(comp);
        }
        List<CompetitionParticipant> activeParticipants =
                participantRepository.findByCompetitionIdAndStatus(comp.getId(), ParticipantStatus.ACTIVE);
        List<CompetitionParticipant> unpaidStrictParticipants = List.of();
        if (comp.getPaymentMode() == PaymentMode.MANUAL
                && comp.getManualPaymentPolicy() == ManualPaymentPolicy.STRICT
                && !activeParticipants.isEmpty()) {
            Set<Long> paidUserIds = new HashSet<>(paymentRepository.findPaidUserIdsByCompetitionId(comp.getId()));
            unpaidStrictParticipants = activeParticipants.stream()
                    .filter(cp -> !paidUserIds.contains(cp.getUser().getId()))
                    .toList();
            if (!unpaidStrictParticipants.isEmpty()) {
                log.info("Excluded {} unpaid manual-payment participants from GW{} lock processing in competition {}",
                        unpaidStrictParticipants.size(), gw.getWeekNumber(), comp.getId());
            }
            activeParticipants = activeParticipants.stream()
                    .filter(cp -> paidUserIds.contains(cp.getUser().getId()))
                    .toList();
        }

        if (!unpaidStrictParticipants.isEmpty()) {
            eliminateUnpaidStrictParticipants(unpaidStrictParticipants, gw);
        }

        List<Fixture> fixtures = fixtureRepository.findByGameweekId(gw.getId());
        Set<Long> teamsWithFixture = new HashSet<>();
        for (Fixture f : fixtures) {
            teamsWithFixture.add(f.getEffectiveHomeTeam().getId());
            teamsWithFixture.add(f.getEffectiveAwayTeam().getId());
        }

        // Load ALL picks for this gameweek in ONE query — avoid N+1
        Map<Long, Pick> pickByParticipantId = pickRepository
                .findByCompetitionIdAndGameweekId(comp.getId(), gw.getId())
                .stream().collect(Collectors.toMap(p -> p.getParticipant().getId(), p -> p, (a, b) -> a));

        List<Pick> picksToLock = new ArrayList<>();
        List<CompetitionParticipant> missedPickParticipants = new ArrayList<>();

        for (CompetitionParticipant cp : activeParticipants) {
            Pick existingPick = pickByParticipantId.get(cp.getId());
            if (existingPick != null) {
                existingPick.setLocked(true);
                picksToLock.add(existingPick);
            } else {
                missedPickParticipants.add(cp);
            }
        }

        // Batch save all locked picks at once
        pickRepository.saveAll(picksToLock);

        if (!missedPickParticipants.isEmpty()) {
            handleMissedPicksBatch(comp, gw, missedPickParticipants, teamsWithFixture);
        }

        gw.setStatus(GameweekStatus.LOCKED);
        gameweekRepository.save(gw);
        competitionCacheService.evictCompetition(comp.getId());
        log.info("Locked gameweek {} for competition {}", gw.getWeekNumber(), comp.getId());
    }

    private void handleMissedPicksBatch(Competition comp, Gameweek gw,
                                        List<CompetitionParticipant> missed, Set<Long> teamsWithFixture) {
        List<CompetitionParticipant> toEliminate = new ArrayList<>();

        if (comp.getMissedPickMode() == MissedPickMode.AUTO_ASSIGN) {
            // Load used team IDs for ALL missed-pick users in ONE query — avoid N+1
            List<Long> missedParticipantIds = missed.stream().map(CompetitionParticipant::getId).toList();
            Map<Long, Set<Long>> usedTeamsByParticipant = new HashMap<>();
            for (Long pid : missedParticipantIds) usedTeamsByParticipant.put(pid, new HashSet<>());
            pickRepository.findUsedTeamIdsByParticipantIds(comp.getId(), missedParticipantIds)
                    .forEach(row -> usedTeamsByParticipant
                            .computeIfAbsent((Long) row[0], k -> new HashSet<>())
                            .add((Long) row[1]));

            List<Team> allTeams = teamRepository.findAllByOrderByNameAsc();
            List<Pick> autoPicks = new ArrayList<>();

            for (CompetitionParticipant cp : missed) {
                Set<Long> usedTeamIds = usedTeamsByParticipant.getOrDefault(cp.getId(), Set.of());
                Team autoTeam = null;
                for (Team t : allTeams) {
                    if (!usedTeamIds.contains(t.getId()) && teamsWithFixture.contains(t.getId())) {
                        autoTeam = t;
                        break;
                    }
                }
                if (autoTeam != null) {
                    autoPicks.add(new Pick(comp, cp.getUser(), cp, gw, autoTeam, PickSource.AUTO, true));
                    log.info("Auto-assigned team {} to user {} for GW{}", autoTeam.getName(),
                            cp.getUser().getUsername(), gw.getWeekNumber());
                } else {
                    toEliminate.add(cp);
                    log.info("No teams available for auto-assign — eliminating user {}", cp.getUser().getUsername());
                }
            }

            // Batch save all auto-picks and their results
            List<Pick> savedPicks = pickRepository.saveAll(autoPicks);
            List<PickResult> autoResults = savedPicks.stream()
                    .map(p -> new PickResult(p, PickOutcome.PENDING)).toList();
            pickResultRepository.saveAll(autoResults);
        } else {
            toEliminate.addAll(missed);
        }

        if (!toEliminate.isEmpty()) {
            toEliminate.forEach(cp -> {
                cp.setStatus(ParticipantStatus.ELIMINATED);
                cp.setEliminatedWeek(gw.getWeekNumber());
            });
            participantRepository.saveAll(toEliminate);

            for (CompetitionParticipant cp : toEliminate) {
                eliminateParticipant(cp, gw);
                log.info("Missed pick — eliminated user {}", cp.getUser().getUsername());
            }
        }
    }

    private void eliminateUnpaidStrictParticipants(List<CompetitionParticipant> participants, Gameweek gw) {
        participants.forEach(cp -> {
            cp.setStatus(ParticipantStatus.ELIMINATED);
            cp.setEliminatedWeek(gw.getWeekNumber());
        });
        participantRepository.saveAll(participants);

        for (CompetitionParticipant cp : participants) {
            eliminateParticipant(cp, gw);
            log.info("Strict manual payment — eliminated unpaid user {} at GW{}", cp.getUser().getUsername(), gw.getWeekNumber());
        }
    }

    /**
     * Reset a resolved gameweek so corrected fixture scores can be processed again.
     * Corrections are refused once a later gameweek has started because replaying
     * downstream eliminations without an event ledger would be unsafe.
     */
    @Transactional
    public void prepareGameweekCorrection(Long competitionId, Long gameweekId) {
        Gameweek gw = gameweekRepository.findById(gameweekId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Gameweek not found"));
        if (!gw.getCompetition().getId().equals(competitionId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gameweek does not belong to this competition");
        }
        if (gw.getStatus() != GameweekStatus.COMPLETED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only a completed gameweek needs correction reprocessing");
        }

        boolean laterWeekStarted = gameweekRepository.findAfterWeek(competitionId, gw.getWeekNumber()).stream()
                .anyMatch(later -> later.getStatus() != GameweekStatus.UPCOMING);
        if (laterWeekStarted) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot automatically correct this gameweek because a later gameweek has already started");
        }

        Competition comp = competitionRepository.findById(competitionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));
        List<CompetitionParticipant> participants = participantRepository.findByCompetitionId(competitionId);
        List<CompetitionParticipant> changed = new ArrayList<>();
        for (CompetitionParticipant participant : participants) {
            boolean updated = false;
            if (participant.getEliminatedWeek() != null
                    && participant.getEliminatedWeek() == gw.getWeekNumber()) {
                participant.setStatus(ParticipantStatus.ACTIVE);
                participant.setEliminatedWeek(null);
                updated = true;
            } else if (participant.getStatus() == ParticipantStatus.WINNER) {
                participant.setStatus(ParticipantStatus.ACTIVE);
                updated = true;
            }
            if (participant.getLifelineUsedWeek() != null
                    && participant.getLifelineUsedWeek() == gw.getWeekNumber()) {
                participant.setLifelineUsed(false);
                participant.setLifelineUsedWeek(null);
                updated = true;
            }
            if (updated) changed.add(participant);
        }
        if (!changed.isEmpty()) participantRepository.saveAll(changed);

        pickResultRepository.resetForGameweek(competitionId, gameweekId);
        gw.setStatus(GameweekStatus.IN_PROGRESS);
        gw.setByeGranted(false);
        gameweekRepository.save(gw);
        comp.setStatus(CompetitionStatus.ACTIVE);
        competitionRepository.save(comp);
        competitionCacheService.evictCompetition(competitionId);
        log.info("Prepared GW{} in competition {} for corrected result processing; restored {} participant(s)",
                gw.getWeekNumber(), competitionId, changed.size());
    }

    /**
     * Process results for a completed gameweek.
     */
    @Transactional
    public void processGameweekResults(Long gameweekId) {
        processGameweekResults(gameweekId, false);
    }

    /**
     * Async version — runs processing in a background thread so the HTTP response
     * returns immediately. Used by the admin simulate endpoint.
     */
    @Async("gameweekExecutor")
    @Transactional
    public CompletableFuture<Void> processGameweekResultsAsync(Long gameweekId, boolean skipAutoComplete) {
        try {
            // Call the internal implementation directly (not via proxy) since we're already @Transactional here
            Gameweek gw = gameweekRepository.findById(gameweekId).orElseThrow();
            if (gw.getStatus() != GameweekStatus.LOCKED && gw.getStatus() != GameweekStatus.IN_PROGRESS) {
                log.warn("processGameweekResultsAsync: GW {} not in LOCKED/IN_PROGRESS state ({}), skipping", gameweekId, gw.getStatus());
                return CompletableFuture.completedFuture(null);
            }
            processGameweekResults(gameweekId, skipAutoComplete);
        } catch (Exception e) {
            log.error("Async processGameweekResults failed for GW {}: {}", gameweekId, e.getMessage(), e);
        }
        return CompletableFuture.completedFuture(null);
    }

    /**
     * Void a gameweek while the competition is paused. Used by simulation/testing and
     * resume handling so no paused-round result can eliminate or consume teams.
     */
    @Transactional
    public void voidPausedGameweek(Long gameweekId) {
        Gameweek gw = gameweekRepository.findById(gameweekId).orElseThrow();
        Competition comp = competitionRepository.findById(gw.getCompetition().getId()).orElseThrow();
        if (!comp.isPaused()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Competition is not paused");
        }
        if (gw.getStatus() == GameweekStatus.COMPLETED && gw.isVoided()) {
            competitionCacheService.evictCompetition(comp.getId());
            return;
        }

        pickResultRepository.deleteByGameweekIds(List.of(gw.getId()));
        pickRepository.deleteByGameweekIds(List.of(gw.getId()));

        gw.setStatus(GameweekStatus.COMPLETED);
        gw.setByeGranted(true);
        gw.setVoided(true);
        gw.setVoidReason("Competition was paused when this gameweek was processed. All active entries advance.");
        gameweekRepository.save(gw);
        competitionCacheService.evictCompetition(comp.getId());
        log.info("Voided GW{} for paused competition {}. No eliminations applied.", gw.getWeekNumber(), comp.getId());
    }

    /**
     * Process results for a completed gameweek.
     * @param skipAutoComplete if true, won't auto-complete the competition even if only 1 participant remains (for testing)
     */
    @Transactional
    public void processGameweekResults(Long gameweekId, boolean skipAutoComplete) {
        // Re-fetch inside transaction so all lazy proxies (Competition etc.) are in session
        Gameweek gw = gameweekRepository.findById(gameweekId).orElseThrow();
        if (gw.getStatus() != GameweekStatus.LOCKED && gw.getStatus() != GameweekStatus.IN_PROGRESS) return;

        Competition comp = competitionRepository.findById(gw.getCompetition().getId()).orElseThrow();
        if (comp.isPaused()) return;
        List<Fixture> fixtures = fixtureRepository.findByGameweekId(gw.getId());

        // Check if all fixtures are finished or postponed
        boolean allResolved = fixtures.stream().allMatch(f -> {
            FixtureStatus s = f.getEffectiveStatus();
            return s == FixtureStatus.FINISHED || s == FixtureStatus.POSTPONED || s == FixtureStatus.CANCELLED;
        });

        // If no fixtures are FINISHED yet, don't process results — wait for actual match results
        // (handles the case where all fixtures were postponed before the gameweek even started)
        long finishedCount = fixtures.stream()
                .filter(f -> f.getEffectiveStatus() == FixtureStatus.FINISHED)
                .count();

        if (!allResolved) {
            // Move to IN_PROGRESS if any have started
            boolean anyStarted = fixtures.stream().anyMatch(f ->
                    f.getEffectiveStatus() == FixtureStatus.IN_PLAY ||
                            f.getEffectiveStatus() == FixtureStatus.FINISHED);
            if (anyStarted && gw.getStatus() == GameweekStatus.LOCKED) {
                gw.setStatus(GameweekStatus.IN_PROGRESS);
                gameweekRepository.save(gw);
            }
            return;
        }

        // All fixtures are resolved — but if none are FINISHED (all postponed/cancelled),
        // wait; the postponed fixtures may be rescheduled and we shouldn't complete the GW yet
        if (finishedCount == 0) {
            log.info("GW{} for competition {} has all fixtures postponed/cancelled — waiting for reschedule",
                    gw.getWeekNumber(), comp.getId());
            return;
        }

        // Build a map: teamId -> fixture result
        Map<Long, FixtureOutcome> teamOutcomes = new HashMap<>();
        for (Fixture f : fixtures) {
            FixtureStatus status = f.getEffectiveStatus();
            Long homeTeamId = f.getEffectiveHomeTeam().getId();
            Long awayTeamId = f.getEffectiveAwayTeam().getId();

            if (status == FixtureStatus.POSTPONED || status == FixtureStatus.CANCELLED) {
                teamOutcomes.put(homeTeamId, FixtureOutcome.POSTPONED);
                teamOutcomes.put(awayTeamId, FixtureOutcome.POSTPONED);
            } else if (status == FixtureStatus.FINISHED) {
                Integer sh = f.getEffectiveScoreHome();
                Integer sa = f.getEffectiveScoreAway();
                if (sh == null || sa == null) continue;

                if (sh > sa) {
                    teamOutcomes.put(homeTeamId, FixtureOutcome.WIN);
                    teamOutcomes.put(awayTeamId, FixtureOutcome.LOSS);
                } else if (sh < sa) {
                    teamOutcomes.put(homeTeamId, FixtureOutcome.LOSS);
                    teamOutcomes.put(awayTeamId, FixtureOutcome.WIN);
                } else {
                    teamOutcomes.put(homeTeamId, FixtureOutcome.DRAW);
                    teamOutcomes.put(awayTeamId, FixtureOutcome.DRAW);
                }
            }
        }

        // Load ALL picks for this gameweek with user+team eagerly — avoids N+1 lazy loading
        List<Pick> picks = pickRepository.findByCompetitionIdAndGameweekIdFetch(comp.getId(), gw.getId());

        // Load ALL pick results for this gameweek in one query
        Map<Long, PickResult> resultByPickId = pickResultRepository
                .findByCompetitionIdAndGameweekId(comp.getId(), gw.getId())
                .stream().collect(Collectors.toMap(pr -> pr.getPick().getId(), pr -> pr));

        // Load ALL active participants in one query — avoid N+1 for elimination lookup
        Map<Long, CompetitionParticipant> participantById = participantRepository
                .findByCompetitionIdAndStatus(comp.getId(), ParticipantStatus.ACTIVE)
                .stream().collect(Collectors.toMap(CompetitionParticipant::getId, cp -> cp));

        List<CompetitionParticipant> toEliminate = new ArrayList<>();
        List<CompetitionParticipant> toUpdate = new ArrayList<>();
        List<PickResult> allResults = new ArrayList<>();

        for (Pick pick : picks) {
            PickResult pr = resultByPickId.getOrDefault(pick.getId(), new PickResult(pick, PickOutcome.PENDING));

            if (pr.getOutcome() != PickOutcome.PENDING) continue;

            Long pickedTeamId = pick.getTeam().getId();
            FixtureOutcome outcome = teamOutcomes.get(pickedTeamId);
            CompetitionParticipant cp = pick.getParticipant() != null
                    ? participantById.get(pick.getParticipant().getId())
                    : null;
            boolean lifelinePlayed = pick.isUseLifeline() && comp.isLifelineEnabled() && cp != null;
            if (lifelinePlayed && !cp.isLifelineUsed()) {
                cp.setLifelineUsed(true);
                cp.setLifelineUsedWeek(gw.getWeekNumber());
                if (!toUpdate.contains(cp)) toUpdate.add(cp);
            }

            if (outcome == null) {
                pr.setOutcome(PickOutcome.POSTPONED_ADVANCE);
            } else {
                switch (outcome) {
                    case WIN -> pr.setOutcome(PickOutcome.ADVANCE);
                    case POSTPONED -> pr.setOutcome(PickOutcome.POSTPONED_ADVANCE);
                    case DRAW -> {
                        if (lifelinePlayed) {
                            pr.setOutcome(PickOutcome.ADVANCE);
                        } else {
                            pr.setOutcome(PickOutcome.ELIMINATED);
                            if (cp != null) toEliminate.add(cp);
                        }
                    }
                    case LOSS -> {
                        pr.setOutcome(PickOutcome.ELIMINATED);
                        if (cp != null) toEliminate.add(cp);
                    }
                }
            }

            pr.setResolvedAt(LocalDateTime.now());
            allResults.add(pr);
        }

        // Check if ALL active participants are being eliminated this gameweek
        long activeCountBeforeElimination = participantRepository.countByCompetitionIdAndStatus(
                comp.getId(), ParticipantStatus.ACTIVE);

        log.info("GW{} elimination check: {} to eliminate, {} active before, condition check: toEliminate={}, activeCount={}",
                gw.getWeekNumber(), toEliminate.size(), activeCountBeforeElimination,
                !toEliminate.isEmpty(), activeCountBeforeElimination > 1);
        log.info("Bye logic will trigger: {}",
                !toEliminate.isEmpty() && toEliminate.size() == activeCountBeforeElimination && activeCountBeforeElimination > 1);

        if (!toEliminate.isEmpty() && toEliminate.size() == activeCountBeforeElimination && activeCountBeforeElimination > 1) {
            // Everyone who was active is being eliminated — grant them all a BYE
            log.info("🎯 BYE LOGIC TRIGGERED: ALL {} active participants would be eliminated in GW{} — granting BYE to all",
                    toEliminate.size(), gw.getWeekNumber());

            // Change all ELIMINATED outcomes to ADVANCE (bye)
            for (PickResult pr : allResults) {
                if (pr.getOutcome() == PickOutcome.ELIMINATED) {
                    pr.setOutcome(PickOutcome.ADVANCE);
                    log.info("✓ Granted BYE to {}", pr.getPick().getUser().getUsername());
                }
            }

            // Don't eliminate anyone
            toEliminate.clear();
            log.info("✓ BYE granted to all {} participants - toEliminate list cleared", activeCountBeforeElimination);

            // Mark the gameweek as having a bye granted
            gw.setByeGranted(true);
            gameweekRepository.save(gw);

            // IMPORTANT: Create auto-assigned picks for the NEXT gameweek
            // Otherwise they'll be eliminated for "missed pick" when next GW is processed
            List<Gameweek> nextGameweeks = gameweekRepository.findByCompetitionIdOrderByWeekNumberAsc(comp.getId())
                    .stream()
                    .filter(nextGw -> nextGw.getWeekNumber() == gw.getWeekNumber() + 1)
                    .toList();

            if (!nextGameweeks.isEmpty()) {
                Gameweek nextGw = nextGameweeks.get(0);
                List<Fixture> nextGwFixtures = fixtureRepository.findByGameweekId(nextGw.getId());
                Set<Long> nextGwTeams = new HashSet<>();
                for (Fixture f : nextGwFixtures) {
                    nextGwTeams.add(f.getEffectiveHomeTeam().getId());
                    nextGwTeams.add(f.getEffectiveAwayTeam().getId());
                }

                List<Team> allTeams = teamRepository.findAllByOrderByNameAsc();

                // Load which users already have a pick for next GW in ONE query
                Set<Long> participantsWithNextPick = pickRepository
                        .findByCompetitionIdAndGameweekId(comp.getId(), nextGw.getId())
                        .stream().map(p -> p.getParticipant().getId()).collect(Collectors.toSet());

                List<CompetitionParticipant> usersNeedingPick = allResults.stream()
                        .filter(pr -> pr.getOutcome() == PickOutcome.ADVANCE)
                        .map(pr -> pr.getPick().getParticipant())
                        .filter(cp -> !participantsWithNextPick.contains(cp.getId()))
                        .distinct()
                        .toList();

                // Load ALL used team IDs for ALL bye users in ONE query
                List<Long> byeParticipantIds = usersNeedingPick.stream().map(CompetitionParticipant::getId).toList();
                Map<Long, Set<Long>> usedTeamsByParticipant = new HashMap<>();
                byeParticipantIds.forEach(pid -> usedTeamsByParticipant.put(pid, new HashSet<>()));
                if (!byeParticipantIds.isEmpty()) {
                    pickRepository.findUsedTeamIdsByParticipantIds(comp.getId(), byeParticipantIds)
                            .forEach(row -> usedTeamsByParticipant
                                    .computeIfAbsent((Long) row[0], k -> new HashSet<>())
                                    .add((Long) row[1]));
                }

                // Build auto-picks in memory, then batch save
                List<Pick> autoPicksToSave = new ArrayList<>();
                for (CompetitionParticipant participant : usersNeedingPick) {
                    Set<Long> usedTeamIds = usedTeamsByParticipant.getOrDefault(participant.getId(), Set.of());
                    Team autoTeam = allTeams.stream()
                            .filter(t -> !usedTeamIds.contains(t.getId()) && nextGwTeams.contains(t.getId()))
                            .findFirst().orElse(null);
                    if (autoTeam != null) {
                        autoPicksToSave.add(new Pick(comp, participant.getUser(), participant, nextGw, autoTeam, PickSource.AUTO, false));
                        log.info("✓ Auto-assigned {} to {} for next GW{} (bye follow-up)",
                                autoTeam.getName(), participant.getUser().getUsername(), nextGw.getWeekNumber());
                    } else {
                        log.warn("⚠ No available team for {} in next GW{} after bye",
                                participant.getUser().getUsername(), nextGw.getWeekNumber());
                    }
                }
                List<Pick> savedAutoPicks = pickRepository.saveAll(autoPicksToSave);
                List<PickResult> autoResults = savedAutoPicks.stream()
                        .map(p -> new PickResult(p, PickOutcome.PENDING)).toList();
                pickResultRepository.saveAll(autoResults);
            }
        } else {
            log.info("Bye logic NOT triggered - proceeding with {} eliminations", toEliminate.size());
        }

        // Save all results in one batch
        pickResultRepository.saveAll(allResults);

        if (!toUpdate.isEmpty()) {
            participantRepository.saveAll(toUpdate);
        }

        // Bulk-eliminate participants — single saveAll + two bulk DELETEs instead of N*2 SQL statements
        if (!toEliminate.isEmpty()) {
            toEliminate.forEach(cp -> {
                cp.setStatus(ParticipantStatus.ELIMINATED);
                cp.setEliminatedWeek(gw.getWeekNumber());
            });
            participantRepository.saveAll(toEliminate);

            // Two SQL statements instead of 2*N — delete future pick results then picks for all users at once
            List<Long> eliminatedParticipantIds = toEliminate.stream().map(CompetitionParticipant::getId).toList();
            pickResultRepository.deleteFuturePickResultsForParticipants(comp.getId(), eliminatedParticipantIds, gw.getWeekNumber());
            pickRepository.deleteFuturePicksForParticipants(comp.getId(), eliminatedParticipantIds, gw.getWeekNumber());
            log.info("Bulk-eliminated {} entries in GW{} — cleared future picks in 2 queries",
                    toEliminate.size(), gw.getWeekNumber());
        }

        // Handle postponed-consumes-team: if competition config says NO, delete the pick's team usage
        // (This is handled by the "used teams" query which checks all picks regardless)
        // If postponedConsumesTeam=false, we need to allow re-picking that team.
        // We'll handle this in PickService by checking the competition config + pick result.

        gw.setStatus(GameweekStatus.COMPLETED);
        gameweekRepository.save(gw);

        // Complete before buffering. A completed competition must not fetch or retain
        // gameweeks that can never be played.
        if (!skipAutoComplete) {
            checkCompetitionCompletion(comp);
        } else {
            log.info("Skipped auto-completion check for competition {} (testing mode)", comp.getId());
        }

        competitionCacheService.evictCompetition(comp.getId());
        eventPublisher.publishEvent(new GameweekResultsFinalizedEvent(comp.getId(), gw.getId()));
        log.info("Finalized results for GW{} in competition {}; post-processing queued",
                gw.getWeekNumber(), comp.getId());
    }

    private void eliminateParticipant(CompetitionParticipant cp, Gameweek gw) {
        // Status/week already set and saved by the batch saveAll before this call
        Long competitionId = cp.getCompetition().getId();
        Long participantId = cp.getId();
        int weekNumber = gw.getWeekNumber();

        // Bulk delete future pick results then picks in 2 SQL statements
        pickResultRepository.deleteFuturePickResultsForParticipant(competitionId, participantId, weekNumber);
        pickRepository.deleteFuturePicksForParticipant(competitionId, participantId, weekNumber);
        log.info("Eliminated entry {} in competition {} at GW{} — cleared future picks",
                cp.getUser().getUsername(), competitionId, weekNumber);
    }

    private void checkCompetitionCompletion(Competition comp) {
        long activeCount = participantRepository.countByCompetitionIdAndStatus(comp.getId(), ParticipantStatus.ACTIVE);
        if (activeCount <= 1) {
            comp.setStatus(CompetitionStatus.COMPLETED);
            competitionRepository.save(comp);

            if (activeCount == 1) {
                CompetitionParticipant winner = participantRepository
                        .findByCompetitionIdAndStatus(comp.getId(), ParticipantStatus.ACTIVE)
                        .get(0);
                winner.setStatus(ParticipantStatus.WINNER);
                participantRepository.save(winner);
                log.info("Competition {} completed! Winner: {}", comp.getId(), winner.getUser().getUsername());
            } else {
                log.info("Competition {} completed with no remaining participants", comp.getId());
            }

            cleanupUnusedFutureGameweeks(comp.getId());
        }
    }

    /**
     * Remove gameweeks that can never be played after competition completion.
     * Completed history remains available; only UPCOMING weeks and their dependent
     * reserved picks, results and fixtures are deleted.
     */
    @Transactional
    public int cleanupUnusedFutureGameweeks(Long competitionId) {
        List<Long> gameweekIds = gameweekRepository.findIdsByCompetitionIdAndStatus(
                competitionId, GameweekStatus.UPCOMING);
        if (gameweekIds.isEmpty()) return 0;

        pickResultRepository.deleteByGameweekIds(gameweekIds);
        pickRepository.deleteByGameweekIds(gameweekIds);
        fixtureRepository.deleteByGameweekIds(gameweekIds);
        gameweekRepository.deleteByIds(gameweekIds);
        competitionCacheService.evictCompetition(competitionId);
        log.info("Removed {} unused future gameweek(s) from completed competition {}",
                gameweekIds.size(), competitionId);
        return gameweekIds.size();
    }

    private enum FixtureOutcome {
        WIN, LOSS, DRAW, POSTPONED
    }
}
