package com.lastmanstanding.controller;

import com.lastmanstanding.dto.CompetitionDtos.*;
import com.lastmanstanding.entity.*;
import com.lastmanstanding.repository.AuditLogRepository;
import com.lastmanstanding.repository.ClubRepository;
import com.lastmanstanding.repository.CompetitionParticipantRepository;
import com.lastmanstanding.repository.CompetitionRepository;
import com.lastmanstanding.repository.FixtureRepository;
import com.lastmanstanding.repository.GameweekRepository;
import com.lastmanstanding.repository.PickRepository;
import com.lastmanstanding.repository.PickResultRepository;
import com.lastmanstanding.repository.PasswordResetTokenRepository;
import com.lastmanstanding.repository.PushSubscriptionRepository;
import com.lastmanstanding.repository.MobilePushTokenRepository;
import com.lastmanstanding.provider.FootballDataProvider;
import com.lastmanstanding.security.UserDetailsImpl;
import com.lastmanstanding.service.AdminService;
import com.lastmanstanding.service.AdminService.FixtureOverrideRequest;
import com.lastmanstanding.service.CompetitionService;
import com.lastmanstanding.service.CompetitionCacheService;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Objects;

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
    private final AuditLogRepository auditLogRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PushSubscriptionRepository pushSubscriptionRepository;
    private final MobilePushTokenRepository mobilePushTokenRepository;
    private final CompetitionCacheService competitionCacheService;

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
                           Optional<FootballDataProvider> footballDataProvider,
                           AuditLogRepository auditLogRepository,
                           PasswordResetTokenRepository passwordResetTokenRepository,
                           PushSubscriptionRepository pushSubscriptionRepository,
                           MobilePushTokenRepository mobilePushTokenRepository,
                           CompetitionCacheService competitionCacheService) {
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
        this.auditLogRepository = auditLogRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.pushSubscriptionRepository = pushSubscriptionRepository;
        this.mobilePushTokenRepository = mobilePushTokenRepository;
        this.competitionCacheService = competitionCacheService;
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
        logAudit(userDetails, "Club", club.getId(), "name", null, club.getName(), "CREATE");
        return ResponseEntity.status(HttpStatus.CREATED).body(ClubResponse.from(club));
    }

    @PutMapping("/clubs/{id}")
    public ClubResponse updateClub(@PathVariable Long id,
                                   @RequestBody ClubRequest request,
                                   @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Club club = clubRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));
        String oldName = club.getName();
        String oldDescription = club.getDescription();
        String oldAdminName = club.getClubAdmin() != null ? club.getClubAdmin().getUsername() : null;
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
        Club saved = clubRepository.save(club);
        logAudit(userDetails, "Club", saved.getId(), "request", null, request.toString(), "UPDATE");
        if (!Objects.equals(oldName, saved.getName())) {
            logAudit(userDetails, "Club", saved.getId(), "name", oldName, saved.getName(), "UPDATE_FIELD");
        }
        if (!Objects.equals(oldDescription, saved.getDescription())) {
            logAudit(userDetails, "Club", saved.getId(), "description", oldDescription, saved.getDescription(), "UPDATE_FIELD");
        }
        String newAdminName = saved.getClubAdmin() != null ? saved.getClubAdmin().getUsername() : null;
        if (!Objects.equals(oldAdminName, newAdminName)) {
            logAudit(userDetails, "Club", saved.getId(), "clubAdmin", oldAdminName, newAdminName, "ASSIGN_ADMIN");
        }
        return ClubResponse.from(saved);
    }

    @DeleteMapping("/clubs/{id}")
    public ResponseEntity<Void> deleteClub(@PathVariable Long id,
                                           @AuthenticationPrincipal UserDetailsImpl userDetails) {
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
        logAudit(userDetails, "Club", club.getId(), "name", club.getName(), null, "DELETE");
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
                request.maxEntriesPerUser(),
                request.fixtureCompetitionCode(),
                request.missedPickMode(), request.postponedConsumesTeam(), request.lifelineEnabled(), request.passFeeToParticipant(),
                request.paymentMode(), request.manualPaymentPolicy(), request.visibility(), request.startDate(), userDetails.getId(), request.clubId());
        logAudit(userDetails, "Competition", c.getId(), "name", null, c.getName(), "CREATE");
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(CompetitionResponse.from(c, 0, 0, null));
    }

    @PostMapping("/competitions/bulk-create")
    public ResponseEntity<BulkCompetitionCreateResponse> bulkCreateCompetitions(
            @RequestBody BulkCompetitionCreateRequest request,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        int count = Math.max(1, Math.min(request.count(), 500));
        String prefix = request.prefix() == null || request.prefix().trim().isBlank()
                ? "Load Test"
                : request.prefix().trim();
        LocalDate startDate = request.startDate() != null ? request.startDate() : LocalDate.now();

        int created = 0;
        List<String> errors = new ArrayList<>();
        List<Long> createdIds = new ArrayList<>();

        for (int i = 0; i < count; i++) {
            String suffix = String.format("%03d", i + 1);
            String name = prefix + " " + suffix;
            try {
                Competition c = competitionService.createCompetition(
                        name,
                        "Auto-generated competition " + (i + 1) + " of " + count + " for load testing.",
                        java.math.BigDecimal.ZERO,
                        null,
                        1,
                        "PL",
                        MissedPickMode.ELIMINATE,
                        true,
                        false,
                        false,
                        "FREE",
                        "STRICT",
                        "PUBLIC",
                        startDate,
                        userDetails.getId(),
                        request.clubId(),
                        false
                );
                created += 1;
                createdIds.add(c.getId());
            } catch (Exception ex) {
                errors.add(name + ": " + ex.getMessage());
            }
        }

        logAudit(
                userDetails,
                "Competition",
                0L,
                "bulkCreate",
                null,
                "prefix=" + prefix + ", requested=" + count + ", created=" + created + ", failed=" + errors.size(),
                "BULK_CREATE"
        );

        return ResponseEntity.ok(new BulkCompetitionCreateResponse(
                count,
                created,
                errors.size(),
                createdIds,
                errors
        ));
    }

    @PutMapping("/competitions/{id}")
    public CompetitionResponse updateCompetition(@PathVariable Long id,
                             @Valid @RequestBody UpdateCompetitionRequest request,
                             @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Competition existing = competitionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));
        String oldName = existing.getName();
        String oldDescription = existing.getDescription();
        String oldEntryFee = existing.getEntryFee() != null ? existing.getEntryFee().toString() : null;
        String oldPrizePool = existing.getPrizePool() != null ? existing.getPrizePool().toString() : null;
        String oldMissedPickMode = existing.getMissedPickMode() != null ? existing.getMissedPickMode().name() : null;
        String oldFixtureCompetitionCode = existing.getFixtureCompetitionCode();
        String oldPostponedConsumesTeam = String.valueOf(existing.isPostponedConsumesTeam());
        String oldPassFeeToParticipant = String.valueOf(existing.isPassFeeToParticipant());
        String oldPaymentMode = existing.getPaymentMode() != null ? existing.getPaymentMode().name() : null;
        String oldVisibility = existing.getVisibility() != null ? existing.getVisibility().name() : null;
        String oldStartDate = existing.getStartDate() != null ? existing.getStartDate().toString() : null;
        String oldStatus = existing.getStatus() != null ? existing.getStatus().name() : null;
        String oldClubId = existing.getClub() != null ? String.valueOf(existing.getClub().getId()) : null;
        Competition c = competitionService.updateCompetition(id,
                request.name(), request.description(), request.entryFee(), request.prizePool(),
                request.maxEntriesPerUser(),
                request.fixtureCompetitionCode(),
                request.missedPickMode(),
                request.postponedConsumesTeam() != null ? request.postponedConsumesTeam() : true,
                request.lifelineEnabled(),
                request.passFeeToParticipant(),
                request.paymentMode(), request.manualPaymentPolicy(), request.visibility(),
                request.startDate(), request.status(), request.clubId());
        logAudit(userDetails, "Competition", c.getId(), "request", null, request.toString(), "UPDATE");
        if (!Objects.equals(oldName, c.getName())) {
            logAudit(userDetails, "Competition", c.getId(), "name", oldName, c.getName(), "UPDATE_FIELD");
        }
        if (!Objects.equals(oldDescription, c.getDescription())) {
            logAudit(userDetails, "Competition", c.getId(), "description", oldDescription, c.getDescription(), "UPDATE_FIELD");
        }
        String newEntryFee = c.getEntryFee() != null ? c.getEntryFee().toString() : null;
        if (!Objects.equals(oldEntryFee, newEntryFee)) {
            logAudit(userDetails, "Competition", c.getId(), "entryFee", oldEntryFee, newEntryFee, "UPDATE_FIELD");
        }
        String newPrizePool = c.getPrizePool() != null ? c.getPrizePool().toString() : null;
        if (!Objects.equals(oldPrizePool, newPrizePool)) {
            logAudit(userDetails, "Competition", c.getId(), "prizePool", oldPrizePool, newPrizePool, "UPDATE_FIELD");
        }
        String newMissedPickMode = c.getMissedPickMode() != null ? c.getMissedPickMode().name() : null;
        String newFixtureCompetitionCode = c.getFixtureCompetitionCode();
        if (!Objects.equals(oldFixtureCompetitionCode, newFixtureCompetitionCode)) {
            logAudit(userDetails, "Competition", c.getId(), "fixtureCompetitionCode", oldFixtureCompetitionCode, newFixtureCompetitionCode, "UPDATE_FIELD");
        }
        if (!Objects.equals(oldMissedPickMode, newMissedPickMode)) {
            logAudit(userDetails, "Competition", c.getId(), "missedPickMode", oldMissedPickMode, newMissedPickMode, "UPDATE_FIELD");
        }
        String newPostponedConsumesTeam = String.valueOf(c.isPostponedConsumesTeam());
        if (!Objects.equals(oldPostponedConsumesTeam, newPostponedConsumesTeam)) {
            logAudit(userDetails, "Competition", c.getId(), "postponedConsumesTeam", oldPostponedConsumesTeam, newPostponedConsumesTeam, "UPDATE_FIELD");
        }
        String newPassFeeToParticipant = String.valueOf(c.isPassFeeToParticipant());
        if (!Objects.equals(oldPassFeeToParticipant, newPassFeeToParticipant)) {
            logAudit(userDetails, "Competition", c.getId(), "passFeeToParticipant", oldPassFeeToParticipant, newPassFeeToParticipant, "UPDATE_FIELD");
        }
        String newPaymentMode = c.getPaymentMode() != null ? c.getPaymentMode().name() : null;
        if (!Objects.equals(oldPaymentMode, newPaymentMode)) {
            logAudit(userDetails, "Competition", c.getId(), "paymentMode", oldPaymentMode, newPaymentMode, "UPDATE_FIELD");
        }
        String newVisibility = c.getVisibility() != null ? c.getVisibility().name() : null;
        if (!Objects.equals(oldVisibility, newVisibility)) {
            logAudit(userDetails, "Competition", c.getId(), "visibility", oldVisibility, newVisibility, "UPDATE_FIELD");
        }
        String newStartDate = c.getStartDate() != null ? c.getStartDate().toString() : null;
        if (!Objects.equals(oldStartDate, newStartDate)) {
            logAudit(userDetails, "Competition", c.getId(), "startDate", oldStartDate, newStartDate, "UPDATE_FIELD");
        }
        String newStatus = c.getStatus() != null ? c.getStatus().name() : null;
        if (!Objects.equals(oldStatus, newStatus)) {
            logAudit(userDetails, "Competition", c.getId(), "status", oldStatus, newStatus, "UPDATE_FIELD");
        }
        String newClubId = c.getClub() != null ? String.valueOf(c.getClub().getId()) : null;
        if (!Objects.equals(oldClubId, newClubId)) {
            logAudit(userDetails, "Competition", c.getId(), "clubId", oldClubId, newClubId, "UPDATE_FIELD");
        }
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
    public ResponseEntity<Void> deleteCompetition(@PathVariable Long id,
                                                  @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Competition comp = competitionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));
        logAudit(userDetails, "Competition", comp.getId(), "name", comp.getName(), null, "DELETE");
        competitionService.deleteCompetition(id);
        competitionCacheService.evictCompetition(id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/competitions/bulk-delete")
    public ResponseEntity<BulkCompetitionDeleteResponse> bulkDeleteCompetitions(
            @RequestBody BulkCompetitionDeleteRequest request,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        String prefix = request.prefix() == null ? "" : request.prefix().trim().toLowerCase();
        boolean upcomingOnly = request.upcomingOnly() == null || request.upcomingOnly();

        List<Competition> candidates = competitionService.getAllCompetitions();
        if (!prefix.isBlank()) {
            candidates = candidates.stream()
                    .filter(c -> c.getName() != null && c.getName().toLowerCase().startsWith(prefix))
                    .toList();
        }
        if (upcomingOnly) {
            candidates = candidates.stream()
                    .filter(c -> c.getStatus() == CompetitionStatus.UPCOMING)
                    .toList();
        }

        int deleted = 0;
        List<Long> deletedIds = new ArrayList<>();
        List<String> errors = new ArrayList<>();

        for (Competition c : candidates) {
            try {
                competitionService.deleteCompetition(c.getId());
                deleted += 1;
                deletedIds.add(c.getId());
            } catch (Exception ex) {
                errors.add(c.getName() + " (" + c.getId() + "): " + ex.getMessage());
            }
        }

        logAudit(
                userDetails,
                "Competition",
                0L,
                "bulkDelete",
                null,
                "prefix=" + prefix + ", upcomingOnly=" + upcomingOnly + ", matched=" + candidates.size() + ", deleted=" + deleted + ", failed=" + errors.size(),
                "BULK_DELETE"
        );

        return ResponseEntity.ok(new BulkCompetitionDeleteResponse(
                candidates.size(),
                deleted,
                errors.size(),
                deletedIds,
                errors
        ));
    }

    @PostMapping("/competitions/{id}/sync-fixtures")
    public ResponseEntity<Map<String, Object>> syncFixturesForCompetition(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Competition comp = competitionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));
        int count = fixtureSyncService.syncForCompetition(comp);
        competitionCacheService.evictCompetition(comp.getId());
        logAudit(userDetails, "Competition", comp.getId(), "fixturesAdded", null, String.valueOf(count), "SYNC_FIXTURES");
        return ResponseEntity.ok(Map.of(
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

    @DeleteMapping("/competitions/{compId}/participants/{participantId}")
    public ResponseEntity<Void> removeParticipant(@PathVariable Long compId,
                                                  @PathVariable Long participantId,
                                                  @AuthenticationPrincipal UserDetailsImpl userDetails) {
        CompetitionParticipant cp = participantRepository.findByIdAndCompetitionId(participantId, compId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Participant not found"));
        competitionService.removeParticipantEntry(compId, participantId);
        logAudit(userDetails, "CompetitionParticipant", cp.getId(), "participantId", String.valueOf(participantId), null, "REMOVE_PARTICIPANT");
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
        boolean createdGuest = false;

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
                createdGuest = true;
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
        if (createdGuest) {
            logAudit(admin, "User", user.getId(), "guest", null, user.getUsername(), "CREATE_GUEST");
        }
        logAudit(admin, "CompetitionParticipant", cp.getId(), "userId", null, String.valueOf(user.getId()), "ADD_PARTICIPANT");
        return ResponseEntity.status(HttpStatus.CREATED).body(ParticipantResponse.from(cp));
    }

    @PostMapping("/competitions/{compId}/declare-winner/{participantId}")
    @Transactional
    public ResponseEntity<CompetitionResponse> declareWinner(
            @PathVariable Long compId,
            @PathVariable Long participantId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {

        Competition comp = competitionRepository.findById(compId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));

        CompetitionParticipant winner = participantRepository.findByIdAndCompetitionId(participantId, compId)
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
        gameweekProcessingService.cleanupUnusedFutureGameweeks(compId);

        log.info("Admin manually declared {} as winner of competition {}", winner.getUser().getUsername(), compId);
        logAudit(userDetails, "Competition", compId, "winnerParticipantId", null, String.valueOf(participantId), "DECLARE_WINNER");

        int total = participantRepository.findByCompetitionId(compId).size();
        return ResponseEntity.ok(CompetitionResponse.from(comp, total, 1, winner.getUser().getUsername()));
    }

    // ── Fixture Sync ────────────────────────────────────────────────────

    @PostMapping("/fixtures/import/sync")
    public ResponseEntity<Map<String, Object>> triggerSync(
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        // Evict the provider cache so we get fresh data
        footballDataProvider.ifPresent(FootballDataProvider::evictAll);
        adminService.triggerSync();
        logAudit(userDetails, "FixtureSync", 0L, null, null, null, "FULL_SYNC");
        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "message", "Full fixture sync triggered. Cache evicted.",
                "provider", footballDataProvider.isPresent() ? "football-data.org" : "mock"
        ));
    }

    @DeleteMapping("/fixtures/cache")
    public ResponseEntity<Map<String, String>> evictFixtureCache(
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        footballDataProvider.ifPresent(FootballDataProvider::evictAll);
        logAudit(userDetails, "FixtureCache", 0L, null, null, null, "EVICT_CACHE");
        return ResponseEntity.ok(Map.of("message", "Fixture cache evicted. Next sync will fetch fresh data."));
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
                               @RequestParam(defaultValue = "50") int size,
                               @RequestParam(required = false) String action,
                               @RequestParam(required = false) String entityType,
                               @RequestParam(required = false) Long entityId,
                               @RequestParam(required = false) String fieldName,
                               @RequestParam(required = false) String username,
                               @RequestParam(required = false) String from,
                               @RequestParam(required = false) String to) {
        Optional<LocalDateTime> fromDate = Optional.ofNullable(from)
            .map(LocalDate::parse)
            .map(d -> d.atStartOfDay().atOffset(ZoneOffset.UTC).toLocalDateTime());
        Optional<LocalDateTime> toDate = Optional.ofNullable(to)
            .map(LocalDate::parse)
            .map(d -> d.atTime(23, 59, 59).atOffset(ZoneOffset.UTC).toLocalDateTime());

        return adminService.getAuditLogsFiltered(
            PageRequest.of(page, size),
            Optional.ofNullable(action),
            Optional.ofNullable(entityType),
            Optional.ofNullable(entityId),
            Optional.ofNullable(fieldName),
            Optional.ofNullable(username),
            fromDate,
            toDate
        )
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

    @GetMapping("/users/page")
    public Page<UserResponse> getUsersPage(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Role role) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.max(1, Math.min(size, 100));
        String search = q == null || q.isBlank() ? null : q.trim();
        PageRequest pageRequest = PageRequest.of(safePage, safeSize);
        Page<User> users;
        if (search == null && role == null) {
            users = userRepository.findAllByOrderByUsernameAsc(pageRequest);
        } else if (search == null) {
            users = userRepository.findByRoleOrderByUsernameAsc(role, pageRequest);
        } else if (role == null) {
            users = userRepository.searchAdminUsers(search, pageRequest);
        } else {
            users = userRepository.searchAdminUsersByRole(search, role, pageRequest);
        }
        return users.map(UserResponse::from);
    }

    @PostMapping("/users")
    public ResponseEntity<UserResponse> createUser(@RequestBody CreateUserRequest request,
                                                   @AuthenticationPrincipal UserDetailsImpl userDetails) {
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
        logAudit(userDetails, "User", user.getId(), "role", null, user.getRole().name(), "CREATE");
        return ResponseEntity.status(HttpStatus.CREATED).body(UserResponse.from(user));
    }

    @PutMapping("/users/{userId}/role")
    public UserResponse updateRole(@PathVariable Long userId,
                                   @RequestBody UpdateRoleRequest request,
                                   @AuthenticationPrincipal UserDetailsImpl userDetails) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        String oldRole = user.getRole().name();
        user.setRole(request.role());
        userRepository.save(user);
        logAudit(userDetails, "User", userId, "role", oldRole, request.role().name(), "UPDATE_ROLE");
        return UserResponse.from(user);
    }

    @PutMapping("/users/{userId}/toggle-disabled")
    public UserResponse toggleDisabled(@PathVariable Long userId,
                                       @AuthenticationPrincipal UserDetailsImpl userDetails) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        String oldDisabled = String.valueOf(user.isDisabled());
        user.setDisabled(!user.isDisabled());
        userRepository.save(user);
        logAudit(userDetails, "User", userId, "disabled", oldDisabled, String.valueOf(user.isDisabled()), "TOGGLE_DISABLED");
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

        User user = userRepository.findById(userId).orElseThrow();

        // 1. Find all picks by this user and delete their results first
        List<Pick> picks = pickRepository.findByUserId(userId);
        List<Long> pickIds = picks.stream().map(Pick::getId).toList();
        if (!pickIds.isEmpty()) {
            pickResultRepository.deleteByPickIdIn(pickIds);
            pickRepository.deleteByUserId(userId);
        }

        // 2. Delete competition participations
        participantRepository.deleteByUserId(userId);

        // 3. Remove active club-admin ownership. created_by stays intact for historical ownership.
        clubRepository.findByClubAdminId(userId).forEach(club -> {
            club.setClubAdmin(null);
            clubRepository.save(club);
        });

        // 4. Remove account tokens/subscriptions and anonymize the user row.
        passwordResetTokenRepository.deleteByUserId(userId);
        pushSubscriptionRepository.deleteByUserId(userId);
        mobilePushTokenRepository.deleteByUserId(userId);

        String oldUsername = user.getUsername();
        String marker = "deleted-" + user.getId() + "-" + System.currentTimeMillis();
        user.setDisabled(true);
        user.setEmail(marker + "@deleted.local");
        user.setUsername(marker);
        user.setPasswordHash(null);
        user.setRole(Role.USER);
        user.setOauthProvider(null);
        user.setOauthProviderId(null);
        user.setAvatarUrl(null);
        user.setEmailResultsOptIn(false);
        userRepository.save(user);

        logAudit(currentUser, "User", userId, "username", oldUsername, marker, "DELETE");

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
        competitionCacheService.evictCompetition(compId);
        gameweekProcessingService.processGameweekResultsAsync(gwId, skipAutoComplete);

        logAudit(userDetails, "Gameweek", gwId, "competitionId", null, String.valueOf(compId), "SIMULATE_RESULTS");

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
        public ResponseEntity<TestGenerationResponse> generateTestData(@RequestBody TestGenerationRequest request,
                                       @AuthenticationPrincipal UserDetailsImpl userDetails) {
        var result = testDataGenerator.generateTestUsers(
                request.competitionId(),
                request.userCount(),
                request.gameweeksToSeedPicks()
        );
        logAudit(userDetails, "Competition", request.competitionId(), "userCount", null,
            String.valueOf(request.userCount()), "GENERATE_TEST_DATA");
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
    public ResponseEntity<TestCleanupResponse> cleanupTestData(
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        int deleted = testDataGenerator.cleanupTestUsers();
        logAudit(userDetails, "TestData", 0L, "usersDeleted", null, String.valueOf(deleted), "CLEANUP_TEST_DATA");
        return ResponseEntity.ok(new TestCleanupResponse(deleted, "Test users cleaned up"));
    }

    private void logAudit(UserDetailsImpl actor,
                          String entityType,
                          Long entityId,
                          String fieldName,
                          String oldValue,
                          String newValue,
                          String action) {
        if (entityId == null) {
            entityId = 0L;
        }
        if (actor == null) {
            return;
        }
        User user = userRepository.findById(actor.getId()).orElse(null);
        if (user == null) {
            return;
        }
        auditLogRepository.save(new AuditLog(user, entityType, entityId, fieldName, oldValue, newValue, action));
    }

    // ── Simulate DTOs ─────────────────────────────────────────────────

    public record FixtureResultInput(FixtureStatus status, Integer scoreHome, Integer scoreAway) {}
    public record SimulateRequest(Map<Long, FixtureResultInput> fixtures, Boolean skipAutoComplete) {}
    public record SimulateResponse(Long gameweekId, String newStatus, String message, String competitionStatus, Integer activeParticipants) {}
    public record GameweekWithFixturesResponse(
            Long id, int weekNumber, String status,
            LocalDateTime lockAt, LocalDateTime startsAt,
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
    public record BulkCompetitionCreateRequest(String prefix, int count, LocalDate startDate, Long clubId) {}
    public record BulkCompetitionCreateResponse(int requested, int created, int failed, List<Long> createdIds, List<String> errors) {}
    public record BulkCompetitionDeleteRequest(String prefix, Boolean upcomingOnly) {}
    public record BulkCompetitionDeleteResponse(int matched, int deleted, int failed, List<Long> deletedIds, List<String> errors) {}
}
