package com.lastmanstanding.service;

import com.lastmanstanding.entity.*;
import com.lastmanstanding.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import jakarta.persistence.EntityManager;

import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ThreadLocalRandom;

@Service
public class CompetitionService {

    private static final Logger log = LoggerFactory.getLogger(CompetitionService.class);
    private static final int FIXTURE_DELETE_BATCH_SIZE = 250;
    private static final int PICK_DELETE_BATCH_SIZE = 500;
    private static final char[] JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    private final CompetitionRepository competitionRepository;
    private final CompetitionParticipantRepository participantRepository;
    private final UserRepository userRepository;
    private final PickRepository pickRepository;
    private final PickResultRepository pickResultRepository;
    private final GameweekRepository gameweekRepository;
    private final FixtureRepository fixtureRepository;
    private final PaymentRepository paymentRepository;
    private final ClubRepository clubRepository;
    private final FixtureSyncService fixtureSyncService;
    private final FixtureMutationLockService fixtureMutationLockService;
    private final EntityManager entityManager;

    public CompetitionService(CompetitionRepository competitionRepository,
                              CompetitionParticipantRepository participantRepository,
                              UserRepository userRepository,
                              PickRepository pickRepository,
                              PickResultRepository pickResultRepository,
                              GameweekRepository gameweekRepository,
                              FixtureRepository fixtureRepository,
                              PaymentRepository paymentRepository,
                              ClubRepository clubRepository,
                              FixtureSyncService fixtureSyncService,
                              FixtureMutationLockService fixtureMutationLockService,
                              EntityManager entityManager) {
        this.competitionRepository = competitionRepository;
        this.participantRepository = participantRepository;
        this.userRepository = userRepository;
        this.pickRepository = pickRepository;
        this.pickResultRepository = pickResultRepository;
        this.gameweekRepository = gameweekRepository;
        this.fixtureRepository = fixtureRepository;
        this.paymentRepository = paymentRepository;
        this.clubRepository = clubRepository;
        this.fixtureSyncService = fixtureSyncService;
        this.fixtureMutationLockService = fixtureMutationLockService;
        this.entityManager = entityManager;
    }

    public List<Competition> getUpcomingCompetitions(Long clubId) {
        List<CompetitionStatus> statuses = List.of(CompetitionStatus.UPCOMING, CompetitionStatus.ACTIVE);
        if (clubId != null) {
            return competitionRepository.findByStatusInAndClubIdAndVisibilityOrderByStartDateAsc(statuses, clubId, CompetitionVisibility.PUBLIC);
        }
        return competitionRepository.findByStatusInAndVisibilityOrderByStartDateAsc(statuses, CompetitionVisibility.PUBLIC);
    }

    public List<Competition> getAllCompetitions() {
        return competitionRepository.findAll();
    }

    public Competition getCompetition(Long id) {
        return competitionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));
    }

    public Competition getCompetitionByJoinCode(String joinCode) {
        return competitionRepository.findByJoinCodeIgnoreCase(joinCode)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));
    }

    @Transactional
    public CompetitionParticipant joinCompetition(Long competitionId, Long userId) {
        Competition comp = competitionRepository.findById(competitionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));

        if (comp.getStatus() != CompetitionStatus.UPCOMING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Competition has already started");
        }

        if (participantRepository.existsByCompetitionIdAndUserId(competitionId, userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Already joined this competition");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        CompetitionParticipant cp = new CompetitionParticipant(comp, user, ParticipantStatus.ACTIVE);
        return participantRepository.save(cp);
    }

    public ParticipantInfo getMyStatus(Long competitionId, Long userId) {
        CompetitionParticipant cp = participantRepository.findByCompetitionIdAndUserId(competitionId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Not a participant"));

        List<Long> usedTeamIds = pickRepository.findUsedTeamIds(competitionId, userId);
        List<Pick> picks = pickRepository.findByCompetitionIdAndUserId(competitionId, userId);
        List<Long> pickIds = picks.stream().map(Pick::getId).toList();
        List<PickResult> results = pickResultRepository.findByPickIdIn(pickIds);

        return new ParticipantInfo(cp, usedTeamIds, picks, results);
    }

    public List<CompetitionParticipant> getParticipants(Long competitionId) {
        return participantRepository.findByCompetitionId(competitionId);
    }

    // ── Admin ────────────────────────────────────────────────────────────

    @Transactional
    public Competition createCompetition(
            String name, String description, BigDecimal entryFee, BigDecimal prizePool,
            MissedPickMode missedPickMode, boolean postponedConsumesTeam, boolean passFeeToParticipant,
            String paymentMode, String visibility, java.time.LocalDate startDate, Long adminUserId, Long clubId) {
        return createCompetition(name, description, entryFee, prizePool, missedPickMode, postponedConsumesTeam,
                passFeeToParticipant, paymentMode, visibility, startDate, adminUserId, clubId, true);
    }

    @Transactional
    public Competition createCompetition(
            String name, String description, BigDecimal entryFee, BigDecimal prizePool,
            MissedPickMode missedPickMode, boolean postponedConsumesTeam, boolean passFeeToParticipant,
            String paymentMode, String visibility, java.time.LocalDate startDate, Long adminUserId, Long clubId,
            boolean autoSyncFixtures) {
        User admin = userRepository.findById(adminUserId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Admin user not found"));
        Competition comp = new Competition(name, description, entryFee,
                CompetitionStatus.UPCOMING, missedPickMode, postponedConsumesTeam, startDate, admin);
        comp.setPassFeeToParticipant(passFeeToParticipant);
        comp.setPrizePool(prizePool);
        if (paymentMode != null) {
            try { comp.setPaymentMode(PaymentMode.valueOf(paymentMode)); }
            catch (IllegalArgumentException ignored) {}
        } else {
            comp.setPaymentMode(entryFee == null || entryFee.compareTo(BigDecimal.ZERO) == 0
                    ? PaymentMode.FREE
                    : PaymentMode.STRIPE);
        }
        CompetitionVisibility parsedVisibility = parseVisibility(visibility);
        comp.setVisibility(parsedVisibility);
        if (parsedVisibility == CompetitionVisibility.PRIVATE) {
            comp.setJoinCode(generateJoinCode());
        } else {
            comp.setJoinCode(null);
        }

        if (clubId != null) {
            Club club = clubRepository.findById(clubId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));
            comp.setClub(club);
        }
        Competition saved = competitionRepository.save(comp);

        if (!autoSyncFixtures) {
            return saved;
        }

        // Run fixture sync in background after commit so the competition is visible to the thread.
        Long savedId = saved.getId();
        String savedName = saved.getName();
        Runnable syncTask = () -> {
            try {
                int fixtureCount = fixtureSyncService.syncForCompetition(
                        competitionRepository.findById(savedId)
                                .orElseThrow(() -> new IllegalStateException("Competition not found for sync")));
                log.info("Auto-synced {} fixtures for new competition '{}'", fixtureCount, savedName);
            } catch (Exception e) {
                log.warn("Could not auto-sync fixtures for competition '{}': {}", savedName, e.getMessage());
            }
        };
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    new Thread(syncTask, "fixture-sync-" + savedId).start();
                }
            });
        } else {
            new Thread(syncTask, "fixture-sync-" + savedId).start();
        }

        return saved;
    }

    @Transactional
    public Competition updateCompetition(Long id, String name, String description, BigDecimal entryFee,
                                         BigDecimal prizePool, MissedPickMode missedPickMode,
                                         boolean postponedConsumesTeam, Boolean passFeeToParticipant,
                                         String paymentMode, String visibility, java.time.LocalDate startDate,
                                         CompetitionStatus status, Long clubId) {
        Competition comp = competitionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));
        if (name != null) comp.setName(name);
        if (description != null) comp.setDescription(description.isBlank() ? null : description);
        if (entryFee != null) comp.setEntryFee(entryFee);
        comp.setPrizePool(prizePool); // null is valid (clears it)
        if (missedPickMode != null) comp.setMissedPickMode(missedPickMode);
        comp.setPostponedConsumesTeam(postponedConsumesTeam);
        if (passFeeToParticipant != null) comp.setPassFeeToParticipant(passFeeToParticipant);
        if (paymentMode != null) {
            try { comp.setPaymentMode(PaymentMode.valueOf(paymentMode)); }
            catch (IllegalArgumentException ignored) {}
        }
        if (visibility != null) {
            CompetitionVisibility parsedVisibility = parseVisibility(visibility);
            comp.setVisibility(parsedVisibility);
            if (parsedVisibility == CompetitionVisibility.PRIVATE) {
                if (comp.getJoinCode() == null || comp.getJoinCode().isBlank()) {
                    comp.setJoinCode(generateJoinCode());
                }
            } else {
                comp.setJoinCode(null);
            }
        }
        if (startDate != null) comp.setStartDate(startDate);
        if (status != null) comp.setStatus(status);
        if (clubId != null) {
            if (clubId <= 0) {
                comp.setClub(null);
            } else {
                Club club = clubRepository.findById(clubId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));
                comp.setClub(club);
            }
        }
        return competitionRepository.save(comp);
    }

    private CompetitionVisibility parseVisibility(String visibility) {
        if (visibility == null || visibility.isBlank()) {
            return CompetitionVisibility.PUBLIC;
        }
        try {
            return CompetitionVisibility.valueOf(visibility.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return CompetitionVisibility.PUBLIC;
        }
    }

    private String generateJoinCode() {
        for (int attempt = 0; attempt < 20; attempt++) {
            String code = randomJoinCode(8);
            if (!competitionRepository.existsByJoinCode(code)) {
                return code;
            }
        }
        throw new IllegalStateException("Could not generate a unique join code");
    }

    private String randomJoinCode(int length) {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        StringBuilder builder = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            builder.append(JOIN_CODE_ALPHABET[random.nextInt(JOIN_CODE_ALPHABET.length)]);
        }
        return builder.toString();
    }

    // ── DTO ─────────────────────────────────────────────────────────────

    /**
     * Delete a competition and all related data (picks, results, participants, fixtures, gameweeks).
     */
    @Transactional
    public void deleteCompetition(Long competitionId) {
        fixtureMutationLockService.runWithLock(() -> {
            if (!competitionRepository.existsById(competitionId)) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found");
            }

            List<Long> gameweekIds = gameweekRepository.findIdsByCompetitionIdOrderByWeekNumberAsc(competitionId);

            // Keep fixture writes serialized with scheduled syncs to avoid row-lock timeouts.
            paymentRepository.deleteByCompetitionId(competitionId);
            while (true) {
                List<Long> pickIds = pickRepository.findIdsByCompetitionIdLimit(competitionId, PICK_DELETE_BATCH_SIZE);
                if (pickIds.isEmpty()) {
                    break;
                }
                pickResultRepository.deleteByPickIdIn(pickIds);
                pickRepository.deleteAllByIdInBatch(pickIds);
                entityManager.flush();
                entityManager.clear();
            }
            participantRepository.deleteByCompetitionId(competitionId);
            for (Long gameweekId : gameweekIds) {
                while (true) {
                    List<Long> fixtureIds = fixtureRepository.findIdsByGameweekIdLimit(gameweekId, FIXTURE_DELETE_BATCH_SIZE);
                    if (fixtureIds.isEmpty()) {
                        break;
                    }
                    fixtureRepository.deleteAllByIdInBatch(fixtureIds);
                }
            }
            entityManager.flush();
            entityManager.clear();
            gameweekRepository.deleteByCompetitionId(competitionId);
            entityManager.flush();
            entityManager.clear();
            competitionRepository.deleteById(competitionId);
        });
    }

    /**
     * Remove a participant from a competition, deleting their picks and results.
     */
    @Transactional
    public void removeParticipant(Long competitionId, Long userId) {
        participantRepository.findByCompetitionIdAndUserId(competitionId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Participant not found"));

        pickResultRepository.deleteByCompetitionIdAndUserId(competitionId, userId);
        pickRepository.deleteByCompetitionIdAndUserId(competitionId, userId);
        participantRepository.deleteByCompetitionIdAndUserId(competitionId, userId);
    }

    public record ParticipantInfo(
            CompetitionParticipant participant,
            List<Long> usedTeamIds,
            List<Pick> picks,
            List<PickResult> results
    ) {}
}
