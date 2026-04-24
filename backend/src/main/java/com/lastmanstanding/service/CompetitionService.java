package com.lastmanstanding.service;

import com.lastmanstanding.entity.*;
import com.lastmanstanding.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.math.BigDecimal;
import java.util.List;

@Service
public class CompetitionService {

    private static final Logger log = LoggerFactory.getLogger(CompetitionService.class);

    private final CompetitionRepository competitionRepository;
    private final CompetitionParticipantRepository participantRepository;
    private final UserRepository userRepository;
    private final PickRepository pickRepository;
    private final PickResultRepository pickResultRepository;
    private final GameweekRepository gameweekRepository;
    private final FixtureRepository fixtureRepository;
    private final ClubRepository clubRepository;
    private final FixtureSyncService fixtureSyncService;

    public CompetitionService(CompetitionRepository competitionRepository,
                              CompetitionParticipantRepository participantRepository,
                              UserRepository userRepository,
                              PickRepository pickRepository,
                              PickResultRepository pickResultRepository,
                              GameweekRepository gameweekRepository,
                              FixtureRepository fixtureRepository,
                              ClubRepository clubRepository,
                              FixtureSyncService fixtureSyncService) {
        this.competitionRepository = competitionRepository;
        this.participantRepository = participantRepository;
        this.userRepository = userRepository;
        this.pickRepository = pickRepository;
        this.pickResultRepository = pickResultRepository;
        this.gameweekRepository = gameweekRepository;
        this.fixtureRepository = fixtureRepository;
        this.clubRepository = clubRepository;
        this.fixtureSyncService = fixtureSyncService;
    }

    public List<Competition> getUpcomingCompetitions(Long clubId) {
        List<CompetitionStatus> statuses = List.of(CompetitionStatus.UPCOMING, CompetitionStatus.ACTIVE);
        if (clubId != null) {
            return competitionRepository.findByStatusInAndClubIdOrderByStartDateAsc(statuses, clubId);
        }
        return competitionRepository.findByStatusInOrderByStartDateAsc(statuses);
    }

    public List<Competition> getAllCompetitions() {
        return competitionRepository.findAll();
    }

    public Competition getCompetition(Long id) {
        return competitionRepository.findById(id)
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
            String paymentMode, java.time.LocalDate startDate, Long adminUserId, Long clubId) {
        User admin = userRepository.findById(adminUserId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Admin user not found"));
        Competition comp = new Competition(name, description, entryFee,
                CompetitionStatus.UPCOMING, missedPickMode, postponedConsumesTeam, startDate, admin);
        comp.setPassFeeToParticipant(passFeeToParticipant);
        comp.setPrizePool(prizePool);
        if (paymentMode != null) {
            try { comp.setPaymentMode(com.lastmanstanding.entity.PaymentMode.valueOf(paymentMode)); }
            catch (IllegalArgumentException ignored) {}
        } else {
            comp.setPaymentMode(entryFee == null || entryFee.compareTo(java.math.BigDecimal.ZERO) == 0
                    ? com.lastmanstanding.entity.PaymentMode.FREE
                    : com.lastmanstanding.entity.PaymentMode.STRIPE);
        }

        if (clubId != null) {
            Club club = clubRepository.findById(clubId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));
            comp.setClub(club);
        }
        Competition saved = competitionRepository.save(comp);

        // Run fixture sync in background so the HTTP response returns immediately
        Long savedId = saved.getId();
        String savedName = saved.getName();
        new Thread(() -> {
            try {
                int fixtureCount = fixtureSyncService.syncForCompetition(
                        competitionRepository.findById(savedId).orElseThrow());
                log.info("Auto-synced {} fixtures for new competition '{}'", fixtureCount, savedName);
            } catch (Exception e) {
                log.warn("Could not auto-sync fixtures for competition '{}': {}", savedName, e.getMessage());
            }
        }, "fixture-sync-" + savedId).start();

        return saved;
    }

    @Transactional
    public Competition updateCompetition(Long id, String name, String description, BigDecimal entryFee,
                                         BigDecimal prizePool, MissedPickMode missedPickMode,
                                         boolean postponedConsumesTeam, Boolean passFeeToParticipant,
                                         String paymentMode, java.time.LocalDate startDate,
                                         CompetitionStatus status, Long clubId) {
        Competition comp = competitionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));
        if (name != null) comp.setName(name);
        if (description != null) comp.setDescription(description);
        if (entryFee != null) comp.setEntryFee(entryFee);
        comp.setPrizePool(prizePool); // null is valid (clears it)
        if (missedPickMode != null) comp.setMissedPickMode(missedPickMode);
        comp.setPostponedConsumesTeam(postponedConsumesTeam);
        if (passFeeToParticipant != null) comp.setPassFeeToParticipant(passFeeToParticipant);
        if (paymentMode != null) {
            try { comp.setPaymentMode(com.lastmanstanding.entity.PaymentMode.valueOf(paymentMode)); }
            catch (IllegalArgumentException ignored) {}
        }
        if (startDate != null) comp.setStartDate(startDate);
        if (status != null) comp.setStatus(status);
        if (clubId != null) {
            Club club = clubRepository.findById(clubId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));
            comp.setClub(club);
        }
        return competitionRepository.save(comp);
    }

    // ── DTO ─────────────────────────────────────────────────────────────

    /**
     * Delete a competition and all related data (picks, results, participants, fixtures, gameweeks).
     */
    @Transactional
    public void deleteCompetition(Long competitionId) {
        competitionRepository.findById(competitionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));

        // Bulk deletes in FK dependency order — each is a single SQL statement
        pickResultRepository.deleteByCompetitionId(competitionId);
        pickRepository.deleteByCompetitionId(competitionId);
        participantRepository.deleteByCompetitionId(competitionId);
        fixtureRepository.deleteByCompetitionId(competitionId);
        gameweekRepository.deleteByCompetitionId(competitionId);
        competitionRepository.deleteById(competitionId);
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
