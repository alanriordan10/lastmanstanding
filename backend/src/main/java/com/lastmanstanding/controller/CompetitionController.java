package com.lastmanstanding.controller;

import com.lastmanstanding.dto.CompetitionDtos.*;
import com.lastmanstanding.entity.*;
import com.lastmanstanding.repository.*;
import com.lastmanstanding.security.UserDetailsImpl;
import com.lastmanstanding.service.CompetitionService;
import com.lastmanstanding.service.PickService;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/competitions")
public class CompetitionController {

    private final CompetitionService competitionService;
    private final PickService pickService;
    private final CompetitionRepository competitionRepository;
    private final GameweekRepository gameweekRepository;
    private final FixtureRepository fixtureRepository;
    private final PickRepository pickRepository;
    private final PickResultRepository pickResultRepository;
    private final CompetitionParticipantRepository participantRepository;
    private final TeamRepository teamRepository;
    private final ClubRepository clubRepository;
    private final PaymentRepository paymentRepository;

    public CompetitionController(CompetitionService competitionService,
                                 PickService pickService,
                                 CompetitionRepository competitionRepository,
                                 GameweekRepository gameweekRepository,
                                 FixtureRepository fixtureRepository,
                                 PickRepository pickRepository,
                                 PickResultRepository pickResultRepository,
                                 CompetitionParticipantRepository participantRepository,
                                 TeamRepository teamRepository,
                                 ClubRepository clubRepository,
                                 PaymentRepository paymentRepository) {
        this.competitionService = competitionService;
        this.pickService = pickService;
        this.competitionRepository = competitionRepository;
        this.gameweekRepository = gameweekRepository;
        this.fixtureRepository = fixtureRepository;
        this.pickRepository = pickRepository;
        this.pickResultRepository = pickResultRepository;
        this.participantRepository = participantRepository;
        this.teamRepository = teamRepository;
        this.clubRepository = clubRepository;
        this.paymentRepository = paymentRepository;
    }

    // ── Competitions ────────────────────────────────────────────────────

    @GetMapping("/upcoming")
    public List<CompetitionResponse> getUpcoming(@RequestParam(required = false) Long clubId) {
        List<Competition> comps = competitionService.getUpcomingCompetitions(clubId);
        if (comps.isEmpty()) return List.of();

        List<Long> compIds = comps.stream().map(Competition::getId).distinct().toList();
        Map<Long, long[]> countsByCompId = batchParticipantCounts(compIds);
        Map<Long, String> winnerByCompId = batchWinners(compIds);
        Map<Long, java.time.LocalDate> firstGwDates = batchFirstGameweekDates(compIds);

        return comps.stream().map(c -> {
            long[] counts = countsByCompId.getOrDefault(c.getId(), new long[]{0, 0});
            return CompetitionResponse.from(c, (int) counts[0], (int) counts[1],
                    winnerByCompId.get(c.getId()), firstGwDates.get(c.getId()));
        }).toList();
    }

    @GetMapping("/code/{joinCode}")
    public CompetitionResponse getCompetitionByJoinCode(@PathVariable String joinCode) {
        Competition c = competitionService.getCompetitionByJoinCode(joinCode);
        List<Long> compIds = List.of(c.getId());
        long[] cnt = batchParticipantCounts(compIds).getOrDefault(c.getId(), new long[]{0, 0});
        return CompetitionResponse.from(c, (int) cnt[0], (int) cnt[1],
                batchWinners(compIds).get(c.getId()), firstGameweekDate(c.getId()));
    }

    @GetMapping("/past")
    public List<CompetitionResponse> getPastCompetitions(
            @AuthenticationPrincipal UserDetailsImpl userDetails,
            @RequestParam(required = false) Long clubId) {

        LocalDate cutoffDate = LocalDate.now().minusMonths(3);
        List<Competition> past;
        if (userDetails.getUser().getRole().name().equals("CLUB_ADMIN")) {
            List<Club> clubs = clubRepository.findByClubAdminId(userDetails.getId());
            if (clubs.isEmpty()) return List.of();
            past = competitionRepository.findByStatusAndClubIdOrderByStartDateDesc(
                    CompetitionStatus.COMPLETED, clubs.get(0).getId());
        } else if (userDetails.getUser().getRole().name().equals("ADMIN")) {
            past = clubId != null
                    ? competitionRepository.findByStatusAndClubIdOrderByStartDateDesc(CompetitionStatus.COMPLETED, clubId)
                    : competitionRepository.findByStatusOrderByStartDateDesc(CompetitionStatus.COMPLETED);
        } else {
            return List.of();
        }
        past = past.stream()
                .filter(c -> {
                    if (c.getStartDate() != null) {
                        return !c.getStartDate().isBefore(cutoffDate);
                    }
                    return c.getCreatedAt() != null && !c.getCreatedAt().toLocalDate().isBefore(cutoffDate);
                })
                .toList();
        if (past.isEmpty()) return List.of();

        List<Long> compIds = past.stream().map(Competition::getId).distinct().toList();
        Map<Long, long[]> counts = batchParticipantCounts(compIds);
        Map<Long, String> winners = batchWinners(compIds);
        return past.stream().map(c -> {
            long[] cnt = counts.getOrDefault(c.getId(), new long[]{0, 0});
            return CompetitionResponse.from(c, (int) cnt[0], 0, winners.get(c.getId()));
        }).toList();
    }

    @GetMapping("/my")
    public List<Long> getMyCompetitionIds(@AuthenticationPrincipal UserDetailsImpl userDetails) {
        return participantRepository.findDistinctCompetitionIdsByUserId(userDetails.getId());
    }

    @GetMapping("/my/details")
    public List<MyCompetitionResponse> getMyCompetitions(@AuthenticationPrincipal UserDetailsImpl userDetails) {
        List<CompetitionParticipant> participants = participantRepository.findByUserIdOrderByJoinedAtDesc(userDetails.getId());
        if (participants.isEmpty()) return List.of();

        // Batch load all counts, winners, and first gameweek dates in bulk
        List<Long> compIds = participants.stream()
                .map(cp -> cp.getCompetition().getId())
                .distinct()
                .toList();
        Map<Long, long[]> counts   = batchParticipantCounts(compIds);
        Map<Long, String> winners  = batchWinners(compIds);
        Map<Long, java.time.LocalDate> firstGwDates = batchFirstGameweekDates(compIds);
        Map<Long, String> paymentStates = paymentStatesForUser(userDetails.getId(), participants);

        return participants.stream().map(cp -> {
            Competition c = cp.getCompetition();
            long[] cnt = counts.getOrDefault(c.getId(), new long[]{0, 0});
            return new MyCompetitionResponse(
                    CompetitionResponse.from(c, (int) cnt[0], (int) cnt[1],
                            winners.get(c.getId()), firstGwDates.get(c.getId())),
                    cp.getId(),
                    cp.getEntryNumber(),
                    cp.getStatus().name(), paymentStates.getOrDefault(cp.getId(), "NOT_REQUIRED"), cp.getEliminatedWeek(), cp.getJoinedAt()
            );
        }).toList();
    }

    @GetMapping("/{id}")
    public CompetitionResponse getCompetition(@PathVariable Long id) {
        Competition c = competitionService.getCompetition(id);
        List<Long> compIds = List.of(c.getId());
        long[] cnt = batchParticipantCounts(compIds).getOrDefault(c.getId(), new long[]{0, 0});
        return CompetitionResponse.from(c, (int) cnt[0], (int) cnt[1],
                batchWinners(compIds).get(c.getId()), firstGameweekDate(c.getId()));
    }

    // ── Batch helpers — each does ONE query ─────────────────────────────

    private Map<Long, long[]> batchParticipantCounts() {
        Map<Long, long[]> map = new java.util.HashMap<>();
        participantRepository.countParticipantsGroupedByCompetition().forEach(row -> {
            long cId    = ((Number) row[0]).longValue();
            long total  = ((Number) row[1]).longValue();
            long active = row[2] != null ? ((Number) row[2]).longValue() : 0L;
            map.put(cId, new long[]{total, active});
        });
        return map;
    }

    private Map<Long, long[]> batchParticipantCounts(List<Long> competitionIds) {
        if (competitionIds.isEmpty()) return Map.of();
        Map<Long, long[]> map = new java.util.HashMap<>();
        participantRepository.countParticipantsGroupedByCompetitionIds(competitionIds).forEach(row -> {
            long cId    = ((Number) row[0]).longValue();
            long total  = ((Number) row[1]).longValue();
            long active = row[2] != null ? ((Number) row[2]).longValue() : 0L;
            map.put(cId, new long[]{total, active});
        });
        return map;
    }

    private Map<Long, String> batchWinners() {
        Map<Long, String> map = new java.util.HashMap<>();
        participantRepository.findByStatus(ParticipantStatus.WINNER)
                .forEach(cp -> map.put(cp.getCompetition().getId(), cp.getUser().getUsername()));
        return map;
    }

    private Map<Long, String> batchWinners(List<Long> competitionIds) {
        if (competitionIds.isEmpty()) return Map.of();
        Map<Long, String> map = new java.util.HashMap<>();
        participantRepository.findWinnerUsernamesByCompetitionIds(competitionIds)
                .forEach(row -> map.put(((Number) row[0]).longValue(), (String) row[1]));
        return map;
    }

    /** Load first active/upcoming gameweek date for a list of competitions in ONE query */
    private Map<Long, java.time.LocalDate> batchFirstGameweekDates(List<Long> competitionIds) {
        if (competitionIds.isEmpty()) return Map.of();
        Map<Long, java.time.LocalDate> map = new java.util.HashMap<>();
        gameweekRepository.findFirstActiveGameweekDates(competitionIds).forEach(row -> {
            long compId = ((Number) row[0]).longValue();
            java.time.LocalDateTime dt = (java.time.LocalDateTime) row[1];
            map.put(compId, dt.toLocalDate());
        });
        return map;
    }

    private java.time.LocalDate firstGameweekDate(Long competitionId) {
        return batchFirstGameweekDates(List.of(competitionId)).get(competitionId);
    }

    @PostMapping("/{id}/join")
    public ResponseEntity<ParticipantResponse> join(@PathVariable Long id,
                                                    @AuthenticationPrincipal UserDetailsImpl userDetails) {
        CompetitionParticipant cp = competitionService.joinCompetition(id, userDetails.getId());
        return ResponseEntity.status(HttpStatus.CREATED).body(ParticipantResponse.from(cp));
    }

    @GetMapping("/{id}/me")
    public MyStatusResponse myStatus(@PathVariable Long id,
                                     @RequestParam(required = false) Long entryId,
                                     @AuthenticationPrincipal UserDetailsImpl userDetails) {
        CompetitionService.ParticipantInfo info;
        try {
            info = competitionService.getMyStatus(id, userDetails.getId(), entryId);
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode() == HttpStatus.NOT_FOUND) {
                if (!competitionRepository.existsById(id)) {
                    throw ex;
                }
                return new MyStatusResponse(null, List.of(), List.of());
            }
            throw ex;
        }

        // Build pick result map
        Map<Long, PickResult> resultMap = info.results().stream()
                .collect(Collectors.toMap(pr -> pr.getPick().getId(), pr -> pr));

        List<PickHistoryItem> pickItems = info.picks().stream().map(p -> {
            PickResult pr = resultMap.get(p.getId());
            return new PickHistoryItem(
                    p.getId(), p.getGameweek().getId(), p.getGameweek().getWeekNumber(),
                    p.getTeam().getId(), p.getTeam().getName(), p.getTeam().getShortName(),
                    p.getSource().name(), p.isLocked(), p.isUseLifeline(), p.getPickedAt(),
                    pr != null ? pr.getOutcome().name() : "PENDING",
                    pr != null ? pr.getResolvedAt() : null
            );
        }).toList();

        return new MyStatusResponse(
                ParticipantResponse.from(info.participant(), paymentStateForParticipant(info.participant())),
                info.usedTeamIds(),
                pickItems
        );
    }

    private Map<Long, String> paymentStatesForUser(Long userId, List<CompetitionParticipant> participants) {
        if (participants.isEmpty()) return Map.of();

        boolean hasPaidModes = participants.stream()
                .anyMatch(cp -> cp.getCompetition().getPaymentMode() == PaymentMode.MANUAL
                        || cp.getCompetition().getPaymentMode() == PaymentMode.STRIPE);
        if (!hasPaidModes) {
            Map<Long, String> states = new java.util.HashMap<>();
            participants.forEach(cp -> states.put(cp.getId(), "NOT_REQUIRED"));
            return states;
        }

        List<Long> participantIds = participants.stream().map(CompetitionParticipant::getId).toList();
        List<Long> paidModeCompetitionIds = participants.stream()
                .map(CompetitionParticipant::getCompetition)
                .filter(c -> c.getPaymentMode() == PaymentMode.MANUAL || c.getPaymentMode() == PaymentMode.STRIPE)
                .map(Competition::getId)
                .distinct()
                .toList();
        java.util.Set<Long> paidParticipantIds = new java.util.HashSet<>(
                paymentRepository.findSucceededParticipantIdsByCompetitionIdInAndParticipantIdIn(paidModeCompetitionIds, participantIds));

        List<Long> stripeCompetitionIds = participants.stream()
                .map(CompetitionParticipant::getCompetition)
                .filter(c -> c.getPaymentMode() == PaymentMode.STRIPE)
                .map(Competition::getId)
                .distinct()
                .toList();
        java.util.Set<Long> participantScopedStripeCompetitions = stripeCompetitionIds.isEmpty()
                ? java.util.Set.of()
                : new java.util.HashSet<>(
                        paymentRepository.findCompetitionIdsWithParticipantScopedPaymentsForUser(userId, stripeCompetitionIds));
        java.util.Set<Long> legacySucceededStripeCompetitionIds = stripeCompetitionIds.isEmpty()
                ? java.util.Set.of()
                : paymentRepository.findStatusesByUserAndCompetitionIds(userId, stripeCompetitionIds).stream()
                        .filter(row -> row[1] == Payment.PaymentStatus.SUCCEEDED)
                        .map(row -> ((Number) row[0]).longValue())
                        .collect(java.util.stream.Collectors.toSet());

        Map<Long, String> states = new java.util.HashMap<>();
        for (CompetitionParticipant cp : participants) {
            Competition competition = cp.getCompetition();
            String state = "NOT_REQUIRED";
            if (competition.getPaymentMode() == PaymentMode.MANUAL) {
                state = paidParticipantIds.contains(cp.getId()) ? "PAID" : "AWAITING_PAYMENT";
            } else if (competition.getPaymentMode() == PaymentMode.STRIPE) {
                if (paidParticipantIds.contains(cp.getId())) {
                    state = "PAID";
                } else if (!participantScopedStripeCompetitions.contains(competition.getId())
                        && legacySucceededStripeCompetitionIds.contains(competition.getId())) {
                    // Backwards compatibility for legacy Stripe payments that predate participant-scoped linkage.
                    state = "PAID";
                } else {
                    state = "AWAITING_PAYMENT";
                }
            }
            states.put(cp.getId(), state);
        }

        return states;
    }

    private String paymentStateForParticipant(CompetitionParticipant participant) {
        Competition competition = participant.getCompetition();
        if (competition.getPaymentMode() == null || competition.getPaymentMode() == PaymentMode.FREE) {
            return "NOT_REQUIRED";
        }
        boolean participantPaid = paymentRepository.existsByParticipantIdAndCompetitionIdAndStatus(
                participant.getId(), competition.getId(), Payment.PaymentStatus.SUCCEEDED);
        if (participantPaid) {
            return "PAID";
        }
        if (competition.getPaymentMode() == PaymentMode.STRIPE
                && !paymentRepository.existsByUserIdAndCompetitionIdAndParticipantIsNotNull(
                participant.getUser().getId(), competition.getId())
                && paymentRepository.existsByUserIdAndCompetitionIdAndStatus(
                participant.getUser().getId(), competition.getId(), Payment.PaymentStatus.SUCCEEDED)) {
            // Backwards compatibility for legacy Stripe payments that predate participant-scoped linkage.
            return "PAID";
        }
        return "AWAITING_PAYMENT";
    }

    private String derivePaymentState(Competition competition, List<Payment.PaymentStatus> statuses) {
        if (competition.getPaymentMode() == null || competition.getPaymentMode() == PaymentMode.FREE) {
            return "NOT_REQUIRED";
        }
        if (statuses != null && statuses.stream().anyMatch(status -> status == Payment.PaymentStatus.SUCCEEDED)) {
            return "PAID";
        }
        return "AWAITING_PAYMENT";
    }

    @GetMapping("/{id}/participants")
    public List<ParticipantResponse> getParticipants(@PathVariable Long id) {
        return competitionService.getParticipants(id).stream()
                .map(ParticipantResponse::from)
                .toList();
    }

    @GetMapping("/{id}/my-entries")
    public List<ParticipantResponse> getMyEntries(@PathVariable Long id,
                                                  @AuthenticationPrincipal UserDetailsImpl userDetails) {
        List<CompetitionParticipant> entries = competitionService.getMyEntries(id, userDetails.getId());
        Map<Long, String> paymentStates = paymentStatesForUser(userDetails.getId(), entries);
        return entries.stream()
                .map(cp -> ParticipantResponse.from(cp, paymentStates.getOrDefault(cp.getId(), "NOT_REQUIRED")))
                .toList();
    }

    // ── Gameweeks & Fixtures ────────────────────────────────────────────

    @GetMapping("/{id}/gameweeks/current")
    public GameweekResponse getCurrentGameweek(@PathVariable Long id) {
        Gameweek gw = gameweekRepository.findCurrentGameweek(id)
                .orElse(null);
        return gw != null ? GameweekResponse.from(gw) : null;
    }

    @GetMapping("/{id}/fixtures")
    public List<FixtureResponse> getFixtures(@PathVariable Long id,
                                             @RequestParam(defaultValue = "99") int weeks) {
        List<Gameweek> gameweeks = gameweekRepository.findByCompetitionIdOrderByWeekNumberAsc(id);

        if (weeks < gameweeks.size()) {
            gameweeks = gameweeks.subList(0, weeks);
        }

        List<Long> gwIds = gameweeks.stream().map(Gameweek::getId).toList();
        List<Fixture> fixtures = fixtureRepository.findByGameweekIdInFetchAll(gwIds);

        // Deduplicate: if the same two teams appear more than once in a gameweek
        // (can happen when multiple syncs create duplicate entries), keep only the
        // most recently synced one (highest id).
        return fixtures.stream()
                .collect(Collectors.groupingBy(
                        f -> f.getGameweek().getId() + "-" +
                             Math.min(f.getEffectiveHomeTeam().getId(), f.getEffectiveAwayTeam().getId()) + "-" +
                             Math.max(f.getEffectiveHomeTeam().getId(), f.getEffectiveAwayTeam().getId()),
                        Collectors.maxBy(Comparator.comparingLong(Fixture::getId))
                ))
                .values().stream()
                .filter(java.util.Optional::isPresent)
                .map(java.util.Optional::get)
                .sorted(Comparator.comparingInt((Fixture f) -> f.getGameweek().getWeekNumber())
                        .thenComparing(f -> f.getEffectiveKickoffAt()))
                .map(FixtureResponse::from)
                .toList();
    }

    @GetMapping("/{id}/gameweeks/{gwId}/fixtures")
    public List<FixtureResponse> getFixturesForGameweek(@PathVariable Long id, @PathVariable Long gwId) {
        Gameweek gw = gameweekRepository.findById(gwId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Gameweek not found"));
        if (!gw.getCompetition().getId().equals(id)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gameweek does not belong to this competition");
        }

        return fixtureRepository.findByGameweekIdFetchAll(gwId).stream()
                .collect(Collectors.groupingBy(
                        f -> Math.min(f.getEffectiveHomeTeam().getId(), f.getEffectiveAwayTeam().getId()) + "-" +
                             Math.max(f.getEffectiveHomeTeam().getId(), f.getEffectiveAwayTeam().getId()),
                        Collectors.maxBy(Comparator.comparingLong(Fixture::getId))
                ))
                .values().stream()
                .filter(java.util.Optional::isPresent)
                .map(java.util.Optional::get)
                .sorted(Comparator.comparing(Fixture::getEffectiveKickoffAt))
                .map(FixtureResponse::from)
                .toList();
    }

    // ── Picks ───────────────────────────────────────────────────────────

    @PostMapping("/{id}/gameweeks/{gwId}/pick")
    public ResponseEntity<PickResponse> makePick(@PathVariable Long id,
                                                 @PathVariable Long gwId,
                                                 @RequestBody PickRequest request,
                                                 @AuthenticationPrincipal UserDetailsImpl userDetails) {
        CompetitionParticipant participant;
        if (request.entryId() != null) {
            participant = participantRepository.findByIdAndCompetitionIdAndUserId(request.entryId(), id, userDetails.getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Entry not found"));
        } else {
            participant = participantRepository.findByCompetitionIdAndUserIdOrderByEntryNumberAsc(id, userDetails.getId()).stream()
                    .findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Not joined in this competition"));
        }
        String paymentState = paymentStateForParticipant(participant);
        if ("AWAITING_PAYMENT".equals(paymentState)
                && participant.getCompetition().getPaymentMode() == PaymentMode.MANUAL
                && participant.getCompetition().getManualPaymentPolicy() == ManualPaymentPolicy.STRICT) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Your entry is awaiting payment confirmation. Picks are disabled until payment is confirmed."
            );
        }
        Pick pick = pickService.makePick(id, gwId, request.teamId(), userDetails.getId(), request.entryId(), request.useLifeline());
        return ResponseEntity.ok(PickResponse.from(pick));
    }

    @GetMapping("/{id}/gameweeks/{gwId}/my-pick")
    public PickResponse getMyPick(@PathVariable Long id,
                                  @PathVariable Long gwId,
                                  @RequestParam(required = false) Long entryId,
                                  @AuthenticationPrincipal UserDetailsImpl userDetails) {
        return pickService.getMyPick(id, gwId, userDetails.getId(), entryId)
                .map(PickResponse::from)
                .orElse(null);
    }

    @GetMapping("/{id}/picks/history")
    public List<PickHistoryItem> getPickHistory(@PathVariable Long id,
                                                @RequestParam(required = false) Long entryId,
                                                @AuthenticationPrincipal UserDetailsImpl userDetails) {
        List<Pick> picks = pickService.getPickHistory(id, userDetails.getId(), entryId);
        List<Long> pickIds = picks.stream().map(Pick::getId).toList();
        Map<Long, PickResult> resultMap = pickResultRepository.findByPickIdIn(pickIds).stream()
                .collect(Collectors.toMap(pr -> pr.getPick().getId(), pr -> pr));

        return picks.stream().map(p -> {
            PickResult pr = resultMap.get(p.getId());
            return new PickHistoryItem(
                    p.getId(), p.getGameweek().getId(), p.getGameweek().getWeekNumber(),
                    p.getTeam().getId(), p.getTeam().getName(), p.getTeam().getShortName(),
                    p.getSource().name(), p.isLocked(), p.isUseLifeline(), p.getPickedAt(),
                    pr != null ? pr.getOutcome().name() : "PENDING",
                    pr != null ? pr.getResolvedAt() : null
            );
        }).toList();
    }

    // ── Reveal ──────────────────────────────────────────────────────────

    @GetMapping("/{id}/gameweeks/{gwId}/selections")
    public GameweekSelectionsData getSelections(@PathVariable Long id, @PathVariable Long gwId) {
        Gameweek gw = gameweekRepository.findById(gwId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Gameweek not found"));

        // Fetch only fields required by the UI in one query (avoid entity hydration + join fan-out).
        List<Object[]> rows = pickService.getGameweekSelectionRows(id, gwId);

        // For IN_PROGRESS gameweeks, compute a live outcome from fixture results
        Map<Long, String> liveOutcomeByTeam = new java.util.HashMap<>();
        if (gw.getStatus() == GameweekStatus.IN_PROGRESS) {
            List<Fixture> fixtures = fixtureRepository.findByGameweekId(gwId);
            for (Fixture f : fixtures) {
                if (f.getEffectiveStatus() == FixtureStatus.FINISHED) {
                    Integer sh = f.getEffectiveScoreHome();
                    Integer sa = f.getEffectiveScoreAway();
                    if (sh == null || sa == null) continue;
                    Long homeId = f.getEffectiveHomeTeam().getId();
                    Long awayId = f.getEffectiveAwayTeam().getId();
                    if (sh > sa) {
                        liveOutcomeByTeam.put(homeId, "ADVANCE");
                        liveOutcomeByTeam.put(awayId, "ELIMINATED");
                    } else if (sa > sh) {
                        liveOutcomeByTeam.put(awayId, "ADVANCE");
                        liveOutcomeByTeam.put(homeId, "ELIMINATED");
                    } else {
                        liveOutcomeByTeam.put(homeId, "ELIMINATED");
                        liveOutcomeByTeam.put(awayId, "ELIMINATED");
                    }
                } else if (f.getEffectiveStatus() == FixtureStatus.POSTPONED
                        || f.getEffectiveStatus() == FixtureStatus.CANCELLED) {
                    liveOutcomeByTeam.put(f.getEffectiveHomeTeam().getId(), "POSTPONED_ADVANCE");
                    liveOutcomeByTeam.put(f.getEffectiveAwayTeam().getId(), "POSTPONED_ADVANCE");
                }
            }
        }

        List<GameweekSelectionResponse> selections = rows.stream().map(row -> {
            Long participantId = (Long) row[0];
            Long userId = (Long) row[1];
            String username = (String) row[2];
            Integer entryNumber = (Integer) row[3];
            Boolean lifelineUsed = (Boolean) row[4];
            Integer lifelineUsedWeek = (Integer) row[5];
            Long teamId = (Long) row[6];
            String teamName = (String) row[7];
            String teamShortName = (String) row[8];
            PickSource source = (PickSource) row[9];
            Boolean useLifeline = (Boolean) row[10];
            PickOutcome storedOutcome = (PickOutcome) row[11];

            String outcome;
            if (storedOutcome != null && storedOutcome != PickOutcome.PENDING) {
                outcome = storedOutcome.name();
            } else if (!liveOutcomeByTeam.isEmpty()) {
                outcome = liveOutcomeByTeam.getOrDefault(teamId, "PENDING");
            } else {
                outcome = "PENDING";
            }
            return new GameweekSelectionResponse(
                    participantId,
                    userId,
                    username,
                    entryNumber != null ? entryNumber : 1,
                    Boolean.TRUE.equals(lifelineUsed),
                    lifelineUsedWeek,
                    teamId,
                    teamName,
                    teamShortName,
                    source != null ? source.name() : PickSource.USER.name(),
                    Boolean.TRUE.equals(useLifeline),
                    outcome
            );
        }).toList();

            int activeAtStart = (int) participantRepository.countActiveAtStartForWeek(id, gw.getWeekNumber());
            int eliminatedThisWeek = (int) participantRepository.countEliminatedInWeek(id, gw.getWeekNumber());
            int advancedThisWeek = Math.max(activeAtStart - eliminatedThisWeek, 0);

            return new GameweekSelectionsData(
                selections,
                gw.isByeGranted(),
                gw.getWeekNumber(),
                activeAtStart,
                advancedThisWeek,
                eliminatedThisWeek
            );
    }

    // ── Survivor Table ───────────────────────────────────────────────────

    @GetMapping("/{id}/survivor-table")
    public SurvivorTableResponse getSurvivorTable(@PathVariable Long id) {
        List<Gameweek> gameweeks = gameweekRepository.findByCompetitionIdOrderByWeekNumberAsc(id);
        List<Object[]> participantRows = participantRepository.findSurvivorParticipantRowsByCompetitionId(id);
        List<Object[]> pickRows = pickRepository.findSurvivorPickRowsByCompetitionId(id);
        Map<Long, Map<Long, String>> liveOutcomeByGameweekAndTeam = buildLiveOutcomeByGameweek(gameweeks);

        // participantId -> weekNumber -> [teamShortName, outcome, source, useLifeline]
        Map<Long, Map<Integer, Object[]>> picksByParticipantAndWeek = new java.util.HashMap<>();
        for (Object[] row : pickRows) {
            Long participantId = (Long) row[0];
            Long gameweekId = (Long) row[1];
            Integer weekNumber = (Integer) row[2];
            Long teamId = (Long) row[3];
            String teamShortName = (String) row[4];
            PickSource source = (PickSource) row[5];
            Boolean useLifeline = (Boolean) row[6];
            PickOutcome storedOutcome = (PickOutcome) row[7];
            String outcome = storedOutcome != null ? storedOutcome.name() : "PENDING";
            if ("PENDING".equals(outcome)) {
                Map<Long, String> liveOutcomeByTeam = liveOutcomeByGameweekAndTeam.get(gameweekId);
                if (liveOutcomeByTeam != null) {
                    outcome = liveOutcomeByTeam.getOrDefault(teamId, "PENDING");
                }
            }
            picksByParticipantAndWeek
                .computeIfAbsent(participantId, ignored -> new java.util.HashMap<>())
                .put(weekNumber, new Object[]{teamShortName, outcome, source != null ? source.name() : PickSource.USER.name(), Boolean.TRUE.equals(useLifeline)});
        }

        List<SurvivorGameweekMeta> gwMetas = gameweeks.stream()
                .map(gw -> new SurvivorGameweekMeta(gw.getId(), gw.getWeekNumber(), gw.getStatus().name()))
                .toList();

        List<SurvivorRow> rows = participantRows.stream().map(cp -> {
            Long participantId = (Long) cp[0];
            Long userId = (Long) cp[1];
            String username = (String) cp[2];
            Integer entryNumber = (Integer) cp[3];
            ParticipantStatus status = (ParticipantStatus) cp[4];
            Integer eliminatedWeek = (Integer) cp[5];
            boolean lifelineUsed = Boolean.TRUE.equals(cp[6]);
            Integer lifelineUsedWeek = (Integer) cp[7];
            Map<Integer, SurvivorPickCell> cells = new java.util.HashMap<>();
            Map<Integer, Object[]> userPicks = picksByParticipantAndWeek.getOrDefault(participantId, Map.of());

            for (Gameweek gw : gameweeks) {
                Object[] pick = userPicks.get(gw.getWeekNumber());
                if (pick != null) {
                    cells.put(gw.getWeekNumber(), new SurvivorPickCell(
                            (String) pick[0],
                            (String) pick[1],
                            (String) pick[2],
                            (Boolean) pick[3]
                    ));
                }
            }
            return new SurvivorRow(
                    participantId,
                    userId,
                    username,
                    entryNumber,
                    status.name(),
                    eliminatedWeek,
                    lifelineUsed,
                    lifelineUsedWeek,
                    cells
            );
        }).toList();

        return new SurvivorTableResponse(gwMetas, rows);
    }

    private Map<Long, Map<Long, String>> buildLiveOutcomeByGameweek(List<Gameweek> gameweeks) {
        Map<Long, Map<Long, String>> outcomeByGameweek = new HashMap<>();
        if (gameweeks.isEmpty()) return outcomeByGameweek;

        Map<Long, GameweekStatus> statusByGameweekId = gameweeks.stream()
                .collect(Collectors.toMap(Gameweek::getId, Gameweek::getStatus));
        List<Long> gameweekIds = gameweeks.stream().map(Gameweek::getId).toList();
        List<Fixture> fixtures = fixtureRepository.findByGameweekIdIn(gameweekIds);

        for (Fixture f : fixtures) {
            Long gameweekId = f.getGameweek().getId();
            if (statusByGameweekId.get(gameweekId) != GameweekStatus.IN_PROGRESS) {
                continue;
            }

            Map<Long, String> liveOutcomeByTeam = outcomeByGameweek.computeIfAbsent(gameweekId, ignored -> new HashMap<>());
            FixtureStatus status = f.getEffectiveStatus();
            if (status == FixtureStatus.FINISHED) {
                Integer sh = f.getEffectiveScoreHome();
                Integer sa = f.getEffectiveScoreAway();
                if (sh == null || sa == null) continue;
                Long homeId = f.getEffectiveHomeTeam().getId();
                Long awayId = f.getEffectiveAwayTeam().getId();
                if (sh > sa) {
                    liveOutcomeByTeam.put(homeId, "ADVANCE");
                    liveOutcomeByTeam.put(awayId, "ELIMINATED");
                } else if (sa > sh) {
                    liveOutcomeByTeam.put(awayId, "ADVANCE");
                    liveOutcomeByTeam.put(homeId, "ELIMINATED");
                } else {
                    liveOutcomeByTeam.put(homeId, "ELIMINATED");
                    liveOutcomeByTeam.put(awayId, "ELIMINATED");
                }
            } else if (status == FixtureStatus.POSTPONED || status == FixtureStatus.CANCELLED) {
                liveOutcomeByTeam.put(f.getEffectiveHomeTeam().getId(), "POSTPONED_ADVANCE");
                liveOutcomeByTeam.put(f.getEffectiveAwayTeam().getId(), "POSTPONED_ADVANCE");
            }
        }

        outcomeByGameweek.entrySet().removeIf(entry -> entry.getValue().isEmpty());
        return outcomeByGameweek;
    }

    // ── Pick Stats (post-lock: show % of players who picked each team) ──

    public record PickStatDto(Long teamId, String teamName, String teamShortName, int pickCount, int totalPicks, double percentage) {}

    @GetMapping("/{compId}/gameweeks/{gwId}/pick-stats")
    public List<PickStatDto> getPickStats(@PathVariable Long compId, @PathVariable Long gwId) {
        Gameweek gw = gameweekRepository.findById(gwId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Gameweek not found"));
        // Only reveal stats once the gameweek is locked (picks are finalised)
        if (gw.getStatus() == GameweekStatus.UPCOMING) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Pick stats not available until gameweek locks");
        }
        List<Object[]> rows = pickRepository.countPicksPerTeam(compId, gwId);
        int total = rows.stream().mapToInt(r -> ((Number) r[3]).intValue()).sum();
        return rows.stream().map(r -> new PickStatDto(
                (Long) r[0],
                (String) r[1],
                (String) r[2],
                ((Number) r[3]).intValue(),
                total,
                total == 0 ? 0 : Math.round(((Number) r[3]).doubleValue() / total * 1000.0) / 10.0
        )).sorted(Comparator.comparingInt(PickStatDto::pickCount).reversed()).toList();
    }

    // ── Teams ───────────────────────────────────────────────────────────

    @GetMapping("/teams")
    public List<TeamResponse> getAllTeams() {
        return teamRepository.findAllByOrderByNameAsc().stream()
                .map(TeamResponse::from)
                .toList();
    }

    // ── Clubs ───────────────────────────────────────────────────────────

    @GetMapping("/clubs")
    public List<ClubResponse> getClubs() {
        return clubRepository.findAllByOrderByNameAsc().stream()
                .map(ClubResponse::from)
                .toList();
    }
}
