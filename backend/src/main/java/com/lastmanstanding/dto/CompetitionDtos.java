package com.lastmanstanding.dto;

import com.lastmanstanding.entity.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public final class CompetitionDtos {

    private CompetitionDtos() {}

    // ── Requests ────────────────────────────────────────────────────────

    public record CreateCompetitionRequest(
            @NotBlank String name,
            String description,
            BigDecimal entryFee,
            BigDecimal prizePool,
            Integer maxEntriesPerUser,
            String fixtureCompetitionCode,
            @NotNull MissedPickMode missedPickMode,
            boolean postponedConsumesTeam,
            boolean lifelineEnabled,
            boolean passFeeToParticipant,
            String paymentMode,
            String manualPaymentPolicy,
            String visibility,
            @NotNull LocalDate startDate,
            Long clubId
    ) {}

    public record UpdateCompetitionRequest(
            String name,
            String description,
            BigDecimal entryFee,
            BigDecimal prizePool,
            Integer maxEntriesPerUser,
            String fixtureCompetitionCode,
            MissedPickMode missedPickMode,
            Boolean postponedConsumesTeam,
            Boolean lifelineEnabled,
            Boolean passFeeToParticipant,
            String paymentMode,
            String manualPaymentPolicy,
            String visibility,
            LocalDate startDate,
            CompetitionStatus status,
            Long clubId
    ) {}

    public record PickRequest(
            @NotNull Long teamId,
            Long entryId,
            Boolean useLifeline
    ) {}

    // ── Responses ───────────────────────────────────────────────────────

    public record ClubResponse(
            Long id,
            String name,
            String description,
            Long clubAdminId,
            String clubAdminUsername,
            String primaryColor,
            String secondaryColor,
            String logoUrl
    ) {
        public static ClubResponse from(Club c) {
            return new ClubResponse(
                    c.getId(), c.getName(), c.getDescription(),
                    c.getClubAdmin() != null ? c.getClubAdmin().getId() : null,
                    c.getClubAdmin() != null ? c.getClubAdmin().getUsername() : null,
                    c.getPrimaryColor(),
                    c.getSecondaryColor(),
                    c.getLogoUrl()
            );
        }
    }

    public record UpdateClubBrandingRequest(
            String primaryColor,
            String secondaryColor,
            String logoUrl
    ) {}

    public record CompetitionResponse(
            Long id,
            String name,
            String description,
            BigDecimal entryFee,
            BigDecimal prizePool,
            Integer maxEntriesPerUser,
            String status,
            String fixtureCompetitionCode,
            String missedPickMode,
            boolean postponedConsumesTeam,
            boolean lifelineEnabled,
            boolean passFeeToParticipant,
            String paymentMode,
            String manualPaymentPolicy,
            String visibility,
            String joinCode,
            LocalDate startDate,
            LocalDate firstGameweekDate,
            String createdByUsername,
            int participantCount,
            int activeCount,
            Long clubId,
            String clubName,
            String winnerUsername,
            String clubPrimaryColor,
            String clubSecondaryColor,
            String clubLogoUrl
    ) {
                private static String joinCodeFor(Competition c) {
                        if (c.getVisibility() == CompetitionVisibility.PRIVATE) {
                                return c.getJoinCode();
                        }
                        return null;
                }

        public static CompetitionResponse from(Competition c, int participantCount, int activeCount, String winnerUsername) {
            return new CompetitionResponse(
                    c.getId(), c.getName(), c.getDescription(), c.getEntryFee(), c.getPrizePool(),
                    c.getMaxEntriesPerUser(),
                    c.getStatus().name(),
                    c.getFixtureCompetitionCode(),
                    c.getMissedPickMode().name(),
                    c.isPostponedConsumesTeam(), c.isLifelineEnabled(), c.isPassFeeToParticipant(),
                    c.getPaymentMode() != null ? c.getPaymentMode().name() : "FREE",
                    c.getManualPaymentPolicy() != null ? c.getManualPaymentPolicy().name() : "STRICT",
                    c.getVisibility() != null ? c.getVisibility().name() : "PUBLIC",
                                        joinCodeFor(c),
                    c.getStartDate(), null,
                    c.getCreatedBy().getUsername(),
                    participantCount, activeCount,
                    c.getClub() != null ? c.getClub().getId() : null,
                    c.getClub() != null ? c.getClub().getName() : null,
                    winnerUsername,
                    c.getClub() != null ? c.getClub().getPrimaryColor() : null,
                    c.getClub() != null ? c.getClub().getSecondaryColor() : null,
                    c.getClub() != null ? c.getClub().getLogoUrl() : null
            );
        }

        public static CompetitionResponse from(Competition c, int participantCount, int activeCount,
                                               String winnerUsername, LocalDate firstGameweekDate) {
            return new CompetitionResponse(
                    c.getId(), c.getName(), c.getDescription(), c.getEntryFee(), c.getPrizePool(),
                    c.getMaxEntriesPerUser(),
                    c.getStatus().name(),
                    c.getFixtureCompetitionCode(),
                    c.getMissedPickMode().name(),
                    c.isPostponedConsumesTeam(), c.isLifelineEnabled(), c.isPassFeeToParticipant(),
                    c.getPaymentMode() != null ? c.getPaymentMode().name() : "FREE",
                    c.getManualPaymentPolicy() != null ? c.getManualPaymentPolicy().name() : "STRICT",
                    c.getVisibility() != null ? c.getVisibility().name() : "PUBLIC",
                    joinCodeFor(c),
                    c.getStartDate(), firstGameweekDate,
                    c.getCreatedBy().getUsername(),
                    participantCount, activeCount,
                    c.getClub() != null ? c.getClub().getId() : null,
                    c.getClub() != null ? c.getClub().getName() : null,
                    winnerUsername,
                    c.getClub() != null ? c.getClub().getPrimaryColor() : null,
                    c.getClub() != null ? c.getClub().getSecondaryColor() : null,
                    c.getClub() != null ? c.getClub().getLogoUrl() : null
            );
        }
    }

    public record ParticipantResponse(
            Long id,
            Long userId,
            String username,
            Integer entryNumber,
            String status,
            String paymentState,
            boolean lifelineUsed,
            Integer lifelineUsedWeek,
            Integer eliminatedWeek,
            LocalDateTime joinedAt
    ) {
        public static ParticipantResponse from(CompetitionParticipant cp) {
            return from(cp, null);
        }

        public static ParticipantResponse from(CompetitionParticipant cp, String paymentState) {
            return new ParticipantResponse(
                    cp.getId(), cp.getUser().getId(), cp.getUser().getUsername(),
                    cp.getEntryNumber(),
                    cp.getStatus().name(), paymentState, cp.isLifelineUsed(), cp.getLifelineUsedWeek(),
                    cp.getEliminatedWeek(), cp.getJoinedAt()
            );
        }
    }

    public record MyStatusResponse(
            ParticipantResponse participant,
            List<Long> usedTeamIds,
            List<PickHistoryItem> picks
    ) {}

    public record PickHistoryItem(
            Long pickId,
            Long gameweekId,
            int weekNumber,
            Long teamId,
            String teamName,
            String teamShortName,
            String source,
            boolean locked,
            boolean useLifeline,
            LocalDateTime pickedAt,
            String outcome,
            LocalDateTime resolvedAt
    ) {}

    public record GameweekResponse(
            Long id,
            int weekNumber,
            LocalDateTime lockAt,
            LocalDateTime startsAt,
            LocalDateTime endsAt,
            String status
    ) {
        public static GameweekResponse from(Gameweek gw) {
            return new GameweekResponse(
                    gw.getId(), gw.getWeekNumber(), gw.getLockAt(),
                    gw.getStartsAt(), gw.getEndsAt(), gw.getStatus().name()
            );
        }
    }

    public record FixtureResponse(
            Long id,
            Long gameweekId,
            int weekNumber,
            Long homeTeamId,
            String homeTeamName,
            String homeTeamShortName,
            Long awayTeamId,
            String awayTeamName,
            String awayTeamShortName,
            LocalDateTime kickoffAt,
            String status,
            Integer scoreHome,
            Integer scoreAway,
            BigDecimal oddsHomeWin,
            BigDecimal oddsDraw,
            BigDecimal oddsAwayWin,
            BigDecimal oddsImpliedHome,
            BigDecimal oddsImpliedDraw,
            BigDecimal oddsImpliedAway,
            LocalDateTime oddsUpdatedAt,
            boolean hasOverride,
            LocalDateTime gameweekLockAt,
            String gameweekStatus
    ) {
        public static FixtureResponse from(Fixture f) {
            Team home = f.getEffectiveHomeTeam();
            Team away = f.getEffectiveAwayTeam();
            boolean hasOverride = f.getOverrideStatus() != null || f.getOverrideHomeTeam() != null
                    || f.getOverrideAwayTeam() != null || f.getOverrideKickoffAt() != null
                    || f.getOverrideScoreHome() != null || f.getOverrideScoreAway() != null;
            return new FixtureResponse(
                    f.getId(), f.getGameweek().getId(), f.getGameweek().getWeekNumber(),
                    home.getId(), home.getName(), home.getShortName(),
                    away.getId(), away.getName(), away.getShortName(),
                    f.getEffectiveKickoffAt(), f.getEffectiveStatus().name(),
                    f.getEffectiveScoreHome(), f.getEffectiveScoreAway(),
                    f.getOddsHomeWin(), f.getOddsDraw(), f.getOddsAwayWin(),
                    f.getOddsImpliedHome(), f.getOddsImpliedDraw(), f.getOddsImpliedAway(),
                    f.getOddsUpdatedAt(),
                    hasOverride,
                    f.getGameweek().getLockAt(),
                    f.getGameweek().getStatus().name()
            );
        }
    }

    public record PickResponse(
            Long id,
            Long gameweekId,
            int weekNumber,
            Long teamId,
            String teamName,
            String teamShortName,
            String source,
            boolean locked,
            LocalDateTime pickedAt
    ) {
        public static PickResponse from(Pick p) {
            return new PickResponse(
                    p.getId(), p.getGameweek().getId(), p.getGameweek().getWeekNumber(),
                    p.getTeam().getId(), p.getTeam().getName(), p.getTeam().getShortName(),
                    p.getSource().name(), p.isLocked(), p.getPickedAt()
            );
        }
    }

    public record GameweekSelectionResponse(
            Long participantId,
            Long userId,
            String username,
            Integer entryNumber,
            boolean lifelineUsed,
            Integer lifelineUsedWeek,
            Long teamId,
            String teamName,
            String teamShortName,
            String source,
            boolean useLifeline,
            String outcome
    ) {}

    public record GameweekSelectionsData(
            List<GameweekSelectionResponse> selections,
            boolean byeGranted,
            Integer weekNumber,
            Integer activeAtStart,
            Integer advancedThisWeek,
            Integer eliminatedThisWeek
    ) {}

    public record TeamResponse(
            Long id,
            String name,
            String shortName,
            String logoUrl
    ) {
        public static TeamResponse from(Team t) {
            return new TeamResponse(t.getId(), t.getName(), t.getShortName(), t.getLogoUrl());
        }
    }

    public record AuditLogResponse(
            Long id,
            String username,
            String entityType,
            Long entityId,
            String fieldName,
            String oldValue,
            String newValue,
            String action,
            LocalDateTime createdAt
    ) {
        public static AuditLogResponse from(AuditLog al) {
            return new AuditLogResponse(
                    al.getId(),
                    al.getUser() != null ? al.getUser().getUsername() : null,
                    al.getEntityType(), al.getEntityId(), al.getFieldName(),
                    al.getOldValue(), al.getNewValue(), al.getAction(), al.getCreatedAt()
            );
        }
    }

    public record MyCompetitionResponse(
            CompetitionResponse competition,
            Long participantId,
            Integer entryNumber,
            String myStatus,
            String paymentState,
            Integer eliminatedWeek,
            LocalDateTime joinedAt
    ) {}

    public record SurvivorGameweekMeta(Long id, int weekNumber, String status) {}

    public record SurvivorPickCell(String teamShortName, String outcome, String source, boolean useLifeline) {}

    public record SurvivorRow(
            Long participantId,
            Long userId,
            String username,
            Integer entryNumber,
            String status,
            Integer eliminatedWeek,
            boolean lifelineUsed,
            Integer lifelineUsedWeek,
            Map<Integer, SurvivorPickCell> picks
    ) {}

    public record SurvivorTableResponse(
            List<SurvivorGameweekMeta> gameweeks,
            List<SurvivorRow> rows
    ) {}
}
