package com.lastmanstanding.controller;

import com.lastmanstanding.dto.CompetitionDtos.*;
import com.lastmanstanding.entity.*;
import com.lastmanstanding.repository.*;
import com.lastmanstanding.security.UserDetailsImpl;
import com.lastmanstanding.service.CompetitionService;
import com.lastmanstanding.service.FixtureSyncService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
/**
 * Endpoints for CLUB_ADMIN users — scoped to their own club only.
 * Super ADMINs can also call these endpoints.
 */
@RestController
@RequestMapping("/club-admin")
public class ClubAdminController {

    private static final Logger log = LoggerFactory.getLogger(ClubAdminController.class);
    private final ClubRepository clubRepository;
    private final CompetitionRepository competitionRepository;
    private final CompetitionParticipantRepository participantRepository;
    private final CompetitionService competitionService;
    private final FixtureSyncService fixtureSyncService;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final PaymentRepository paymentRepository;
        private final AuditLogRepository auditLogRepository;

    public ClubAdminController(ClubRepository clubRepository,
                               CompetitionRepository competitionRepository,
                               CompetitionParticipantRepository participantRepository,
                               CompetitionService competitionService,
                               FixtureSyncService fixtureSyncService,
                               UserRepository userRepository,
                               PasswordEncoder passwordEncoder,
                               PaymentRepository paymentRepository,
                               AuditLogRepository auditLogRepository) {
        this.clubRepository = clubRepository;
        this.competitionRepository = competitionRepository;
        this.participantRepository = participantRepository;
        this.competitionService = competitionService;
        this.fixtureSyncService = fixtureSyncService;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.paymentRepository = paymentRepository;
        this.auditLogRepository = auditLogRepository;
    }

    // ── My Club ──────────────────────────────────────────────────────────

    @GetMapping("/my-club")
    public ClubResponse getMyClub(@AuthenticationPrincipal UserDetailsImpl userDetails) {
        Club club = resolveClub(userDetails);
        return ClubResponse.from(club);
    }

    public record AssignAdminRequest(Long userId) {}

    @PutMapping("/my-club/assign-admin")
    @Transactional
    public ResponseEntity<ClubResponse> assignClubAdmin(
            @RequestBody AssignAdminRequest request,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {

        Club club = resolveClub(userDetails);

        User newAdmin = userRepository.findById(request.userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        // Demote old admin back to USER if they're not already an admin elsewhere
        User oldAdmin = club.getClubAdmin();
        if (oldAdmin != null && !oldAdmin.getId().equals(newAdmin.getId())) {
            boolean adminElsewhere = clubRepository.findAll().stream()
                    .anyMatch(c -> !c.getId().equals(club.getId())
                            && c.getClubAdmin() != null
                            && c.getClubAdmin().getId().equals(oldAdmin.getId()));
            if (!adminElsewhere && oldAdmin.getRole() == Role.CLUB_ADMIN) {
                oldAdmin.setRole(Role.USER);
                userRepository.save(oldAdmin);
            }
        }

        // Promote new admin
        if (newAdmin.getRole() == Role.USER) {
            newAdmin.setRole(Role.CLUB_ADMIN);
            userRepository.save(newAdmin);
        }

        club.setClubAdmin(newAdmin);
        clubRepository.save(club);

        log.info("Club admin {} transferred admin of club '{}' to user '{}'",
                userDetails.getUsername(), club.getName(), newAdmin.getUsername());

        logAudit(userDetails, "Club", club.getId(), "clubAdmin", oldAdmin != null ? oldAdmin.getUsername() : null,
                newAdmin.getUsername(), "ASSIGN_ADMIN");

        return ResponseEntity.ok(ClubResponse.from(club));
    }

    @PutMapping("/my-club/branding")
    @Transactional
    public ResponseEntity<ClubResponse> updateBranding(
            @RequestBody UpdateClubBrandingRequest request,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {

        Club club = resolveClub(userDetails);

        // Validate hex colors if provided
        if (request.primaryColor() != null && !request.primaryColor().matches("^#[0-9a-fA-F]{6}$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "primaryColor must be a valid hex color (e.g. #1a3c6e)");
        }
        if (request.secondaryColor() != null && !request.secondaryColor().matches("^#[0-9a-fA-F]{6}$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "secondaryColor must be a valid hex color");
        }
        // Accept https:// URLs or base64 data URLs (file uploads)
        if (request.logoUrl() != null && !request.logoUrl().isBlank()
                && !request.logoUrl().startsWith("https://")
                && !request.logoUrl().startsWith("data:image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "logoUrl must start with https:// or be an uploaded image");
        }

        club.setPrimaryColor(request.primaryColor());
        club.setSecondaryColor(request.secondaryColor());
        club.setLogoUrl(request.logoUrl() != null && request.logoUrl().isBlank() ? null : request.logoUrl());
        clubRepository.save(club);

        log.info("Club admin {} updated branding for club '{}'", userDetails.getUsername(), club.getName());
        logAudit(userDetails, "Club", club.getId(), "branding", null, "updated", "UPDATE_BRANDING");

        return ResponseEntity.ok(ClubResponse.from(club));
    }

    // ── Competitions ─────────────────────────────────────────────────────

    @GetMapping("/competitions")
    public List<CompetitionResponse> getMyCompetitions(@AuthenticationPrincipal UserDetailsImpl userDetails) {
        Club club = resolveClub(userDetails);
        List<Competition> comps = competitionRepository.findByClubIdOrderByStartDateDesc(club.getId());
        if (comps.isEmpty()) return List.of();

        // Batch load all counts in ONE query — avoids N+1
        Map<Long, long[]> countsByCompId = new HashMap<>();
        participantRepository.countParticipantsGroupedByCompetition().forEach(row -> {
            long cId    = ((Number) row[0]).longValue();
            long total  = ((Number) row[1]).longValue();
            long active = row[2] != null ? ((Number) row[2]).longValue() : 0L;
            countsByCompId.put(cId, new long[]{total, active});
        });

        // Batch load all winners in ONE query
        Map<Long, String> winnerByCompId = new HashMap<>();
        participantRepository.findByStatus(ParticipantStatus.WINNER)
                .forEach(cp -> winnerByCompId.put(cp.getCompetition().getId(), cp.getUser().getUsername()));

        return comps.stream().map(c -> {
            long[] counts = countsByCompId.getOrDefault(c.getId(), new long[]{0, 0});
            return CompetitionResponse.from(c, (int) counts[0], (int) counts[1], winnerByCompId.get(c.getId()));
        }).toList();
    }

    @PostMapping("/competitions")
    public ResponseEntity<CompetitionResponse> createCompetition(
            @Valid @RequestBody CreateCompetitionRequest request,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Club club = resolveClub(userDetails);
        // Force the competition into this club
        Competition c = competitionService.createCompetition(
                request.name(), request.description(), request.entryFee(), request.prizePool(),
                request.missedPickMode(), request.postponedConsumesTeam(), request.passFeeToParticipant(),
                request.paymentMode(), request.manualPaymentPolicy(), request.visibility(), request.startDate(), userDetails.getId(), club.getId());
        logAudit(userDetails, "Competition", c.getId(), "name", null, c.getName(), "CREATE");
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(CompetitionResponse.from(c, 0, 0, null));
    }

    @PutMapping("/competitions/{id}")
    public CompetitionResponse updateCompetition(@PathVariable Long id,
                                                 @Valid @RequestBody UpdateCompetitionRequest request,
                                                 @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Club club = resolveClub(userDetails);
        assertOwnsCompetition(id, club);
                Competition existing = competitionRepository.findById(id)
                                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));
                String oldName = existing.getName();
                String oldDescription = existing.getDescription();
                String oldEntryFee = existing.getEntryFee() != null ? existing.getEntryFee().toString() : null;
                String oldPrizePool = existing.getPrizePool() != null ? existing.getPrizePool().toString() : null;
                String oldMissedPickMode = existing.getMissedPickMode() != null ? existing.getMissedPickMode().name() : null;
                String oldPostponedConsumesTeam = String.valueOf(existing.isPostponedConsumesTeam());
                String oldPassFeeToParticipant = String.valueOf(existing.isPassFeeToParticipant());
                String oldPaymentMode = existing.getPaymentMode() != null ? existing.getPaymentMode().name() : null;
                String oldVisibility = existing.getVisibility() != null ? existing.getVisibility().name() : null;
                String oldStartDate = existing.getStartDate() != null ? existing.getStartDate().toString() : null;
                String oldStatus = existing.getStatus() != null ? existing.getStatus().name() : null;
                String oldClubId = existing.getClub() != null ? String.valueOf(existing.getClub().getId()) : null;
        Competition c = competitionService.updateCompetition(id,
                request.name(), request.description(), request.entryFee(), request.prizePool(),
                request.missedPickMode(),
                request.postponedConsumesTeam() != null ? request.postponedConsumesTeam() : true,
                request.passFeeToParticipant(),
                request.paymentMode(), request.manualPaymentPolicy(), request.visibility(),
                request.startDate(), request.status(), club.getId());
                logAudit(userDetails, "Competition", id, "request", null, request.toString(), "UPDATE");
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
        Club club = resolveClub(userDetails);
        assertOwnsCompetition(id, club);
        Competition comp = competitionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));
        competitionService.deleteCompetition(id);
        logAudit(userDetails, "Competition", id, "name", comp.getName(), null, "DELETE");
        return ResponseEntity.noContent().build();
    }

    // ── Participants ──────────────────────────────────────────────────────

    @GetMapping("/competitions/{id}/participants")
    public List<ParticipantResponse> getParticipants(@PathVariable Long id,
                                                     @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Club club = resolveClub(userDetails);
        assertOwnsCompetition(id, club);
        return participantRepository.findByCompetitionId(id).stream()
                .map(ParticipantResponse::from)
                .toList();
    }

    @DeleteMapping("/competitions/{compId}/participants/{userId}")
    public ResponseEntity<Void> removeParticipant(@PathVariable Long compId,
                                                  @PathVariable Long userId,
                                                  @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Club club = resolveClub(userDetails);
        assertOwnsCompetition(compId, club);
        CompetitionParticipant cp = participantRepository.findByCompetitionIdAndUserId(compId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Participant not found"));
        competitionService.removeParticipant(compId, userId);
        logAudit(userDetails, "CompetitionParticipant", cp.getId(), "userId", String.valueOf(userId), null, "REMOVE_PARTICIPANT");
        return ResponseEntity.noContent().build();
    }

    /** Returns IDs of users who have confirmed payment for this competition */
    @GetMapping("/competitions/{compId}/paid-users")
    public ResponseEntity<List<Long>> getPaidUsers(
            @PathVariable Long compId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Club club = resolveClub(userDetails);
        assertOwnsCompetition(compId, club);
        return ResponseEntity.ok(paymentRepository.findPaidUserIdsByCompetitionId(compId));
    }

    /** Record manual payment confirmation for a participant already registered in the competition */
    @PostMapping("/competitions/{compId}/mark-paid/{userId}")
    @Transactional
    public ResponseEntity<Void> markManualPayment(
            @PathVariable Long compId,
            @PathVariable Long userId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {

        Club club = resolveClub(userDetails);
        assertOwnsCompetition(compId, club);

        Competition comp = competitionRepository.findById(compId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));

        if (comp.getPaymentMode() != PaymentMode.MANUAL) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This competition does not use manual payment");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        // Verify the player is registered
        if (!participantRepository.existsByCompetitionIdAndUserId(compId, userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "User is not registered for this competition");
        }

        // Record payment confirmation if not already done
        Payment payment;
        if (!paymentRepository.existsByUserIdAndCompetitionIdAndStatus(
                userId, compId, Payment.PaymentStatus.SUCCEEDED)) {
            payment = new Payment(
                    user, comp, null,
                    comp.getEntryFee() != null
                            ? comp.getEntryFee().multiply(java.math.BigDecimal.valueOf(100)).intValue()
                            : 0,
                    "eur");
            payment.setStatus(Payment.PaymentStatus.SUCCEEDED);
            paymentRepository.save(payment);
        } else {
            payment = paymentRepository.findSucceededByCompetitionAndUser(compId, userId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment not found"));
        }

        log.info("Club admin {} confirmed manual payment from user {} for competition {}",
                userDetails.getUsername(), user.getUsername(), comp.getName());

        logAudit(userDetails, "Payment", payment.getId(), "status", null, "SUCCEEDED", "MARK_PAID");

        return ResponseEntity.ok().build();
    }

    /** Revert/undo a manual payment confirmation */
    @PostMapping("/competitions/{compId}/unmark-paid/{userId}")
    @Transactional
    public ResponseEntity<Void> unmarkManualPayment(
            @PathVariable Long compId,
            @PathVariable Long userId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {

        Club club = resolveClub(userDetails);
        assertOwnsCompetition(compId, club);

        Competition comp = competitionRepository.findById(compId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));

        if (comp.getPaymentMode() != PaymentMode.MANUAL) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This competition does not use manual payment");
        }

        Payment payment = paymentRepository.findSucceededByCompetitionAndUser(compId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No confirmed manual payment found for this user"));

        // Mark the payment as FAILED to indicate it is no longer confirmed (keeps audit trail)
        paymentRepository.updateStatus(payment.getId(), Payment.PaymentStatus.FAILED);

        log.info("Club admin {} reverted manual payment for user {} on competition {}",
                userDetails.getUsername(), userId, comp.getName());

        logAudit(userDetails, "Payment", payment.getId(), "status", "SUCCEEDED", "FAILED", "UNMARK_PAID");

        return ResponseEntity.ok().build();
    }

    @PostMapping("/competitions/{compId}/declare-winner/{userId}")
    @Transactional
    public ResponseEntity<CompetitionResponse> declareWinner(
            @PathVariable Long compId,
            @PathVariable Long userId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {

        Club club = resolveClub(userDetails);
        assertOwnsCompetition(compId, club);

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

        log.info("Club admin manually declared {} as winner of competition {}",
                winner.getUser().getUsername(), compId);

        logAudit(userDetails, "Competition", compId, "winnerUserId", null, String.valueOf(userId), "DECLARE_WINNER");

        int total = participantRepository.findByCompetitionId(compId).size();
        return ResponseEntity.ok(CompetitionResponse.from(comp, total, 1, winner.getUser().getUsername()));
    }

    @PostMapping("/competitions/{id}/sync-fixtures")
    public ResponseEntity<Map<String, Object>> syncFixtures(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        Club club = resolveClub(userDetails);
        assertOwnsCompetition(id, club);
        Competition comp = competitionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Competition not found"));
        int count = fixtureSyncService.syncForCompetition(comp);
        logAudit(userDetails, "Competition", id, "fixturesAdded", null, String.valueOf(count), "SYNC_FIXTURES");
        return ResponseEntity.ok(Map.of(
                "competitionId", id,
                "fixturesAdded", count,
                "message", count > 0
                        ? "Synced " + count + " new fixtures for \"" + comp.getName() + "\""
                        : "No new fixtures found — already up to date"
        ));
    }

    // ── User search ──────────────────────────────────────────────────────

    public record UserSearchResult(Long id, String username, String email, String role) {}

    @GetMapping("/users/search")
    public List<UserSearchResult> searchUsers(@RequestParam String q) {
        if (q == null || q.trim().length() < 2) return List.of();
        return userRepository.searchByUsernameOrEmail(q.trim()).stream()
                .limit(10)
                .map(u -> new UserSearchResult(u.getId(), u.getUsername(), u.getEmail(), u.getRole().name()))
                .toList();
    }

    // ── Add participant ──────────────────────────────────────────────────

    public record AddParticipantRequest(Long userId, String guestUsername, String guestEmail) {}

    @PostMapping("/competitions/{id}/add-participant")
    @Transactional
    public ResponseEntity<ParticipantResponse> addParticipant(
            @PathVariable Long id,
            @RequestBody AddParticipantRequest request,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {

        Club club = resolveClub(userDetails);
        assertOwnsCompetition(id, club);
        Competition comp = competitionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));

        User user;
        boolean createdGuest = false;
        if (request.userId() != null) {
            user = userRepository.findById(request.userId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        } else if (request.guestUsername() != null && !request.guestUsername().isBlank()) {
            String username = request.guestUsername().trim();
            String email = (request.guestEmail() != null && !request.guestEmail().isBlank())
                    ? request.guestEmail().trim()
                    : username.toLowerCase().replaceAll("\\s+", ".") + ".guest@lms.local";
            if (userRepository.existsByUsername(username))
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Username '" + username + "' already exists");
            if (userRepository.existsByEmail(email))
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already exists");
            user = new User(email, username, passwordEncoder.encode(java.util.UUID.randomUUID().toString()), Role.USER);
            user = userRepository.save(user);
            createdGuest = true;
            log.info("Club admin {} created guest '{}' for competition '{}'",
                    userDetails.getUsername(), username, comp.getName());
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide userId or guestUsername");
        }

        if (participantRepository.existsByCompetitionIdAndUserId(id, user.getId()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, user.getUsername() + " is already a participant");

        CompetitionParticipant cp = new CompetitionParticipant(comp, user, ParticipantStatus.ACTIVE);
        cp = participantRepository.save(cp);
                if (createdGuest) {
                        logAudit(userDetails, "User", user.getId(), "guest", null, user.getUsername(), "CREATE_GUEST");
                }
                logAudit(userDetails, "CompetitionParticipant", cp.getId(), "userId", null, String.valueOf(user.getId()), "ADD_PARTICIPANT");
        return ResponseEntity.status(HttpStatus.CREATED).body(ParticipantResponse.from(cp));
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private Club resolveClub(UserDetailsImpl userDetails) {
        // Super admins must have a club assigned to use this endpoint
        List<Club> clubs = clubRepository.findByClubAdminId(userDetails.getId());
        if (clubs.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "You are not assigned as admin of any club");
        }
        return clubs.get(0); // A user is admin of one club at a time
    }

    private void assertOwnsCompetition(Long competitionId, Club club) {
        Competition comp = competitionRepository.findById(competitionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));
        if (comp.getClub() == null || !comp.getClub().getId().equals(club.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "This competition does not belong to your club");
        }
    }

        private void logAudit(UserDetailsImpl actor, String entityType, Long entityId,
                                                  String fieldName, String oldValue, String newValue, String action) {
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
}
