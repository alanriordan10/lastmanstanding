package com.lastmanstanding.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "email", nullable = false, unique = true)
    private String email;

    @Column(name = "username", nullable = false, unique = true)
    private String username;

    @Column(name = "password_hash", nullable = true)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false)
    private Role role;

    @Column(name = "disabled", nullable = false)
    private boolean disabled = false;

    @Column(name = "oauth_provider")
    private String oauthProvider;

    @Column(name = "oauth_provider_id")
    private String oauthProviderId;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(name = "email_results_opt_in", nullable = false)
    private boolean emailResultsOptIn = false;

    @Column(name = "notification_pick_reminders", nullable = false)
    private boolean notificationPickReminders = true;

    @Column(name = "notification_result_updates", nullable = false)
    private boolean notificationResultUpdates = true;

    @Column(name = "notification_competition_announcements", nullable = false)
    private boolean notificationCompetitionAnnouncements = true;

    @Column(name = "notification_payment_updates", nullable = false)
    private boolean notificationPaymentUpdates = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    @Column(name = "last_login_ip", length = 64)
    private String lastLoginIp;

    public User() {
    }

    public User(String email, String username, String passwordHash, Role role) {
        this.email = email;
        this.username = username;
        this.passwordHash = passwordHash;
        this.role = role;
    }

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public Role getRole() {
        return role;
    }

    public void setRole(Role role) {
        this.role = role;
    }

    public boolean isDisabled() { return disabled; }
    public void setDisabled(boolean disabled) { this.disabled = disabled; }

    public String getOauthProvider() { return oauthProvider; }
    public void setOauthProvider(String oauthProvider) { this.oauthProvider = oauthProvider; }

    public String getOauthProviderId() { return oauthProviderId; }
    public void setOauthProviderId(String oauthProviderId) { this.oauthProviderId = oauthProviderId; }

    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }

    public boolean isEmailResultsOptIn() { return emailResultsOptIn; }
    public void setEmailResultsOptIn(boolean emailResultsOptIn) { this.emailResultsOptIn = emailResultsOptIn; }

    public boolean isNotificationPickReminders() { return notificationPickReminders; }
    public void setNotificationPickReminders(boolean notificationPickReminders) { this.notificationPickReminders = notificationPickReminders; }

    public boolean isNotificationResultUpdates() { return notificationResultUpdates; }
    public void setNotificationResultUpdates(boolean notificationResultUpdates) { this.notificationResultUpdates = notificationResultUpdates; }

    public boolean isNotificationCompetitionAnnouncements() { return notificationCompetitionAnnouncements; }
    public void setNotificationCompetitionAnnouncements(boolean notificationCompetitionAnnouncements) { this.notificationCompetitionAnnouncements = notificationCompetitionAnnouncements; }

    public boolean isNotificationPaymentUpdates() { return notificationPaymentUpdates; }
    public void setNotificationPaymentUpdates(boolean notificationPaymentUpdates) { this.notificationPaymentUpdates = notificationPaymentUpdates; }

    public LocalDateTime getCreatedAt() { return createdAt; }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public LocalDateTime getLastLoginAt() {
        return lastLoginAt;
    }

    public void setLastLoginAt(LocalDateTime lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }

    public String getLastLoginIp() {
        return lastLoginIp;
    }

    public void setLastLoginIp(String lastLoginIp) {
        this.lastLoginIp = lastLoginIp;
    }
}
