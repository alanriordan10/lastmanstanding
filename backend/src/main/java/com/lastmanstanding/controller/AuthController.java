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
import com.lastmanstanding.security.AuthCookieService;
import com.lastmanstanding.security.JwtService;
import com.lastmanstanding.service.GameweekEmailService;
import com.lastmanstanding.service.RateLimitService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.util.UriComponentsBuilder;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.LocalDateTime;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final UserRepository userRepository;
    private final ClubRepository clubRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final GameweekEmailService gameweekEmailService;
    private final RateLimitService rateLimitService;
    private final AuthCookieService authCookieService;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    public AuthController(UserRepository userRepository,
                          ClubRepository clubRepository,
                          JwtService jwtService,
                          PasswordEncoder passwordEncoder,
                          AuthenticationManager authenticationManager,
                          PasswordResetTokenRepository passwordResetTokenRepository,
                          GameweekEmailService gameweekEmailService,
                          RateLimitService rateLimitService,
                          AuthCookieService authCookieService) {
        this.userRepository = userRepository;
        this.clubRepository = clubRepository;
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.gameweekEmailService = gameweekEmailService;
        this.rateLimitService = rateLimitService;
        this.authCookieService = authCookieService;
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
    public ResponseEntity<AuthResponse> signup(@Valid @RequestBody SignupRequest request, HttpServletRequest httpRequest) {
        String normalizedUsername = normalizeUsername(request.username());
        String normalizedEmail = request.email().trim();
        String ip = resolveClientIp(httpRequest);

        // Rate limit by IP first.
        if (rateLimitService.isSignupIpLimited(ip)) {
            long retryAfter = rateLimitService.signupIpRetryAfterSeconds(ip);
            throw new RateLimitedException(
                    "Too many signup attempts. Try again in " + formatMinutes(retryAfter) + ".",
                    retryAfter);
        }
        rateLimitService.recordSignupAttempt(ip);

        // Generic outcome: don't leak whether email or username is taken.
        // The frontend already checks /email-availability and
        // /username-availability before submitting, so the user will see
        // the conflict via those endpoints in the normal happy path.
        boolean emailTaken = userRepository.existsByEmail(normalizedEmail);
        boolean usernameTaken = userRepository.existsByUsernameIgnoreCase(normalizedUsername);
        if (emailTaken || usernameTaken) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "If the details are valid, your account will be created.");
        }

        User user = new User(
                normalizedEmail,
                normalizedUsername,
                passwordEncoder.encode(request.password()),
                Role.USER);

        user = userRepository.save(user);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(buildAuthResponseAndSetCookies(user, httpRequest, null));
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
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        String email = request.email() == null ? null : request.email().trim().toLowerCase();
        String ip = resolveClientIp(httpRequest);

        if (rateLimitService.isEmailLimited(email)) {
            long retryAfter = rateLimitService.emailRetryAfterSeconds(email);
            throw new RateLimitedException(
                    "Too many failed login attempts for this account. Try again in " + formatMinutes(retryAfter) + ".",
                    retryAfter);
        }
        if (rateLimitService.isIpLimited(ip)) {
            long retryAfter = rateLimitService.ipRetryAfterSeconds(ip);
            throw new RateLimitedException(
                    "Too many failed login attempts from this network. Try again in " + formatMinutes(retryAfter) + ".",
                    retryAfter);
        }

        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(email, request.password()));
        } catch (org.springframework.security.core.AuthenticationException ex) {
            rateLimitService.recordFailedAttempt(email, ip);
            int remaining = rateLimitService.remainingAttemptsForEmail(email);
            throw new LoginFailedException("Invalid credentials", remaining);
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> {
                    rateLimitService.recordFailedAttempt(email, ip);
                    int remaining = rateLimitService.remainingAttemptsForEmail(email);
                    return new LoginFailedException("Invalid credentials", remaining);
                });

        rateLimitService.recordSuccessfulLogin(email, ip);

        java.time.LocalDateTime previousLoginAt = user.getLastLoginAt();
        String previousLoginIp = user.getLastLoginIp();
        user.setLastLoginAt(java.time.LocalDateTime.now());
        user.setLastLoginIp(ip);
        userRepository.save(user);

        return ResponseEntity.ok(buildAuthResponseAndSetCookies(user, httpRequest, new java.util.AbstractMap.SimpleEntry<>(previousLoginAt, previousLoginIp)));
    }

    private static String resolveClientIp(HttpServletRequest request) {
        if (request == null) return null;
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            int comma = xff.indexOf(',');
            return normaliseIp(comma > 0 ? xff.substring(0, comma).trim() : xff.trim());
        }
        String real = request.getHeader("X-Real-IP");
        if (real != null && !real.isBlank()) return normaliseIp(real.trim());
        return normaliseIp(request.getRemoteAddr());
    }

    private static String normaliseIp(String ip) {
        if (ip == null || ip.isBlank()) return null;
        if (ip.equals("127.0.0.1") || ip.equals("0:0:0:0:0:0:0:1") || ip.equals("::1")) return "localhost";
        if (ip.startsWith("::ffff:")) {
            String v4 = ip.substring(7);
            if (v4.equals("127.0.0.1")) return "localhost";
            return v4;
        }
        return ip;
    }

    private static String formatMinutes(long totalSeconds) {
        long minutes = totalSeconds / 60;
        long seconds = totalSeconds % 60;
        if (minutes <= 0) return seconds + " second" + (seconds == 1 ? "" : "s");
        return minutes + " minute" + (minutes == 1 ? "" : "s");
    }

    // ── Refresh token ───────────────────────────────────────────────────

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@Valid @RequestBody RefreshRequest request, HttpServletRequest httpRequest) {
        String refreshToken = request.refreshToken() != null && !request.refreshToken().isBlank()
                ? request.refreshToken()
                : authCookieService.readRefreshToken(httpRequest);

        if (refreshToken == null || !jwtService.isTokenValid(refreshToken)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired refresh token");
        }

        Long userId = jwtService.extractUserId(refreshToken);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "User not found"));

        return ResponseEntity.ok(buildAuthResponseAndSetCookies(user, httpRequest, null));
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
    public ResponseEntity<Void> logout(jakarta.servlet.http.HttpServletResponse response) {
        authCookieService.clearAll(response);
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
    public record CookieProbeResponse(
            boolean hadProbeCookie,
            boolean hasAccessTokenCookie,
            boolean hasRefreshTokenCookie,
            boolean secure,
            String sameSite,
            String host,
            String origin,
            String forwardedProto,
            String userAgent) {}

    @GetMapping("/cookie-probe")
    public ResponseEntity<CookieProbeResponse> cookieProbe(HttpServletRequest request, HttpServletResponse response) {
        boolean hadProbeCookie = authCookieService.hasCookie(request, AuthCookieService.COOKIE_PROBE);
        boolean hasAccessTokenCookie = authCookieService.hasCookie(request, AuthCookieService.ACCESS_TOKEN_COOKIE);
        boolean hasRefreshTokenCookie = authCookieService.hasCookie(request, AuthCookieService.REFRESH_TOKEN_COOKIE);

        authCookieService.writeProbeCookie(response);

        return ResponseEntity.ok(new CookieProbeResponse(
                hadProbeCookie,
                hasAccessTokenCookie,
                hasRefreshTokenCookie,
                authCookieService.isSecure(),
                authCookieService.getSameSite(),
                request.getHeader("Host"),
                request.getHeader("Origin"),
                request.getHeader("X-Forwarded-Proto"),
                request.getHeader("User-Agent")));
    }

    private void logMissingPrincipal(String endpoint, HttpServletRequest request) {
        String userAgent = request != null ? request.getHeader("User-Agent") : null;
        log.warn("auth_preference_unauthorized endpoint={} userAgent={} reason=principal_null", endpoint, userAgent);
    }

    @PutMapping("/email-preferences")
    public ResponseEntity<EmailPreferencesResponse> updateEmailPreferences(
            @AuthenticationPrincipal UserDetailsImpl principal,
            HttpServletRequest request,
            @RequestBody EmailPreferencesRequest requestBody) {
        if (principal == null) {
            logMissingPrincipal("/auth/email-preferences", request);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
        }
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        user.setEmailResultsOptIn(requestBody.emailResultsOptIn());
        userRepository.save(user);
        return ResponseEntity.ok(new EmailPreferencesResponse(user.isEmailResultsOptIn()));
    }

    @GetMapping("/email-preferences")
    public ResponseEntity<EmailPreferencesResponse> getEmailPreferences(
            @AuthenticationPrincipal UserDetailsImpl principal,
            HttpServletRequest request) {
        if (principal == null) {
            logMissingPrincipal("/auth/email-preferences", request);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
        }
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        return ResponseEntity.ok(new EmailPreferencesResponse(user.isEmailResultsOptIn()));
    }

    @GetMapping("/notification-preferences")
    public ResponseEntity<NotificationPreferencesResponse> getNotificationPreferences(
            @AuthenticationPrincipal UserDetailsImpl principal,
            HttpServletRequest request) {
        if (principal == null) {
            logMissingPrincipal("/auth/notification-preferences", request);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
        }
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        return ResponseEntity.ok(NotificationPreferencesResponse.from(user));
    }

    @PutMapping("/notification-preferences")
    public ResponseEntity<NotificationPreferencesResponse> updateNotificationPreferences(
            @AuthenticationPrincipal UserDetailsImpl principal,
            HttpServletRequest request,
            @RequestBody NotificationPreferencesRequest requestBody) {
        if (principal == null) {
            logMissingPrincipal("/auth/notification-preferences", request);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
        }
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        if (requestBody.emailResultsOptIn() != null) user.setEmailResultsOptIn(requestBody.emailResultsOptIn());
        if (requestBody.notificationPickReminders() != null) user.setNotificationPickReminders(requestBody.notificationPickReminders());
        if (requestBody.notificationResultUpdates() != null) user.setNotificationResultUpdates(requestBody.notificationResultUpdates());
        if (requestBody.notificationCompetitionAnnouncements() != null) user.setNotificationCompetitionAnnouncements(requestBody.notificationCompetitionAnnouncements());
        if (requestBody.notificationPaymentUpdates() != null) user.setNotificationPaymentUpdates(requestBody.notificationPaymentUpdates());
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
    public ResponseEntity<Void> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request,
                                              HttpServletRequest httpRequest) {
        String email = request.email() == null ? null : request.email().trim().toLowerCase();
        String ip = resolveClientIp(httpRequest);

        if (rateLimitService.isForgotPasswordIpLimited(ip)) {
            long retryAfter = rateLimitService.forgotPasswordIpRetryAfterSeconds(ip);
            throw new RateLimitedException(
                    "Too many reset attempts from this network. Try again in " + formatMinutes(retryAfter) + ".",
                    retryAfter);
        }
        if (rateLimitService.isForgotPasswordEmailLimited(email)) {
            long retryAfter = rateLimitService.forgotPasswordEmailRetryAfterSeconds(email);
            throw new RateLimitedException(
                    "Too many reset attempts for this account. Try again in " + formatMinutes(retryAfter) + ".",
                    retryAfter);
        }
        rateLimitService.recordForgotPasswordAttempt(email, ip);

        // Always return 200 with a generic-sounding success, but record the
        // attempt either way so attackers can't enumerate by timing.
        final String effectiveEmail = email;
        userRepository.findByEmail(effectiveEmail).ifPresent(user -> {
            passwordResetTokenRepository.deleteByUserId(user.getId());

            String token = UUID.randomUUID().toString();
            LocalDateTime expiresAt = LocalDateTime.now().plusHours(1);
            passwordResetTokenRepository.save(new PasswordResetToken(user, token, expiresAt));

            String resetLink = UriComponentsBuilder.fromHttpUrl(frontendUrl)
                    .path("/reset-password")
                    .queryParam("token", token)
                    .toUriString();
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
        return buildAuthResponseWithLastLogin(user, user.getLastLoginAt(), user.getLastLoginIp());
    }

    private AuthResponse buildAuthResponseWithLastLogin(User user, java.time.LocalDateTime lastLoginAt, String lastLoginIp) {
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
                user.isNotificationPaymentUpdates(),
                lastLoginAt,
                lastLoginIp);
    }

    /**
     * Issue fresh tokens, set them as httpOnly cookies, and return the user
     * summary. The body still includes tokens so non-cookie clients (mobile app)
     * keep working — the SPA frontend ignores them.
     */
    private AuthResponse buildAuthResponseAndSetCookies(
            User user,
            HttpServletRequest httpRequest,
            java.util.Map.Entry<java.time.LocalDateTime, String> previousLogin) {
        String accessToken = jwtService.generateAccessToken(user);
        String refreshToken = jwtService.generateRefreshToken(user);

        jakarta.servlet.http.HttpServletResponse response = currentHttpResponse();
        if (response != null) {
            authCookieService.writeAccessToken(response, accessToken);
            authCookieService.writeRefreshToken(response, refreshToken);
        }

        java.time.LocalDateTime lastLoginAt = previousLogin != null ? previousLogin.getKey() : user.getLastLoginAt();
        String lastLoginIp = previousLogin != null ? previousLogin.getValue() : user.getLastLoginIp();

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
                user.isNotificationPaymentUpdates(),
                lastLoginAt,
                lastLoginIp);
    }

    /**
     * Spring's RequestContextHolder lets us reach the current HttpServletResponse
     * from a controller method without taking it as a parameter everywhere.
     */
    private static jakarta.servlet.http.HttpServletResponse currentHttpResponse() {
        org.springframework.web.context.request.ServletRequestAttributes attrs = (org.springframework.web.context.request.ServletRequestAttributes)
                org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
        return attrs != null ? attrs.getResponse() : null;
    }
}