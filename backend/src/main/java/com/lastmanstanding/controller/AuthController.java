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
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
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
        @NotBlank String username,
        @NotBlank String email,
        @NotBlank @Size(min = 6) String password
    ) {}

    public record RegisterClubResponse(
        AuthResponse auth,
        Long clubId,
        String clubName
    ) {}

    public record UsernameAvailabilityResponse(boolean available, String message) {}
    public record EmailAvailabilityResponse(boolean available, String message) {}

    @PostMapping("/register-club")
    @Transactional
    public ResponseEntity<RegisterClubResponse> registerClub(
            @Valid @RequestBody RegisterClubRequest request) {

        if (userRepository.existsByEmail(request.email())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email is already in use");
        }
        if (userRepository.existsByUsernameIgnoreCase(request.username().trim())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username is already taken");
        }
        if (clubRepository.existsByName(request.clubName())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A club with that name already exists");
        }

        // Create the user as CLUB_ADMIN
        User user = new User(
                request.email(),
                request.username(),
                passwordEncoder.encode(request.password()),
                Role.CLUB_ADMIN);
        user = userRepository.save(user);

        // Create the club and assign this user as admin
        Club club = new Club(request.clubName(), request.clubDescription(), user);
        club.setClubAdmin(user);
        club = clubRepository.save(club);

        AuthResponse auth = buildAuthResponse(user);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new RegisterClubResponse(auth, club.getId(), club.getName()));
    }

    // ── Sign-up ─────────────────────────────────────────────────────────

    @GetMapping("/username-availability")
    public ResponseEntity<UsernameAvailabilityResponse> checkUsernameAvailability(
            @RequestParam @NotBlank @Size(min = 3, max = 30) String username) {
        String normalized = username.trim();
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
        if (userRepository.existsByEmail(request.email())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email is already in use");
        }
        if (userRepository.existsByUsernameIgnoreCase(request.username().trim())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username is already taken");
        }

        User user = new User(
                request.email(),
                request.username(),
                passwordEncoder.encode(request.password()),
                Role.USER);

        user = userRepository.save(user);

        return ResponseEntity.status(HttpStatus.CREATED).body(buildAuthResponse(user));
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
        if (clubRepository.existsByClubAdminId(user.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Transfer your club admin role before deleting your account");
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
                user.isEmailResultsOptIn());
    }
}
