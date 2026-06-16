package com.lastmanstanding.controller;

import com.lastmanstanding.dto.AuthDtos.AuthResponse;
import com.lastmanstanding.dto.AuthDtos.LoginRequest;
import com.lastmanstanding.dto.AuthDtos.RefreshRequest;
import com.lastmanstanding.dto.AuthDtos.SignupRequest;
import com.lastmanstanding.entity.Club;
import com.lastmanstanding.entity.PasswordResetToken;
import com.lastmanstanding.entity.Role;
import com.lastmanstanding.entity.User;
import com.lastmanstanding.repository.ClubRepository;
import com.lastmanstanding.repository.PasswordResetTokenRepository;
import com.lastmanstanding.repository.UserRepository;
import com.lastmanstanding.security.JwtService;
import com.lastmanstanding.service.GameweekEmailService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.lastmanstanding.security.UserDetailsImpl;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final ClubRepository clubRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final GameweekEmailService gameweekEmailService;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    public AuthController(UserRepository userRepository,
                          ClubRepository clubRepository,
                          JwtService jwtService,
                          PasswordEncoder passwordEncoder,
                          AuthenticationManager authenticationManager,
                          PasswordResetTokenRepository passwordResetTokenRepository,
                          GameweekEmailService gameweekEmailService) {
        this.userRepository = userRepository;
        this.clubRepository = clubRepository;
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.gameweekEmailService = gameweekEmailService;
    }

    // ── Club self-registration ───────────────────────────────────────────

    public record RegisterClubRequest(
        @NotBlank String clubName,
        String clubDescription,
        @NotBlank @Pattern(regexp = "\\S+", message = "Username cannot contain spaces") String username,
        @NotBlank String email,
        @NotBlank @Size(min = 6) String password
    ) {}

    public record RegisterClubResponse(
        AuthResponse auth,
        Long clubId,
        String clubName
    ) {}

    public record CreateClubRequest(
            @NotBlank String clubName,
            String clubDescription
    ) {}

    public record UsernameAvailabilityResponse(boolean available, String message) {}
    public record EmailAvailabilityResponse(boolean available, String message) {}

    @PostMapping("/register-club")
    @Transactional
    public ResponseEntity<RegisterClubResponse> registerClub(
            @Valid @RequestBody RegisterClubRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(createClubAndBuildResponse(
                        request.clubName(),
                        request.clubDescription(),
                        request.username(),
                        request.email(),
                        request.password(),
                        null));
    }

    @PostMapping("/create-club")
    @Transactional
    public ResponseEntity<RegisterClubResponse> createClub(
            @Valid @RequestBody CreateClubRequest request,
            @AuthenticationPrincipal UserDetailsImpl userDetails,
            HttpServletRequest httpRequest) {
        Long existingUserId = userDetails != null ? userDetails.getId() : resolveUserIdFromBearerToken(httpRequest);
        if (existingUserId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(createClubAndBuildResponse(
                        request.clubName(),
                        request.clubDescription(),
                        null,
                        null,
                        null,
                        existingUserId));
    }

    // ── Sign-up ─────────────────────────────────────────────────────────

    @GetMapping("/username-availability")
    public ResponseEntity<UsernameAvailabilityResponse> checkUsernameAvailability(
            @RequestParam @NotBlank @Size(min = 3, max = 30) String username) {
        String normalized = username.trim();
        if (containsUsernameWhitespace(normalized)) {
            return ResponseEntity.ok(new UsernameAvailabilityResponse(false, "Username cannot contain spaces"));
        }
        boolean available = !userRepository.existsByUsernameIgnoreCase(normalized);
        String message = available ? "Username is available" : "Username is already taken";
        return ResponseEntity.ok(new UsernameAvailabilityResponse(available, message));
    }

    @GetMapping("/email-availability")
    public ResponseEntity<EmailAvailabilityResponse> checkEmailAvailability(
            @RequestParam @NotBlank @Email String email) {
        String normalized = email.trim();
        boolean available = !userRepository.existsByEmail(normalized);
        String message = available ? "Email is available" : "Email is already in use";
        return ResponseEntity.ok(new EmailAvailabilityResponse(available, message));
    }

    @PostMapping("/signup")
    public ResponseEntity<AuthResponse> signup(@Valid @RequestBody SignupRequest request) {
        String normalizedUsername = normalizeUsername(request.username());
        String normalizedEmail = request.email().trim();
        if (userRepository.existsByEmail(normalizedEmail)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email is already in use");
        }
        if (userRepository.existsByUsernameIgnoreCase(normalizedUsername)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username is already taken");
        }

        User user = new User(
                normalizedEmail,
                normalizedUsername,
                passwordEncoder.encode(request.password()),
                Role.USER);

        user = userRepository.save(user);

        return ResponseEntity.status(HttpStatus.CREATED).body(buildAuthResponse(user));
    }

    private static String normalizeUsername(String username) {
        String normalized = username.trim();
        if (containsUsernameWhitespace(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Username cannot contain spaces");
        }
        return normalized;
    }

    private static boolean containsUsernameWhitespace(String username) {
        return username.chars().anyMatch(Character::isWhitespace);
    }

    private Long resolveUserIdFromBearerToken(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return null;
        }
        String token = authHeader.substring(7);
        if (!jwtService.isTokenValid(token)) {
            return null;
        }
        try {
            return jwtService.extractUserId(token);
        } catch (RuntimeException ex) {
            return null;
        }
    }

    private RegisterClubResponse createClubAndBuildResponse(
            String clubName,
            String clubDescription,
            String username,
            String email,
            String password,
            Long existingUserId) {
        String trimmedClubName = clubName == null ? null : clubName.trim();
        if (trimmedClubName == null || trimmedClubName.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Club name is required");
        }
        if (clubRepository.existsByName(trimmedClubName)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A club with that name already exists");
        }

        User user;
        if (existingUserId != null) {
            user = userRepository.findById(existingUserId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
            if (!clubRepository.findByClubAdminId(user.getId()).isEmpty()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "You already manage a club");
            }
            if (user.getRole() == Role.USER) {
                user.setRole(Role.CLUB_ADMIN);
                user = userRepository.save(user);
            }
        } else {
            String normalizedUsername = normalizeUsername(username);
            String normalizedEmail = email == null ? null : email.trim();
            if (normalizedEmail == null || normalizedEmail.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email is required");
            }
            if (password == null || password.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password is required");
            }
            if (userRepository.existsByEmail(normalizedEmail)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Email is already in use");
            }
            if (userRepository.existsByUsernameIgnoreCase(normalizedUsername)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Username is already taken");
            }

            user = new User(
                    normalizedEmail,
                    normalizedUsername,
                    passwordEncoder.encode(password),
                    Role.CLUB_ADMIN);
            user = userRepository.save(user);
        }

        Club club = new Club(trimmedClubName, clubDescription, user);
        club.setClubAdmin(user);
        club = clubRepository.save(club);

        AuthResponse auth = buildAuthResponse(user);
        return new RegisterClubResponse(auth, club.getId(), club.getName());
    }

    // ── Login ───────────────────────────────────────────────────────────

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.email(), request.password()));

        User user = userRepository.findByEmail(request.email())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "Invalid credentials"));

        return ResponseEntity.ok(buildAuthResponse(user));
    }

    // ── Refresh token ───────────────────────────────────────────────────

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@Valid @RequestBody RefreshRequest request) {
        if (!jwtService.isTokenValid(request.refreshToken())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired refresh token");
        }

        Long userId = jwtService.extractUserId(request.refreshToken());

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "User not found"));

        return ResponseEntity.ok(buildAuthResponse(user));
    }

    // ── Me ───────────────────────────────────────────────────────────────

    @GetMapping("/me")
    public ResponseEntity<AuthResponse> me(@AuthenticationPrincipal UserDetailsImpl userDetails) {
        if (userDetails == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
        }
        User user = userRepository.findById(userDetails.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        return ResponseEntity.ok(buildAuthResponse(user));
    }

    // ── Logout (stateless — no server-side work needed) ─────────────────

    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        // With stateless JWT there is no server-side session to invalidate.
        // The client should discard its tokens.
        return ResponseEntity.ok().build();
    }

    // ── Email preferences ────────────────────────────────────────────────

    public record EmailPreferencesRequest(boolean emailResultsOptIn) {}
    public record EmailPreferencesResponse(boolean emailResultsOptIn) {}
    public record NotificationPreferencesRequest(
            Boolean emailResultsOptIn,
            Boolean notificationPickReminders,
            Boolean notificationResultUpdates,
            Boolean notificationCompetitionAnnouncements,
            Boolean notificationPaymentUpdates) {}
    public record NotificationPreferencesResponse(
            boolean emailResultsOptIn,
            boolean notificationPickReminders,
            boolean notificationResultUpdates,
            boolean notificationCompetitionAnnouncements,
            boolean notificationPaymentUpdates) {
        static NotificationPreferencesResponse from(User user) {
            return new NotificationPreferencesResponse(
                    user.isEmailResultsOptIn(),
                    user.isNotificationPickReminders(),
                    user.isNotificationResultUpdates(),
                    user.isNotificationCompetitionAnnouncements(),
                    user.isNotificationPaymentUpdates());
        }
    }
    public record DeleteAccountRequest(String deleteToken, String confirmText) {}
    public record DeleteTokenRequest(String password) {}
    public record DeleteTokenResponse(String deleteToken, long expiresInSeconds) {}

    @PutMapping("/email-preferences")
    public ResponseEntity<EmailPreferencesResponse> updateEmailPreferences(
            @AuthenticationPrincipal UserDetailsImpl principal,
            @RequestBody EmailPreferencesRequest request) {
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        user.setEmailResultsOptIn(request.emailResultsOptIn());
        userRepository.save(user);
        return ResponseEntity.ok(new EmailPreferencesResponse(user.isEmailResultsOptIn()));
    }

    @GetMapping("/email-preferences")
    public ResponseEntity<EmailPreferencesResponse> getEmailPreferences(
            @AuthenticationPrincipal UserDetailsImpl principal) {
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        return ResponseEntity.ok(new EmailPreferencesResponse(user.isEmailResultsOptIn()));
    }

    @GetMapping("/notification-preferences")
    public ResponseEntity<NotificationPreferencesResponse> getNotificationPreferences(
            @AuthenticationPrincipal UserDetailsImpl principal) {
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        return ResponseEntity.ok(NotificationPreferencesResponse.from(user));
    }

    @PutMapping("/notification-preferences")
    public ResponseEntity<NotificationPreferencesResponse> updateNotificationPreferences(
            @AuthenticationPrincipal UserDetailsImpl principal,
            @RequestBody NotificationPreferencesRequest request) {
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        if (request.emailResultsOptIn() != null) user.setEmailResultsOptIn(request.emailResultsOptIn());
        if (request.notificationPickReminders() != null) user.setNotificationPickReminders(request.notificationPickReminders());
        if (request.notificationResultUpdates() != null) user.setNotificationResultUpdates(request.notificationResultUpdates());
        if (request.notificationCompetitionAnnouncements() != null) user.setNotificationCompetitionAnnouncements(request.notificationCompetitionAnnouncements());
        if (request.notificationPaymentUpdates() != null) user.setNotificationPaymentUpdates(request.notificationPaymentUpdates());
        userRepository.save(user);
        return ResponseEntity.ok(NotificationPreferencesResponse.from(user));
    }

    @PostMapping("/delete-token")
    public ResponseEntity<DeleteTokenResponse> issueDeleteToken(
            @AuthenticationPrincipal UserDetailsImpl principal,
            @RequestBody DeleteTokenRequest request) {
        if (principal == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        if (user.getPasswordHash() != null && !user.getPasswordHash().isBlank()) {
            if (request == null || request.password() == null || request.password().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password is required");
            }
            if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect password");
            }
        }
        long expiresInSeconds = 300; // 5 minutes
        String token = jwtService.generateDeleteToken(user, expiresInSeconds * 1000);
        return ResponseEntity.ok(new DeleteTokenResponse(token, expiresInSeconds));
    }

    @DeleteMapping("/me")
    @Transactional
    public ResponseEntity<Void> deleteMyAccount(
            @AuthenticationPrincipal UserDetailsImpl principal,
            @RequestBody(required = false) DeleteAccountRequest request) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
        }
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));

        if (request == null || request.confirmText() == null || !"DELETE ACCOUNT".equals(request.confirmText().trim().toUpperCase())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Type DELETE ACCOUNT to confirm account deletion");
        }
        if (request.deleteToken() == null || request.deleteToken().isBlank() ||
                !jwtService.isDeleteTokenValidForUser(request.deleteToken(), user.getId())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Delete verification expired. Re-enter your password.");
        }
        var adminClubs = clubRepository.findByClubAdminId(user.getId());
        if (!adminClubs.isEmpty()) {
            String clubNames = adminClubs.stream()
                    .map(Club::getName)
                    .filter(name -> name != null && !name.isBlank())
                    .limit(3)
                    .collect(Collectors.joining(", "));
            String suffix = adminClubs.size() > 3 ? " (+" + (adminClubs.size() - 3) + " more)" : "";
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "You are still club admin for: " + clubNames + suffix + ". Transfer club admin role before deleting your account"
            );
        }

        // Soft-delete for data integrity and audit history preservation.
        String marker = "deleted-" + user.getId() + "-" + System.currentTimeMillis();
        user.setDisabled(true);
        user.setEmail(marker + "@deleted.local");
        user.setUsername(marker);
        user.setPasswordHash(null);
        user.setOauthProvider(null);
        user.setOauthProviderId(null);
        user.setAvatarUrl(null);
        user.setEmailResultsOptIn(false);
        userRepository.save(user);
        passwordResetTokenRepository.deleteByUserId(user.getId());
        return ResponseEntity.noContent().build();
    }

    // ── Forgot password ──────────────────────────────────────────────────

    public record ForgotPasswordRequest(@NotBlank @Email String email) {}

    @PostMapping("/forgot-password")
    @Transactional
    public ResponseEntity<Void> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        // Always return 200 to avoid leaking whether an email exists
        userRepository.findByEmail(request.email()).ifPresent(user -> {
            // Invalidate any existing tokens for this user
            passwordResetTokenRepository.deleteByUserId(user.getId());

            String token = UUID.randomUUID().toString();
            LocalDateTime expiresAt = LocalDateTime.now().plusHours(1);
            passwordResetTokenRepository.save(new PasswordResetToken(user, token, expiresAt));

            String resetLink = frontendUrl + "/reset-password?token=" + token;
            gameweekEmailService.sendPasswordResetEmail(user.getEmail(), user.getUsername(), resetLink);
        });
        return ResponseEntity.ok().build();
    }

    // ── Reset password ──────────────────────────────────────────��────────

    public record ResetPasswordRequest(
        @NotBlank String token,
        @NotBlank @Size(min = 8, message = "Password must be at least 8 characters") String newPassword
    ) {}

    @PostMapping("/reset-password")
    @Transactional
    public ResponseEntity<Void> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        PasswordResetToken prt = passwordResetTokenRepository.findByToken(request.token())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid or expired reset token"));

        if (prt.isUsed() || prt.isExpired()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid or expired reset token");
        }

        User user = prt.getUser();
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);

        prt.setUsed(true);
        passwordResetTokenRepository.save(prt);

        return ResponseEntity.ok().build();
    }

    // ── Helper ──────────────────────────────────────────────────────────

    private AuthResponse buildAuthResponse(User user) {
        String accessToken = jwtService.generateAccessToken(user);
        String refreshToken = jwtService.generateRefreshToken(user);

        return new AuthResponse(
                accessToken,
                refreshToken,
                user.getId(),
                user.getEmail(),
                user.getUsername(),
                user.getRole().name(),
                user.isEmailResultsOptIn(),
                user.isNotificationPickReminders(),
                user.isNotificationResultUpdates(),
                user.isNotificationCompetitionAnnouncements(),
                user.isNotificationPaymentUpdates());
    }
}
