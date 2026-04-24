package com.lastmanstanding.service;

import com.lastmanstanding.entity.*;
import com.lastmanstanding.repository.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class AdminService {

    private final FixtureRepository fixtureRepository;
    private final TeamRepository teamRepository;
    private final AuditLogRepository auditLogRepository;
    private final UserRepository userRepository;
    private final FixtureSyncService fixtureSyncService;

    public AdminService(FixtureRepository fixtureRepository,
                        TeamRepository teamRepository,
                        AuditLogRepository auditLogRepository,
                        UserRepository userRepository,
                        FixtureSyncService fixtureSyncService) {
        this.fixtureRepository = fixtureRepository;
        this.teamRepository = teamRepository;
        this.auditLogRepository = auditLogRepository;
        this.userRepository = userRepository;
        this.fixtureSyncService = fixtureSyncService;
    }

    public void triggerSync() {
        fixtureSyncService.fullSync();
    }

    @Transactional
    public Fixture overrideFixture(Long fixtureId, FixtureOverrideRequest request, Long adminUserId) {
        Fixture fixture = fixtureRepository.findById(fixtureId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Fixture not found"));

        User admin = userRepository.findById(adminUserId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Admin not found"));

        if (request.homeTeamId() != null) {
            Team oldTeam = fixture.getOverrideHomeTeam();
            Team newTeam = teamRepository.findById(request.homeTeamId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Home team not found"));
            logOverride(admin, fixture.getId(), "homeTeam",
                    oldTeam != null ? oldTeam.getName() : null, newTeam.getName());
            fixture.setOverrideHomeTeam(newTeam);
        }

        if (request.awayTeamId() != null) {
            Team oldTeam = fixture.getOverrideAwayTeam();
            Team newTeam = teamRepository.findById(request.awayTeamId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Away team not found"));
            logOverride(admin, fixture.getId(), "awayTeam",
                    oldTeam != null ? oldTeam.getName() : null, newTeam.getName());
            fixture.setOverrideAwayTeam(newTeam);
        }

        if (request.kickoffAt() != null) {
            logOverride(admin, fixture.getId(), "kickoffAt",
                    fixture.getOverrideKickoffAt() != null ? fixture.getOverrideKickoffAt().toString() : null,
                    request.kickoffAt().toString());
            fixture.setOverrideKickoffAt(request.kickoffAt());
        }

        if (request.status() != null) {
            logOverride(admin, fixture.getId(), "status",
                    fixture.getOverrideStatus() != null ? fixture.getOverrideStatus().name() : null,
                    request.status().name());
            fixture.setOverrideStatus(request.status());
        }

        if (request.scoreHome() != null) {
            logOverride(admin, fixture.getId(), "scoreHome",
                    fixture.getOverrideScoreHome() != null ? fixture.getOverrideScoreHome().toString() : null,
                    request.scoreHome().toString());
            fixture.setOverrideScoreHome(request.scoreHome());
        }

        if (request.scoreAway() != null) {
            logOverride(admin, fixture.getId(), "scoreAway",
                    fixture.getOverrideScoreAway() != null ? fixture.getOverrideScoreAway().toString() : null,
                    request.scoreAway().toString());
            fixture.setOverrideScoreAway(request.scoreAway());
        }

        return fixtureRepository.save(fixture);
    }

    @Transactional
    public Fixture revertOverrides(Long fixtureId, Long adminUserId) {
        Fixture fixture = fixtureRepository.findById(fixtureId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Fixture not found"));

        User admin = userRepository.findById(adminUserId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Admin not found"));

        AuditLog revertLog = new AuditLog(admin, "Fixture", fixture.getId(),
                null, null, null, "REVERT_ALL_OVERRIDES");
        auditLogRepository.save(revertLog);

        fixture.setOverrideHomeTeam(null);
        fixture.setOverrideAwayTeam(null);
        fixture.setOverrideKickoffAt(null);
        fixture.setOverrideStatus(null);
        fixture.setOverrideScoreHome(null);
        fixture.setOverrideScoreAway(null);

        return fixtureRepository.save(fixture);
    }

    public Page<AuditLog> getAuditLogs(Pageable pageable) {
        return auditLogRepository.findAllByOrderByCreatedAtDesc(pageable);
    }

    public List<AuditLog> getAuditLogsForFixture(Long fixtureId) {
        return auditLogRepository.findByEntityTypeAndEntityIdOrderByCreatedAtDesc("Fixture", fixtureId);
    }

    private void logOverride(User admin, Long fixtureId, String field, String oldVal, String newVal) {
        AuditLog log = new AuditLog(admin, "Fixture", fixtureId, field, oldVal, newVal, "OVERRIDE");
        auditLogRepository.save(log);
    }

    // ── Request DTO ─────────────────────────────────────────────────────

    public record FixtureOverrideRequest(
            Long homeTeamId,
            Long awayTeamId,
            java.time.LocalDateTime kickoffAt,
            FixtureStatus status,
            Integer scoreHome,
            Integer scoreAway
    ) {}
}
