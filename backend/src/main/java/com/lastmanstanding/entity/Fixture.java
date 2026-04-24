package com.lastmanstanding.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "fixtures")
public class Fixture {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "gameweek_id", nullable = false)
    private Gameweek gameweek;

    @Column(name = "external_fixture_id")
    private String externalFixtureId;

    // --- Imported (from external API) ---

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "imported_home_team_id", nullable = false)
    private Team importedHomeTeam;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "imported_away_team_id", nullable = false)
    private Team importedAwayTeam;

    @Column(name = "imported_kickoff_at", nullable = false)
    private LocalDateTime importedKickoffAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "imported_status", nullable = false)
    private FixtureStatus importedStatus;

    @Column(name = "imported_score_home")
    private Integer importedScoreHome;

    @Column(name = "imported_score_away")
    private Integer importedScoreAway;

    // --- Override (admin manual corrections) ---

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "override_home_team_id")
    private Team overrideHomeTeam;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "override_away_team_id")
    private Team overrideAwayTeam;

    @Column(name = "override_kickoff_at")
    private LocalDateTime overrideKickoffAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "override_status")
    private FixtureStatus overrideStatus;

    @Column(name = "override_score_home")
    private Integer overrideScoreHome;

    @Column(name = "override_score_away")
    private Integer overrideScoreAway;

    // --- Metadata ---

    @Column(name = "last_synced_at")
    private LocalDateTime lastSyncedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public Fixture() {
    }

    public Fixture(Gameweek gameweek, String externalFixtureId, Team importedHomeTeam,
                   Team importedAwayTeam, LocalDateTime importedKickoffAt,
                   FixtureStatus importedStatus) {
        this.gameweek = gameweek;
        this.externalFixtureId = externalFixtureId;
        this.importedHomeTeam = importedHomeTeam;
        this.importedAwayTeam = importedAwayTeam;
        this.importedKickoffAt = importedKickoffAt;
        this.importedStatus = importedStatus;
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

    // --- Effective getters (override wins if non-null) ---

    public Team getEffectiveHomeTeam() {
        return overrideHomeTeam != null ? overrideHomeTeam : importedHomeTeam;
    }

    public Team getEffectiveAwayTeam() {
        return overrideAwayTeam != null ? overrideAwayTeam : importedAwayTeam;
    }

    public LocalDateTime getEffectiveKickoffAt() {
        return overrideKickoffAt != null ? overrideKickoffAt : importedKickoffAt;
    }

    public FixtureStatus getEffectiveStatus() {
        return overrideStatus != null ? overrideStatus : importedStatus;
    }

    public Integer getEffectiveScoreHome() {
        return overrideScoreHome != null ? overrideScoreHome : importedScoreHome;
    }

    public Integer getEffectiveScoreAway() {
        return overrideScoreAway != null ? overrideScoreAway : importedScoreAway;
    }

    // --- Standard getters and setters ---

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Gameweek getGameweek() {
        return gameweek;
    }

    public void setGameweek(Gameweek gameweek) {
        this.gameweek = gameweek;
    }

    public String getExternalFixtureId() {
        return externalFixtureId;
    }

    public void setExternalFixtureId(String externalFixtureId) {
        this.externalFixtureId = externalFixtureId;
    }

    public Team getImportedHomeTeam() {
        return importedHomeTeam;
    }

    public void setImportedHomeTeam(Team importedHomeTeam) {
        this.importedHomeTeam = importedHomeTeam;
    }

    public Team getImportedAwayTeam() {
        return importedAwayTeam;
    }

    public void setImportedAwayTeam(Team importedAwayTeam) {
        this.importedAwayTeam = importedAwayTeam;
    }

    public LocalDateTime getImportedKickoffAt() {
        return importedKickoffAt;
    }

    public void setImportedKickoffAt(LocalDateTime importedKickoffAt) {
        this.importedKickoffAt = importedKickoffAt;
    }

    public FixtureStatus getImportedStatus() {
        return importedStatus;
    }

    public void setImportedStatus(FixtureStatus importedStatus) {
        this.importedStatus = importedStatus;
    }

    public Integer getImportedScoreHome() {
        return importedScoreHome;
    }

    public void setImportedScoreHome(Integer importedScoreHome) {
        this.importedScoreHome = importedScoreHome;
    }

    public Integer getImportedScoreAway() {
        return importedScoreAway;
    }

    public void setImportedScoreAway(Integer importedScoreAway) {
        this.importedScoreAway = importedScoreAway;
    }

    public Team getOverrideHomeTeam() {
        return overrideHomeTeam;
    }

    public void setOverrideHomeTeam(Team overrideHomeTeam) {
        this.overrideHomeTeam = overrideHomeTeam;
    }

    public Team getOverrideAwayTeam() {
        return overrideAwayTeam;
    }

    public void setOverrideAwayTeam(Team overrideAwayTeam) {
        this.overrideAwayTeam = overrideAwayTeam;
    }

    public LocalDateTime getOverrideKickoffAt() {
        return overrideKickoffAt;
    }

    public void setOverrideKickoffAt(LocalDateTime overrideKickoffAt) {
        this.overrideKickoffAt = overrideKickoffAt;
    }

    public FixtureStatus getOverrideStatus() {
        return overrideStatus;
    }

    public void setOverrideStatus(FixtureStatus overrideStatus) {
        this.overrideStatus = overrideStatus;
    }

    public Integer getOverrideScoreHome() {
        return overrideScoreHome;
    }

    public void setOverrideScoreHome(Integer overrideScoreHome) {
        this.overrideScoreHome = overrideScoreHome;
    }

    public Integer getOverrideScoreAway() {
        return overrideScoreAway;
    }

    public void setOverrideScoreAway(Integer overrideScoreAway) {
        this.overrideScoreAway = overrideScoreAway;
    }

    public LocalDateTime getLastSyncedAt() {
        return lastSyncedAt;
    }

    public void setLastSyncedAt(LocalDateTime lastSyncedAt) {
        this.lastSyncedAt = lastSyncedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
