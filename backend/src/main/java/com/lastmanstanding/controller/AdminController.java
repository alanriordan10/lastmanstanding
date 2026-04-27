package com.lastmanstanding.controller;

import com.lastmanstanding.dto.CompetitionDtos.*;
import com.lastmanstanding.entity.*;
import com.lastmanstanding.repository.ClubRepository;
import com.lastmanstanding.repository.CompetitionParticipantRepository;
import com.lastmanstanding.repository.CompetitionRepository;
import com.lastmanstanding.repository.FixtureRepository;
import com.lastmanstanding.repository.GameweekRepository;
import com.lastmanstanding.repository.PickRepository;
import com.lastmanstanding.repository.PickResultRepository;
import com.lastmanstanding.provider.FootballDataProvider;
import com.lastmanstanding.security.UserDetailsImpl;
import com.lastmanstanding.service.AdminService;
import com.lastmanstanding.service.AdminService.FixtureOverrideRequest;
import com.lastmanstanding.service.CompetitionService;
import com.lastmanstanding.service.GameweekProcessingService;
import com.lastmanstanding.service.TestDataGenerator;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/admin")
public class AdminController {

    private static final Logger log = LoggerFactory.getLogger(AdminController.class);
    private final AdminService adminService;
    private final CompetitionService competitionService;
    private final ClubRepository clubRepository;
    private final com.lastmanstanding.repository.UserRepository userRepository;
    private final org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;
    private final GameweekProcessingService gameweekProcessingService;
    private final GameweekRepository gameweekRepository;
    private final FixtureRepository fixtureRepository;
    private final CompetitionParticipantRepository participantRepository;
    private final CompetitionRepository competitionRepository;
    private final PickRepository pickRepository;
    private final PickResultRepository pickResultRepository;
    private final TestDataGenerator testDataGenerator;
    private final com.lastmanstanding.service.FixtureSyncService fixtureSyncService;
    private final Optional<FootballDataProvider> footballDataProvider;

    public AdminController(AdminService adminService,
                           CompetitionService competitionService,
                           ClubRepository clubRepository,
                           com.lastmanstanding.repository.UserRepository userRepository,
                           org.springframework.security.crypto.password.PasswordEncoder passwordEncoder,
                           GameweekProcessingService gameweekProcessingService,
                           GameweekRepository gameweekRepository,
                           FixtureRepository fixtureRepository,
                           CompetitionParticipantRepository participantRepository,
                           CompetitionRepository competitionRepository,
                           PickRepository pickRepository,
                           PickResultRepository pickResultRepository,
                           TestDataGenerator testDataGenerator,
                           com.lastmanstanding.service.FixtureSyncService fixtureSyncService,
                           Optional<FootballDataProvider> footballDataProvider) {
        this.adminService = adminService;
        this.competitionService = competitionService;
        this.clubRepository = clubRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.gameweekProcessingService = gameweekProcessingService;
        this.gameweekRepository = gameweekRepository;
        this.fixtureRepository = fixtureRepository;
        this.participantRepository = participantRepository;
        this.competitionRepository = competitionRepository;
        this.pickRepository = pickRepository;
        this.pickResultRepository = pickResultRepository;
        this.testDataGenerator = testDataGenerator;
        this.fixtureSyncService = fixtureSyncService;
        this.footballDataProvider = footballDataProvider;
    }

    // ── Clubs ───────────────────────────────────────────────────────────

    @GetMapping("/clubs")
    public List<ClubResponse> getClubs() {
        return clubRepository.findAllByOrderByNameAsc().stream()
                .map(ClubResponse::from)
                .toList();
    }

    @PostMapping("/clubs")
    public ResponseEntity<ClubResponse> createClub(
            @RequestBody ClubRequest request,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        if (clubRepository.existsByName(request.name())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Club name already exists");
        }
        User superAdmin = userRepository.findById(userDetails.getId()).orElseThrow();
        Club club = new Club(request.name(), request.description(), superAdmin);

        if (request.clubAdminUserId() != null) {
            User clubAdmin = userRepository.findById(request.clubAdminUserId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club admin user not found"));
            club.setClubAdmin(clubAdmin);
            // Promote user to CLUB_ADMIN role if they're a regular user
            if (clubAdmin.getRole() == Role.USER) {
                clubAdmin.setRole(Role.CLUB_ADMIN);
                userRepository.save(clubAdmin);
            }
        }

        club = clubRepository.save(club);
        return ResponseEntity.status(HttpStatus.CREATED).body(ClubResponse.from(club));
    }

    @PutMapping("/clubs/{id}")
    public ClubResponse updateClub(@PathVariable Long id, @RequestBody ClubRequest request) {
        Club club = clubRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));
        if (request.name() != null) club.setName(request.name());
        if (request.description() != null) club.setDescription(request.description());

        if (request.clubAdminUserId() != null) {
            User clubAdmin = userRepository.findById(request.clubAdminUserId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club admin user not found"));
            // Demote old club admin back to USER if they're not admin of another club
            if (club.getClubAdmin() != null && !club.getClubAdmin().getId().equals(clubAdmin.getId())) {
                User oldAdmin = club.getClubAdmin();
                boolean isAdminElsewhere = clubRepository.findByClubAdminId(oldAdmin.getId()).stream()
                        .anyMatch(c -> !c.getId().equals(id));
                if (!isAdminElsewhere && oldAdmin.getRole() == Role.CLUB_ADMIN) {
                    oldAdmin.setRole(Role.USER);
                    userRepository.save(oldAdmin);
                }
            }
            club.setClubAdmin(clubAdmin);
            if (clubAdmin.getRole() == Role.USER) {
                clubAdmin.setRole(Role.CLUB_ADMIN);
                userRepository.save(clubAdmin);
            }
        }

        return ClubResponse.from(clubRepository.save(club));
    }

    @DeleteMapping("/clubs/{id}")
    public ResponseEntity<Void> deleteClub(@PathVariable Long id) {
        Club club = clubRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));
        // Demote club admin back to USER if not admin elsewhere
        if (club.getClubAdmin() != null) {
            User oldAdmin = club.getClubAdmin();
            boolean isAdminElsewhere = clubRepository.findByClubAdminId(oldAdmin.getId()).stream()
                    .anyMatch(c -> !c.getId().equals(id));
            if (!isAdminElsewhere && oldAdmin.getRole() == Role.CLUB_ADMIN) {
                oldAdmin.setRole(Role.USER);
                userRepository.save(oldAdmin);
            }
        }
        clubRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    public record ClubRequest(String name, String description, Long clubAdminUserId) {}

    // ── Competitions ────────────────────────────────────────────────────

    @GetMapping("/competitions")
    public List<CompetitionResponse> getAllCompetitions() {
        List<Competition> competitions = competitionService.getAllCompetitions();

        // Load all participant counts in ONE query — avoid N+1
        Map<Long, long[]> countsByCompId = new HashMap<>();
        participantRepository.countParticipantsGroupedByCompetition().forEach(row -> {
            long compId = ((Number) row[0]).longValue();
            long total  = ((Number) row[1]).longValue();
            long active = row[2] != null ? ((Number) row[2]).longValue() : 0L;
            countsByCompId.put(compId, new long[]{total, active});
        });

        // Load all winners in one pass
        Map<Long, String> winnerByCompId = new HashMap<>();
        participantRepository.findByStatus(ParticipantStatus.WINNER).forEach(cp ->
                winnerByCompId.put(cp.getCompetition().getId(), cp.getUser().getUsername()));

        return competitions.stream().map(c -> {
            long[] counts = countsByCompId.getOrDefault(c.getId(), new long[]{0, 0});
            String winner = winnerByCompId.get(c.getId());
            return CompetitionResponse.from(c, (int) counts[0], (int) counts[1], winner);
        }).toList();
    }

    @PostMapping("/competitions")
    public ResponseEntity<CompetitionResponse> createCompetition(
            @Valid @RequestBody CreateCompetitionRequest request,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Competition c = competitionService.createCompetition(
                request.name(), request.description(), request.entryFee(), request.prizePool(),
                request.missedPickMode(), request.postponedConsumesTeam(), request.passFeeToParticipant(),
                request.paymentMode(), request.visibility(), request.startDate(), userDetails.getId(), request.clubId());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(CompetitionResponse.from(c, 0, 0, null));
    }

    @PutMapping("/competitions/{id}")
    public CompetitionResponse updateCompetition(@PathVariable Long id,
                                                 @Valid @RequestBody UpdateCompetitionRequest request) {
        Competition c = competitionService.updateCompetition(id,
                request.name(), request.description(), request.entryFee(), request.prizePool(),
                request.missedPickMode(),
                request.postponedConsumesTeam() != null ? request.postponedConsumesTeam() : true,
                request.passFeeToParticipant(),
                request.paymentMode(), request.visibility(),
                request.startDate(), request.status(), request.clubId());
        String winner = getWinnerUsername(id);
        return CompetitionResponse.from(c, 0, 0, winner);
    }

    // Helper: Get winner username
    private String getWinnerUsername(Long competitionId) {
        List<CompetitionParticipant> winners = participantRepository
                .findByCompetitionIdAndStatus(competitionId, ParticipantStatus.WINNER);
        if (!winners.isEmpty()) {
            return winners.get(0).getUser().getUsername();
        }

        // Only show de-facto winner if competition is COMPLETED
        Competition comp = competitionRepository.findById(competitionId).orElse(null);
        if (comp != null && comp.getStatus() == CompetitionStatus.COMPLETED) {
            List<CompetitionParticipant> active = participantRepository
                    .findByCompetitionIdAndStatus(competitionId, ParticipantStatus.ACTIVE);
            if (active.size() == 1) {
                return active.get(0).getUser().getUsername();
            }
        }

        return null;
    }

    @DeleteMapping("/competitions/{id}")
    public ResponseEntity<Void> deleteCompetition(@PathVariable Long id) {
        competitionService.deleteCompetition(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/competitions/{id}/sync-fixtures")
    public ResponseEntity<java.util.Map<String, Object>> syncFixturesForCompetition(@PathVariable Long id) {
        Competition comp = competitionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));
        int count = fixtureSyncService.syncForCompetition(comp);
        return ResponseEntity.ok(java.util.Map.of(
                "competitionId", id,
                "competitionName", comp.getName(),
                "fixturesAdded", count,
                "message", count > 0
                        ? "Synced " + count + " new fixtures for \"" + comp.getName() + "\""
                        : "No new fixtures found — all fixtures are already up to date"
        ));
    }

    // ── Participants ────────────────────────────────────────────────────

    @GetMapping("/competitions/{id}/participants")
    public List<ParticipantResponse> getParticipants(@PathVariable Long id) {
        return competitionService.getParticipants(id).stream()
                .map(ParticipantResponse::from)
                .toList();
    }

    @DeleteMapping("/competitions/{compId}/participants/{userId}")
    public ResponseEntity<Void> removeParticipant(@PathVariable Long compId, @PathVariable Long userId) {
        competitionService.removeParticipant(compId, userId);
        return ResponseEntity.noContent().build();
    }

    // ── User search ─────────────────────────────────────────────────────

    public record UserSearchResult(Long id, String username, String email, String role) {}

    @GetMapping("/users/search")
    public List<UserSearchResult> searchUsers(@RequestParam String q) {
        if (q == null || q.trim().length() < 2) return List.of();
        return userRepository.searchByUsernameOrEmail(q.trim()).stream()
                .limit(10)
                .map(u -> new UserSearchResult(u.getId(), u.getUsername(), u.getEmail(), u.getRole().name()))
                .toList();
    }

    // ── Add participant (admin manually adds user or creates guest) ─────

    public record AddParticipantRequest(
            Long userId,          // existing user — set this OR the guest fields below
            String guestUsername, // create a guest account with this username
            String guestEmail     // optional email for the guest
    ) {}

    @PostMapping("/competitions/{compId}/add-participant")
    @Transactional
    public ResponseEntity<ParticipantResponse> addParticipant(
            @PathVariable Long compId,
            @RequestBody AddParticipantRequest request,
            @AuthenticationPrincipal UserDetailsImpl admin) {

        Competition comp = competitionRepository.findById(compId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));

        User user;

        if (request.userId() != null) {
            // Add existing user
            user = userRepository.findById(request.userId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        } else if (request.guestUsername() != null && !request.guestUsername().isBlank()) {
            // Create a guest account
            String username = request.guestUsername().trim();
            String email = (request.guestEmail() != null && !request.guestEmail().isBlank())
                    ? request.guestEmail().trim()
                    : username.toLowerCase().replaceAll("\\s+", ".") + ".guest@lms.local";

            if (userRepository.existsByUsername(username)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "A user with username '" + username + "' already exists");
            }
            if (userRepository.existsByEmail(email)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "A user with that email already exists");
            }

            // Random password — guest can use forgot-password if they later want access
            String randomPassword = java.util.UUID.randomUUID().toString();
            user = new User(email, username, passwordEncoder.encode(randomPassword), Role.USER);
            user = userRepository.save(user);
            log.info("Admin {} created guest account '{}' for competition '{}'",
                    admin.getUsername(), username, comp.getName());
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Provide either userId or guestUsername");
        }

        if (participantRepository.existsByCompetitionIdAndUserId(compId, user.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    user.getUsername() + " is already a participant in this competition");
        }

        CompetitionParticipant cp = new CompetitionParticipant(comp, user, ParticipantStatus.ACTIVE);
        cp = participantRepository.save(cp);
        return ResponseEntity.status(HttpStatus.CREATED).body(ParticipantResponse.from(cp));
    }

    @PostMapping("/competitions/{compId}/declare-winner/{userId}")
    @Transactional
    public ResponseEntity<CompetitionResponse> declareWinner(
            @PathVariable Long compId,
            @PathVariable Long userId) {

        Competition comp = competitionRepository.findById(compId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));

        CompetitionParticipant winner = participantRepository.findByCompetitionIdAndUserId(compId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Participant not found"));

        // Mark this participant as winner
        winner.setStatus(ParticipantStatus.WINNER);
        participantRepository.save(winner);

        // Mark all other active participants as eliminated in one batch
        List<CompetitionParticipant> otherActive = participantRepository
                .findByCompetitionIdAndStatus(compId, ParticipantStatus.ACTIVE);
        otherActive.stream()
                .filter(cp -> !cp.getId().equals(winner.getId()))
                .forEach(cp -> cp.setStatus(ParticipantStatus.ELIMINATED));
        participantRepository.saveAll(otherActive);

        // Mark competition as completed
        comp.setStatus(CompetitionStatus.COMPLETED);
        competitionRepository.save(comp);

        log.info("Admin manually declared {} as winner of competition {}", winner.getUser().getUsername(), compId);

        int total = participantRepository.findByCompetitionId(compId).size();
        return ResponseEntity.ok(CompetitionResponse.from(comp, total, 1, winner.getUser().getUsername()));
    }

    // ── Fixture Sync ────────────────────────────────────────────────────

    @PostMapping("/fixtures/import/sync")
    public ResponseEntity<java.util.Map<String, Object>> triggerSync() {
        // Evict the provider cache so we get fresh data
        footballDataProvider.ifPresent(FootballDataProvider::evictAll);
        adminService.triggerSync();
        return ResponseEntity.ok(java.util.Map.of(
                "status", "ok",
                "message", "Full fixture sync triggered. Cache evicted.",
                "provider", footballDataProvider.isPresent() ? "football-data.org" : "mock"
        ));
    }

    @DeleteMapping("/fixtures/cache")
    public ResponseEntity<java.util.Map<String, String>> evictFixtureCache() {
        footballDataProvider.ifPresent(FootballDataProvider::evictAll);
        return ResponseEntity.ok(java.util.Map.of("message", "Fixture cache evicted. Next sync will fetch fresh data."));
    }

    // ── Fixture Overrides ───────────────────────────────────────────────

    @PutMapping("/fixtures/{fixtureId}/override")
    public FixtureResponse overrideFixture(@PathVariable Long fixtureId,
                                           @RequestBody FixtureOverrideRequest request,
                                           @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Fixture f = adminService.overrideFixture(fixtureId, request, userDetails.getId());
        return FixtureResponse.from(f);
    }

    @DeleteMapping("/fixtures/{fixtureId}/override")
    public FixtureResponse revertOverride(@PathVariable Long fixtureId,
                                          @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Fixture f = adminService.revertOverrides(fixtureId, userDetails.getId());
        return FixtureResponse.from(f);
    }

    // ── Audit ───────────────────────────────────────────────────────────

    @GetMapping("/audit")
    public Page<AuditLogResponse> getAuditLogs(@RequestParam(defaultValue = "0") int page,
                                               @RequestParam(defaultValue = "50") int size) {
        return adminService.getAuditLogs(PageRequest.of(page, size))
                .map(AuditLogResponse::from);
    }

    @GetMapping("/audit/fixture/{fixtureId}")
    public List<AuditLogResponse> getFixtureAudit(@PathVariable Long fixtureId) {
        return adminService.getAuditLogsForFixture(fixtureId).stream()
                .map(AuditLogResponse::from)
                .toList();
    }

    // ── User Management ─────────────────────────────────────────────────

    @GetMapping("/users")
    public List<UserResponse> getUsers() {
        return userRepository.findAllByOrderByUsernameAsc().stream()
                .map(UserResponse::from)
                .toList();
    }

    @PostMapping("/users")
    public ResponseEntity<UserResponse> createUser(@RequestBody CreateUserRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already in use");
        }
        if (userRepository.existsByUsername(request.username())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username already taken");
        }
        User user = new User(
                request.email(),
                request.username(),
                passwordEncoder.encode(request.password()),
                request.role() != null ? request.role() : Role.USER);
        user = userRepository.save(user);
        return ResponseEntity.status(HttpStatus.CREATED).body(UserResponse.from(user));
    }

    @PutMapping("/users/{userId}/role")
    public UserResponse updateRole(@PathVariable Long userId, @RequestBody UpdateRoleRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        user.setRole(request.role());
        userRepository.save(user);
        return UserResponse.from(user);
    }

    @PutMapping("/users/{userId}/toggle-disabled")
    public UserResponse toggleDisabled(@PathVariable Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        user.setDisabled(!user.isDisabled());
        userRepository.save(user);
        return UserResponse.from(user);
    }

    @DeleteMapping("/users/{userId}")
    @Transactional
    public ResponseEntity<Void> deleteUser(@PathVariable Long userId,
                                           @AuthenticationPrincipal UserDetailsImpl currentUser) {
        if (!userRepository.existsById(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found");
        }
        if (currentUser.getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot delete your own account");
        }

        // 1. Find all picks by this user and delete their results first
        List<Pick> picks = pickRepository.findByUserId(userId);
        List<Long> pickIds = picks.stream().map(Pick::getId).toList();
        if (!pickIds.isEmpty()) {
            pickResultRepository.deleteByPickIdIn(pickIds);
            pickRepository.deleteByUserId(userId);
        }

        // 2. Delete competition participations
        participantRepository.deleteByUserId(userId);

        // 3. Delete the user
        userRepository.deleteById(userId);

        return ResponseEntity.noContent().build();
    }

    // ── Simulate Gameweek ────────────────────────────────────────────────

    /**
     * Simulate gameweek results for testing.
     * Sets override scores/status on each fixture, force-locks the GW (if not already locked),
     * then immediately processes results so pick outcomes and eliminations are resolved.
     */
    @PostMapping("/competitions/{compId}/gameweeks/{gwId}/simulate")
    public ResponseEntity<SimulateResponse> simulateGameweek(
            @PathVariable Long compId,
            @PathVariable Long gwId,
            @RequestBody SimulateRequest request,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {

        Gameweek gw = gameweekRepository.findById(gwId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Gameweek not found"));

        if (!gw.getCompetition().getId().equals(compId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gameweek does not belong to this competition");
        }

        // 1. Apply fixture overrides in ONE batch save
        List<Fixture> fixturesToSave = new ArrayList<>();
        for (Map.Entry<Long, FixtureResultInput> entry : request.fixtures().entrySet()) {
            Fixture fixture = fixtureRepository.findById(entry.getKey())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Fixture " + entry.getKey() + " not found"));
            FixtureResultInput result = entry.getValue();
            if (result.status()    != null) fixture.setOverrideStatus(result.status());
            if (result.scoreHome() != null) fixture.setOverrideScoreHome(result.scoreHome());
            if (result.scoreAway() != null) fixture.setOverrideScoreAway(result.scoreAway());
            fixturesToSave.add(fixture);
        }
        fixtureRepository.saveAll(fixturesToSave); // single batch

        // 2. Force-lock (own transaction — short-lived)
        if (gw.getStatus() == GameweekStatus.UPCOMING) {
            gameweekProcessingService.forceLockGameweek(gwId);
        }

        // 3. Process results asynchronously — returns immediately so the UI doesn't time out
        boolean skipAutoComplete = request.skipAutoComplete() != null && request.skipAutoComplete();
        gameweekProcessingService.processGameweekResultsAsync(gwId, skipAutoComplete);

        return ResponseEntity.accepted().body(new SimulateResponse(
                gwId, "PROCESSING",
                "Processing started — results will be ready shortly. Refresh to see updates.",
                gw.getCompetition().getStatus() != null ? gw.getCompetition().getStatus().name() : "ACTIVE",
                -1
        ));
    }

    // ── Get gameweeks for a competition (for simulate UI) ────────────────

    @GetMapping("/competitions/{compId}/gameweeks")
    public List<GameweekWithFixturesResponse> getGameweeksForCompetition(@PathVariable Long compId) {
        List<Gameweek> gameweeks = gameweekRepository.findByCompetitionIdOrderByWeekNumberAsc(compId);
        if (gameweeks.isEmpty()) return List.of();

        // Load ALL fixtures for ALL gameweeks in ONE query — avoid N+1
        List<Long> gameweekIds = gameweeks.stream().map(Gameweek::getId).toList();
        Map<Long, List<Fixture>> fixturesByGameweekId = fixtureRepository.findByGameweekIdIn(gameweekIds)
                .stream().collect(java.util.stream.Collectors.groupingBy(f -> f.getGameweek().getId()));

        return gameweeks.stream().map(gw -> {
            List<FixtureResponse> fixtureResponses = fixturesByGameweekId
                    .getOrDefault(gw.getId(), List.of())
                    .stream().map(FixtureResponse::from).toList();
            return new GameweekWithFixturesResponse(
                    gw.getId(), gw.getWeekNumber(), gw.getStatus().name(),
                    gw.getLockAt(), gw.getStartsAt(), fixtureResponses);
        }).toList();
    }

    // ── Test Data Generation ────────────────────────────────────────────

    /**
     * Generate test users for scale testing.
     * Creates N users and joins them to the specified competition with random picks.
     */
    @PostMapping("/test/generate")
    @Transactional
    public ResponseEntity<TestGenerationResponse> generateTestData(@RequestBody TestGenerationRequest request) {
        var result = testDataGenerator.generateTestUsers(
                request.competitionId(),
                request.userCount(),
                request.gameweeksToSeedPicks()
        );
        return ResponseEntity.ok(new TestGenerationResponse(
                result.usersCreated(),
                result.participantsAdded(),
                result.picksCreated(),
                "Test data generated successfully"
        ));
    }

    /**
     * Cleanup all test users (username like 'testuser%')
     */
    @DeleteMapping("/test/cleanup")
    @Transactional
    public ResponseEntity<TestCleanupResponse> cleanupTestData() {
        int deleted = testDataGenerator.cleanupTestUsers();
        return ResponseEntity.ok(new TestCleanupResponse(deleted, "Test users cleaned up"));
    }

    // ── Simulate DTOs ─────────────────────────────────────────────────

    public record FixtureResultInput(FixtureStatus status, Integer scoreHome, Integer scoreAway) {}
    public record SimulateRequest(Map<Long, FixtureResultInput> fixtures, Boolean skipAutoComplete) {}
    public record SimulateResponse(Long gameweekId, String newStatus, String message, String competitionStatus, Integer activeParticipants) {}
    public record GameweekWithFixturesResponse(
            Long id, int weekNumber, String status,
            java.time.LocalDateTime lockAt, java.time.LocalDateTime startsAt,
            List<FixtureResponse> fixtures
    ) {}

    // ── DTOs ─────────────────────────────────────────────────────────────

    public record CreateUserRequest(String email, String username, String password, Role role) {}
    public record UpdateRoleRequest(Role role) {}
    public record UserResponse(
            Long id, String email, String username, String role,
            boolean disabled, String createdAt
    ) {
        public static UserResponse from(User u) {
            return new UserResponse(
                    u.getId(), u.getEmail(), u.getUsername(), u.getRole().name(),
                    u.isDisabled(), u.getCreatedAt().toString());
        }
    }

    public record TestGenerationRequest(Long competitionId, int userCount, List<Integer> gameweeksToSeedPicks) {}
    public record TestGenerationResponse(int usersCreated, int participantsAdded, int picksCreated, String message) {}
    public record TestCleanupResponse(int usersDeleted, String message) {}
}
