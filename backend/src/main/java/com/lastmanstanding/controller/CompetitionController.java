package com.lastmanstanding.controller;

import com.lastmanstanding.config.CacheConfig;
import com.lastmanstanding.dto.CompetitionDtos.*;
import com.lastmanstanding.entity.*;
import com.lastmanstanding.repository.*;
import com.lastmanstanding.security.UserDetailsImpl;
import com.lastmanstanding.service.CompetitionService;
import com.lastmanstanding.service.PickService;
import com.lastmanstanding.service.CompetitionCacheService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import jakarta.servlet.http.HttpServletRequest;

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
    private final CacheManager cacheManager;
    private final CompetitionCacheService competitionCacheService;
    private final ObjectMapper objectMapper;

    @Autowired
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
                                 PaymentRepository paymentRepository,
                                 CacheManager cacheManager,
                                 CompetitionCacheService competitionCacheService,
                                 ObjectMapper objectMapper) {
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
        this.cacheManager = cacheManager;
        this.competitionCacheService = competitionCacheService;
        this.objectMapper = objectMapper;
    }

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
        this(competitionService, pickService, competitionRepository, gameweekRepository, fixtureRepository,
                pickRepository, pickResultRepository, participantRepository, teamRepository, clubRepository,
                paymentRepository, new ConcurrentMapCacheManager(
                        CacheConfig.SURVIVOR_TABLE_CACHE, CacheConfig.GAMEWEEK_SELECTIONS_CACHE,
                        CacheConfig.PICK_STATS_CACHE, CacheConfig.FIXTURES_CACHE),
                new CompetitionCacheService(new ConcurrentMapCacheManager(
                        CacheConfig.SURVIVOR_TABLE_CACHE, CacheConfig.GAMEWEEK_SELECTIONS_CACHE,
                        CacheConfig.PICK_STATS_CACHE, CacheConfig.FIXTURES_CACHE)),
                new ObjectMapper());
    }

    // ── Competitions ────────────────────────────────────────────────────

    @GetMapping("/upcoming")
    public List<CompetitionResponse> getUpcoming(@RequestParam(required = false) Long clubId) {
        List<Competition> comps = competitionService.getUpcomingCompetitions(clubId);
        if (comps.isEmpty()) return List.of();

        // Batch load counts — avoids N+1
        Map<Long, long[]> countsByCompId = new java.util.HashMap<>();
        participantRepository.countParticipantsGroupedByCompetition().forEach(row -> {
            long cId    = ((Number) row[0]).longValue();
            long total  = ((Number) row[1]).longValue();
            long active = row[2] != null ? ((Number) row[2]).longValue() : 0L;
            countsByCompId.put(cId, new long[]{total, active});
        });

        Map<Long, String> winnerByCompId = new java.util.HashMap<>();
        participantRepository.findByStatus(ParticipantStatus.WINNER)
                .forEach(cp -> winnerByCompId.put(cp.getCompetition().getId(), cp.getUser().getUsername()));

        return comps.stream().map(c -> {
            long[] counts = countsByCompId.getOrDefault(c.getId(), new long[]{0, 0});
            return CompetitionResponse.from(c, (int) counts[0], (int) counts[1],
                    winnerByCompId.get(c.getId()), firstGameweekDate(c.getId()));
        }).toList();
    }

    @GetMapping("/code/{joinCode}")
    public CompetitionResponse getCompetitionByJoinCode(@PathVariable String joinCode) {
        Competition c = competitionService.getCompetitionByJoinCode(joinCode);
        long[] cnt = batchParticipantCounts().getOrDefault(c.getId(), new long[]{0, 0});
        return CompetitionResponse.from(c, (int) cnt[0], (int) cnt[1],
                batchWinners().get(c.getId()), firstGameweekDate(c.getId()));
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

        Map<Long, long[]> counts = batchParticipantCounts();
        Map<Long, String> winners = batchWinners();
        return past.stream().map(c -> {
            long[] cnt = counts.getOrDefault(c.getId(), new long[]{0, 0});
            return CompetitionResponse.from(c, (int) cnt[0], 0, winners.get(c.getId()));
        }).toList();
    }

    @GetMapping("/my")
    public List<Long> getMyCompetitionIds(@AuthenticationPrincipal UserDetailsImpl userDetails) {
        return participantRepository.findByUserId(userDetails.getId()).stream()
                .map(cp -> cp.getCompetition().getId()).toList();
    }

    @GetMapping("/my/details")
    public List<MyCompetitionResponse> getMyCompetitions(@AuthenticationPrincipal UserDetailsImpl userDetails) {
        List<CompetitionParticipant> participants = participantRepository.findByUserIdOrderByJoinedAtDesc(userDetails.getId());
        if (participants.isEmpty()) return List.of();

        // Batch load only for competitions this user is in.
        List<Long> compIds = participants.stream()
                .map(cp -> cp.getCompetition().getId())
                .distinct()
                .toList();
        Map<Long, long[]> counts   = batchParticipantCounts(compIds);
        Map<Long, String> winners  = batchWinners(compIds);
        Map<Long, java.time.LocalDate> firstGwDates = batchFirstGameweekDates(compIds);
        Map<Long, String> paymentStates = paymentStatesForUser(userDetails.getId(), participants);
        Map<Long, Boolean> pickRequired = pickRequiredForParticipants(participants, paymentStates);

        return participants.stream().map(cp -> {
            Competition c = cp.getCompetition();
            long[] cnt = counts.getOrDefault(c.getId(), new long[]{0, 0});
            String paymentState = paymentStates.getOrDefault(c.getId(), "NOT_REQUIRED");
            return new MyCompetitionResponse(
                    CompetitionResponse.from(c, (int) cnt[0], (int) cnt[1],
                            winners.get(c.getId()), firstGwDates.get(c.getId())),
                    cp.getId(),
                    cp.getEntryNumber(),
                    cp.getStatus().name(), paymentState, pickRequired.getOrDefault(cp.getId(), false), cp.getEliminatedWeek(), cp.getJoinedAt()
            );
        }).toList();
    }

    @GetMapping("/{id}")
    public CompetitionResponse getCompetition(@PathVariable Long id) {
        Competition c = competitionService.getCompetition(id);
        long[] cnt = batchParticipantCounts().getOrDefault(c.getId(), new long[]{0, 0});
        return CompetitionResponse.from(c, (int) cnt[0], (int) cnt[1],
                batchWinners().get(c.getId()), firstGameweekDate(c.getId()));
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
        competitionCacheService.evictCompetition(id);
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

        Map<Long, String> states = new java.util.HashMap<>();
        List<Long> manualOrStripeCompIds = participants.stream()
                .map(CompetitionParticipant::getCompetition)
                .filter(c -> c.getPaymentMode() != null && c.getPaymentMode() != PaymentMode.FREE)
                .map(Competition::getId)
                .distinct()
                .toList();

        if (!manualOrStripeCompIds.isEmpty()) {
            Map<Long, List<Payment.PaymentStatus>> statusesByComp = new java.util.HashMap<>();
            paymentRepository.findStatusesByUserAndCompetitionIds(userId, manualOrStripeCompIds).forEach(row -> {
                Long compId = ((Number) row[0]).longValue();
                Payment.PaymentStatus status = (Payment.PaymentStatus) row[1];
                statusesByComp.computeIfAbsent(compId, ignored -> new java.util.ArrayList<>()).add(status);
            });

            for (CompetitionParticipant cp : participants) {
                states.put(cp.getCompetition().getId(), derivePaymentState(cp.getCompetition(), statusesByComp.get(cp.getCompetition().getId())));
            }
        }

        for (CompetitionParticipant cp : participants) {
            states.putIfAbsent(cp.getCompetition().getId(), derivePaymentState(cp.getCompetition(), List.of()));
        }

        return states;
    }

    private String paymentStateForParticipant(CompetitionParticipant participant) {
        List<Payment.PaymentStatus> statuses = paymentRepository.findStatusesByUserAndCompetition(
                participant.getUser().getId(), participant.getCompetition().getId());
        return derivePaymentState(participant.getCompetition(), statuses);
    }

    private Map<Long, Boolean> pickRequiredForParticipants(List<CompetitionParticipant> participants, Map<Long, String> paymentStates) {
        if (participants.isEmpty()) return Map.of();

        List<CompetitionParticipant> candidates = participants.stream()
                .filter(cp -> cp.getStatus() == ParticipantStatus.ACTIVE)
                .filter(cp -> cp.getCompetition().getStatus() != CompetitionStatus.COMPLETED)
                .filter(cp -> !"AWAITING_PAYMENT".equals(paymentStates.getOrDefault(cp.getCompetition().getId(), "NOT_REQUIRED")))
                .toList();
        if (candidates.isEmpty()) return Map.of();

        List<Long> competitionIds = candidates.stream()
                .map(cp -> cp.getCompetition().getId())
                .distinct()
                .toList();
        Map<Long, Gameweek> nextPickableByCompetition = new java.util.HashMap<>();
        gameweekRepository.findPickableGameweeksByCompetitionIds(competitionIds, java.time.LocalDateTime.now()).forEach(g ->
                nextPickableByCompetition.putIfAbsent(g.getCompetition().getId(), g));
        if (nextPickableByCompetition.isEmpty()) return Map.of();

        List<Long> participantIds = candidates.stream().map(CompetitionParticipant::getId).toList();
        List<Long> gameweekIds = nextPickableByCompetition.values().stream().map(Gameweek::getId).distinct().toList();
        java.util.Set<String> existingPicks = pickRepository.findParticipantGameweekPickPairs(participantIds, gameweekIds).stream()
                .map(row -> ((Number) row[0]).longValue() + ":" + ((Number) row[1]).longValue())
                .collect(java.util.stream.Collectors.toSet());

        Map<Long, Boolean> required = new java.util.HashMap<>();
        for (CompetitionParticipant cp : candidates) {
            Gameweek nextGameweek = nextPickableByCompetition.get(cp.getCompetition().getId());
            if (nextGameweek != null) {
                required.put(cp.getId(), !existingPicks.contains(cp.getId() + ":" + nextGameweek.getId()));
            }
        }
        return required;
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
        return competitionService.getMyEntries(id, userDetails.getId()).stream()
                .map(cp -> ParticipantResponse.from(cp, paymentStateForParticipant(cp)))
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

        boolean hasInProgress = gameweeks.stream().anyMatch(gw -> gw.getStatus() == GameweekStatus.IN_PROGRESS);
        String key = id + ":all:" + weeks;
        if (!hasInProgress) {
            Cache cache = cacheManager.getCache(CacheConfig.FIXTURES_CACHE);
            if (cache != null) {
                @SuppressWarnings("unchecked")
                List<FixtureResponse> cached = cache.get(key, List.class);
                if (cached != null) return cached;
            }
        }

        List<FixtureResponse> response = buildFixtureResponses(gameweeks);
        if (!hasInProgress) {
            Cache cache = cacheManager.getCache(CacheConfig.FIXTURES_CACHE);
            if (cache != null) cache.put(key, response);
        }
        return response;
    }

    private List<FixtureResponse> buildFixtureResponses(List<Gameweek> gameweeks) {
        List<Long> gwIds = gameweeks.stream().map(Gameweek::getId).toList();
        if (gwIds.isEmpty()) return List.of();
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

        String key = id + ":gw:" + gwId;
        if (gw.getStatus() != GameweekStatus.IN_PROGRESS) {
            Cache cache = cacheManager.getCache(CacheConfig.FIXTURES_CACHE);
            if (cache != null) {
                @SuppressWarnings("unchecked")
                List<FixtureResponse> cached = cache.get(key, List.class);
                if (cached != null) return cached;
            }
        }

        List<FixtureResponse> response = fixtureRepository.findByGameweekIdFetchAll(gwId).stream()
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
        if (gw.getStatus() != GameweekStatus.IN_PROGRESS) {
            Cache cache = cacheManager.getCache(CacheConfig.FIXTURES_CACHE);
            if (cache != null) cache.put(key, response);
        }
        return response;
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
        competitionCacheService.evictCompetition(id);
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
        if (gw.getStatus() == GameweekStatus.IN_PROGRESS) {
            return buildSelectionsData(id, gwId, gw);
        }
        String key = id + ":" + gwId;
        Cache cache = cacheManager.getCache(CacheConfig.GAMEWEEK_SELECTIONS_CACHE);
        if (cache != null) {
            GameweekSelectionsData cached = cache.get(key, GameweekSelectionsData.class);
            if (cached != null) {
                return cached;
            }
        }
        GameweekSelectionsData data = buildSelectionsData(id, gwId, gw);
        if (cache != null) {
            cache.put(key, data);
        }
        return data;
    }

    private boolean isGameweekRevealed(Gameweek gw) {
        return gw != null && gw.getStatus() != GameweekStatus.UPCOMING;
    }

    private GameweekSelectionsData buildSelectionsData(Long id, Long gwId, Gameweek gw) {
        if (!isGameweekRevealed(gw)) {
            int activeAtStart = (int) participantRepository.countActiveAtStartForWeek(id, gw.getWeekNumber());
            int eliminatedThisWeek = (int) participantRepository.countEliminatedInWeek(id, gw.getWeekNumber());
            int advancedThisWeek = Math.max(activeAtStart - eliminatedThisWeek, 0);
            return new GameweekSelectionsData(
                    List.of(),
                    gw.isByeGranted(),
                    gw.getWeekNumber(),
                    activeAtStart,
                    advancedThisWeek,
                    eliminatedThisWeek
            );
        }

        // Fetch picks with user+team eagerly to avoid N+1 (200 users = 400 lazy queries otherwise)
        List<Pick> picks = pickService.getGameweekSelectionsFetch(id, gwId);

        // Load all results for this gameweek in one query (not per pick-id list)
        Map<Long, PickResult> resultMap = pickResultRepository.findByCompetitionIdAndGameweekId(id, gwId)
                .stream().collect(Collectors.toMap(pr -> pr.getPick().getId(), pr -> pr));

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

        List<GameweekSelectionResponse> selections = picks.stream().map(p -> {
            PickResult pr = resultMap.get(p.getId());
            String outcome;
            if (pr != null && pr.getOutcome() != PickOutcome.PENDING) {
                outcome = pr.getOutcome().name();
            } else if (!liveOutcomeByTeam.isEmpty()) {
                outcome = liveOutcomeByTeam.getOrDefault(p.getTeam().getId(), "PENDING");
            } else {
                outcome = "PENDING";
            }
            return new GameweekSelectionResponse(
                    p.getParticipant() != null ? p.getParticipant().getId() : null,
                    p.getUser().getId(), p.getUser().getUsername(),
                    p.getParticipant() != null ? p.getParticipant().getEntryNumber() : 1,
                    p.getParticipant() != null && p.getParticipant().isLifelineUsed(),
                    p.getParticipant() != null ? p.getParticipant().getLifelineUsedWeek() : null,
                    p.getTeam().getId(), p.getTeam().getName(), p.getTeam().getShortName(),
                    p.getSource().name(), p.isUseLifeline(), outcome
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
    public ResponseEntity<SurvivorTableResponse> getSurvivorTable(@PathVariable Long id, HttpServletRequest request) {
        List<Gameweek> gameweeks = gameweekRepository.findByCompetitionIdOrderByWeekNumberAsc(id);
        boolean hasInProgress = gameweeks.stream().anyMatch(gw -> gw.getStatus() == GameweekStatus.IN_PROGRESS);
        if (!hasInProgress) {
            Cache cache = cacheManager.getCache(CacheConfig.SURVIVOR_TABLE_CACHE);
            String key = id.toString();
            if (cache != null) {
                CachedSurvivorTable cached = cache.get(key, CachedSurvivorTable.class);
                if (cached != null) {
                    if (etagMatches(request, cached.etag())) {
                        return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(cached.etag()).build();
                    }
                    return ResponseEntity.ok().eTag(cached.etag()).body(cached.response());
                }
            }
            SurvivorTableResponse response = buildSurvivorTable(id, gameweeks);
            String etag = buildEtag(response);
            if (cache != null) {
                cache.put(key, new CachedSurvivorTable(response, etag));
            }
            if (etagMatches(request, etag)) {
                return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).build();
            }
            return ResponseEntity.ok().eTag(etag).body(response);
        }
        SurvivorTableResponse response = buildSurvivorTable(id, gameweeks);
        String etag = buildEtag(response);
        if (etagMatches(request, etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).build();
        }
        return ResponseEntity.ok().eTag(etag).body(response);
    }

    private SurvivorTableResponse buildSurvivorTable(Long id, List<Gameweek> gameweeks) {
        List<CompetitionParticipant> participants = participantRepository.findByCompetitionId(id);
        List<Pick> allPicks = pickRepository.findByCompetitionIdFetchForSurvivor(id);
        List<Long> pickIds = allPicks.stream().map(Pick::getId).toList();
        Map<Long, PickResult> resultMap = pickIds.isEmpty()
                ? Map.of()
                : pickResultRepository.findByPickIdIn(pickIds).stream()
                        .collect(Collectors.toMap(pr -> pr.getPick().getId(), pr -> pr));
        Map<Long, Map<Long, String>> liveOutcomeByGameweekAndTeam = buildLiveOutcomeByGameweek(gameweeks);

        // participantId -> weekNumber -> Pick
        Map<Long, Map<Integer, Pick>> picksByParticipantAndWeek = new java.util.HashMap<>();
        for (Pick p : allPicks) {
            if (p.getParticipant() == null) continue;
            picksByParticipantAndWeek
                .computeIfAbsent(p.getParticipant().getId(), k -> new java.util.HashMap<>())
                .put(p.getGameweek().getWeekNumber(), p);
        }

        List<SurvivorGameweekMeta> gwMetas = gameweeks.stream()
                .map(gw -> new SurvivorGameweekMeta(gw.getId(), gw.getWeekNumber(), gw.getStatus().name()))
                .toList();

        List<SurvivorRow> rows = participants.stream().map(cp -> {
            Map<Integer, SurvivorPickCell> cells = new java.util.HashMap<>();
            Map<Integer, Pick> userPicks = picksByParticipantAndWeek.getOrDefault(cp.getId(), Map.of());

            for (Gameweek gw : gameweeks) {
                Pick pick = userPicks.get(gw.getWeekNumber());
                if (pick != null && isGameweekRevealed(gw)) {
                    PickResult pr = resultMap.get(pick.getId());
                    String outcome = pr != null ? pr.getOutcome().name() : "PENDING";
                    if ("PENDING".equals(outcome)) {
                        Map<Long, String> liveOutcomeByTeam = liveOutcomeByGameweekAndTeam.get(gw.getId());
                        if (liveOutcomeByTeam != null) {
                            outcome = liveOutcomeByTeam.getOrDefault(pick.getTeam().getId(), "PENDING");
                        }
                    }
                    cells.put(gw.getWeekNumber(), new SurvivorPickCell(
                            pick.getTeam().getShortName(),
                            outcome,
                            pick.getSource().name(),
                            pick.isUseLifeline()
                    ));
                }
            }
            return new SurvivorRow(
                    cp.getId(),
                    cp.getUser().getId(),
                    cp.getUser().getUsername(),
                    cp.getEntryNumber(),
                    cp.getStatus().name(),
                    cp.getEliminatedWeek(),
                    cp.isLifelineUsed(),
                    cp.getLifelineUsedWeek(),
                    cells
            );
        }).toList();

        return new SurvivorTableResponse(gwMetas, rows);
    }

    private String buildEtag(Object value) {
        try {
            byte[] json = objectMapper.writeValueAsBytes(value);
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(json);
            StringBuilder sb = new StringBuilder("\"");
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            sb.append("\"");
            return sb.toString();
        } catch (JsonProcessingException | NoSuchAlgorithmException e) {
            // Fallback to a deterministic string hash representation
            return "\"" + Integer.toHexString(String.valueOf(value).getBytes(StandardCharsets.UTF_8).length) + "\"";
        }
    }

    private boolean etagMatches(HttpServletRequest request, String currentEtag) {
        String inm = request.getHeader("If-None-Match");
        return inm != null && inm.equals(currentEtag);
    }

    private record CachedSurvivorTable(SurvivorTableResponse response, String etag) {}

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
        if (gw.getStatus() != GameweekStatus.IN_PROGRESS) {
            String key = compId + ":" + gwId;
            Cache cache = cacheManager.getCache(CacheConfig.PICK_STATS_CACHE);
            if (cache != null) {
                @SuppressWarnings("unchecked")
                List<PickStatDto> cached = cache.get(key, List.class);
                if (cached != null) {
                    return cached;
                }
            }
            List<PickStatDto> computed = buildPickStats(compId, gwId);
            if (cache != null) {
                cache.put(key, computed);
            }
            return computed;
        }
        return buildPickStats(compId, gwId);
    }

    private List<PickStatDto> buildPickStats(Long compId, Long gwId) {
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
