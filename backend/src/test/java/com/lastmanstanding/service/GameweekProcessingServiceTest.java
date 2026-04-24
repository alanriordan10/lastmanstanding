package com.lastmanstanding.service;

import com.lastmanstanding.entity.*;
import com.lastmanstanding.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GameweekProcessingServiceTest {

    @Mock private GameweekRepository gameweekRepository;
    @Mock private FixtureRepository fixtureRepository;
    @Mock private PickRepository pickRepository;
    @Mock private PickResultRepository pickResultRepository;
    @Mock private CompetitionParticipantRepository participantRepository;
    @Mock private TeamRepository teamRepository;
    @Mock private CompetitionRepository competitionRepository;

    @InjectMocks
    private GameweekProcessingService service;

    private User user1, user2, user3;
    private Competition competition;
    private Gameweek gameweek;
    private Team arsenal, chelsea, liverpool, everton;
    private CompetitionParticipant cp1, cp2, cp3;

    @BeforeEach
    void setUp() {
        user1 = createUser(1L, "alice");
        user2 = createUser(2L, "bob");
        user3 = createUser(3L, "charlie");

        competition = new Competition("Test Cup", null, BigDecimal.ZERO,
                CompetitionStatus.ACTIVE, MissedPickMode.ELIMINATE, true,
                LocalDate.of(2026, 4, 4), user1);
        competition.setId(1L);

        gameweek = new Gameweek(competition, 1,
                LocalDateTime.of(2026, 4, 3, 23, 0),
                LocalDateTime.of(2026, 4, 4, 15, 0),
                LocalDateTime.of(2026, 4, 6, 22, 0),
                GameweekStatus.LOCKED);
        gameweek.setId(10L);

        arsenal = createTeam(1L, "Arsenal", "ARS");
        chelsea = createTeam(2L, "Chelsea", "CHE");
        liverpool = createTeam(3L, "Liverpool", "LIV");
        everton = createTeam(4L, "Everton", "EVE");

        cp1 = new CompetitionParticipant(competition, user1, ParticipantStatus.ACTIVE);
        cp1.setId(100L);
        cp2 = new CompetitionParticipant(competition, user2, ParticipantStatus.ACTIVE);
        cp2.setId(101L);
        cp3 = new CompetitionParticipant(competition, user3, ParticipantStatus.ACTIVE);
        cp3.setId(102L);
    }

    // ═══════════════════════════════════════════════════════════════════
    // RESULT PROCESSING
    // ═══════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Process Gameweek Results")
    class ProcessResults {

        // stub gameweekRepository and competitionRepository for every result test
        private void stubRepos() {
            when(gameweekRepository.findById(gameweek.getId())).thenReturn(Optional.of(gameweek));
            when(competitionRepository.findById(competition.getId())).thenReturn(Optional.of(competition));
        }

        @Test
        @DisplayName("Advance: team wins → participant advances")
        void advance_whenTeamWins() {
            stubRepos();
            // Arsenal 2 - 0 Chelsea
            Fixture fixture = createFinishedFixture(gameweek, arsenal, chelsea, 2, 0);

            Pick pick1 = createPick(1L, competition, user1, gameweek, arsenal);
            PickResult pr1 = new PickResult(pick1, PickOutcome.PENDING);
            pr1.setId(200L);

            when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(fixture));
            when(pickRepository.findByCompetitionIdAndGameweekId(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of(pick1));
            when(pickResultRepository.findByPickId(pick1.getId())).thenReturn(Optional.of(pr1));
            when(participantRepository.countByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(2L);

            service.processGameweekResults(gameweek.getId());

            assertThat(pr1.getOutcome()).isEqualTo(PickOutcome.ADVANCE);
            assertThat(pr1.getResolvedAt()).isNotNull();
            verify(gameweekRepository).save(gameweek);
            assertThat(gameweek.getStatus()).isEqualTo(GameweekStatus.COMPLETED);
        }

        @Test
        @DisplayName("Eliminated: team loses → participant eliminated")
        void eliminated_whenTeamLoses() {
            stubRepos();
            // Arsenal 0 - 2 Chelsea
            Fixture fixture = createFinishedFixture(gameweek, arsenal, chelsea, 0, 2);

            Pick pick1 = createPick(1L, competition, user1, gameweek, arsenal); // picked loser
            PickResult pr1 = new PickResult(pick1, PickOutcome.PENDING);

            when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(fixture));
            when(pickRepository.findByCompetitionIdAndGameweekId(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of(pick1));
            when(pickResultRepository.findByPickId(pick1.getId())).thenReturn(Optional.of(pr1));
            when(participantRepository.findByCompetitionIdAndUserId(competition.getId(), user1.getId()))
                    .thenReturn(Optional.of(cp1));
            when(participantRepository.countByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(2L);

            service.processGameweekResults(gameweek.getId());

            assertThat(pr1.getOutcome()).isEqualTo(PickOutcome.ELIMINATED);
            assertThat(cp1.getStatus()).isEqualTo(ParticipantStatus.ELIMINATED);
            assertThat(cp1.getEliminatedWeek()).isEqualTo(1);
        }

        @Test
        @DisplayName("Eliminated: team draws → participant eliminated")
        void eliminated_whenTeamDraws() {
            stubRepos();
            // Arsenal 1 - 1 Chelsea
            Fixture fixture = createFinishedFixture(gameweek, arsenal, chelsea, 1, 1);

            Pick pick1 = createPick(1L, competition, user1, gameweek, arsenal);
            PickResult pr1 = new PickResult(pick1, PickOutcome.PENDING);

            when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(fixture));
            when(pickRepository.findByCompetitionIdAndGameweekId(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of(pick1));
            when(pickResultRepository.findByPickId(pick1.getId())).thenReturn(Optional.of(pr1));
            when(participantRepository.findByCompetitionIdAndUserId(competition.getId(), user1.getId()))
                    .thenReturn(Optional.of(cp1));
            when(participantRepository.countByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(2L);

            service.processGameweekResults(gameweek.getId());

            assertThat(pr1.getOutcome()).isEqualTo(PickOutcome.ELIMINATED);
            assertThat(cp1.getStatus()).isEqualTo(ParticipantStatus.ELIMINATED);
        }

        @Test
        @DisplayName("Postponed advance: fixture postponed → participant advances")
        void postponedAdvance() {
            stubRepos();
            Fixture fixture = createPostponedFixture(gameweek, arsenal, chelsea);

            Pick pick1 = createPick(1L, competition, user1, gameweek, arsenal);
            PickResult pr1 = new PickResult(pick1, PickOutcome.PENDING);

            when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(fixture));
            when(pickRepository.findByCompetitionIdAndGameweekId(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of(pick1));
            when(pickResultRepository.findByPickId(pick1.getId())).thenReturn(Optional.of(pr1));
            when(participantRepository.countByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(2L);

            service.processGameweekResults(gameweek.getId());

            assertThat(pr1.getOutcome()).isEqualTo(PickOutcome.POSTPONED_ADVANCE);
        }

        @Test
        @DisplayName("Competition completed when only 1 active participant remains")
        void competitionCompleted_whenOneRemains() {
            stubRepos();
            Fixture fixture = createFinishedFixture(gameweek, arsenal, chelsea, 0, 2);

            Pick pick1 = createPick(1L, competition, user1, gameweek, arsenal); // loser
            PickResult pr1 = new PickResult(pick1, PickOutcome.PENDING);

            when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(fixture));
            when(pickRepository.findByCompetitionIdAndGameweekId(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of(pick1));
            when(pickResultRepository.findByPickId(pick1.getId())).thenReturn(Optional.of(pr1));
            when(participantRepository.findByCompetitionIdAndUserId(competition.getId(), user1.getId()))
                    .thenReturn(Optional.of(cp1));
            when(participantRepository.countByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(1L);
            when(participantRepository.findByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(List.of(cp2));

            service.processGameweekResults(gameweek.getId());

            assertThat(competition.getStatus()).isEqualTo(CompetitionStatus.COMPLETED);
            assertThat(cp2.getStatus()).isEqualTo(ParticipantStatus.WINNER);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // LOCK & MISSED PICK
    // ═══════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Lock Gameweek & Missed Picks")
    class LockAndMissedPicks {

        // stub gameweekRepository and competitionRepository for every lock test
        private void stubRepos() {
            when(gameweekRepository.findById(gameweek.getId())).thenReturn(Optional.of(gameweek));
            when(competitionRepository.findById(competition.getId())).thenReturn(Optional.of(competition));
        }

        @Test
        @DisplayName("ELIMINATE mode: missed pick → participant eliminated")
        void missedPick_eliminateMode() {
            gameweek.setStatus(GameweekStatus.UPCOMING);
            gameweek.setLockAt(LocalDateTime.now().minusMinutes(5)); // past lock
            stubRepos();

            when(participantRepository.findByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(List.of(cp1));
            when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of());
            when(pickRepository.findByCompetitionIdAndUserIdAndGameweekId(
                    competition.getId(), user1.getId(), gameweek.getId()))
                    .thenReturn(Optional.empty());

            service.lockGameweek(gameweek.getId());

            assertThat(cp1.getStatus()).isEqualTo(ParticipantStatus.ELIMINATED);
            assertThat(gameweek.getStatus()).isEqualTo(GameweekStatus.LOCKED);
        }

        @Test
        @DisplayName("AUTO_ASSIGN mode: missed pick → auto-assigns first alphabetical available team")
        void missedPick_autoAssignMode() {
            competition = new Competition("Test Cup", null, BigDecimal.ZERO,
                    CompetitionStatus.ACTIVE, MissedPickMode.AUTO_ASSIGN, true,
                    LocalDate.of(2026, 4, 4), user1);
            competition.setId(1L);

            gameweek = new Gameweek(competition, 1,
                    LocalDateTime.now().minusMinutes(5),
                    LocalDateTime.of(2026, 4, 4, 15, 0),
                    LocalDateTime.of(2026, 4, 6, 22, 0),
                    GameweekStatus.UPCOMING);
            gameweek.setId(10L);

            cp1 = new CompetitionParticipant(competition, user1, ParticipantStatus.ACTIVE);

            when(gameweekRepository.findById(gameweek.getId())).thenReturn(Optional.of(gameweek));
            when(competitionRepository.findById(competition.getId())).thenReturn(Optional.of(competition));

            Fixture fixture = createScheduledFixture(gameweek, arsenal, chelsea);

            when(participantRepository.findByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(List.of(cp1));
            when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(fixture));
            when(pickRepository.findByCompetitionIdAndUserIdAndGameweekId(
                    competition.getId(), user1.getId(), gameweek.getId()))
                    .thenReturn(Optional.empty());
            when(pickRepository.findUsedTeamIds(competition.getId(), user1.getId()))
                    .thenReturn(new ArrayList<>());
            when(teamRepository.findAllByOrderByNameAsc())
                    .thenReturn(List.of(arsenal, chelsea, everton, liverpool));
            when(pickRepository.save(any(Pick.class))).thenAnswer(i -> i.getArgument(0));
            when(pickResultRepository.save(any(PickResult.class))).thenAnswer(i -> i.getArgument(0));

            service.lockGameweek(gameweek.getId());

            ArgumentCaptor<Pick> pickCaptor = ArgumentCaptor.forClass(Pick.class);
            verify(pickRepository).save(pickCaptor.capture());
            Pick autoPick = pickCaptor.getValue();
            assertThat(autoPick.getTeam().getName()).isEqualTo("Arsenal"); // first alphabetically
            assertThat(autoPick.getSource()).isEqualTo(PickSource.AUTO);
            assertThat(autoPick.isLocked()).isTrue();
        }

        @Test
        @DisplayName("AUTO_ASSIGN mode: no available teams → participant eliminated")
        void autoAssign_noTeamsAvailable_eliminated() {
            competition = new Competition("Test Cup", null, BigDecimal.ZERO,
                    CompetitionStatus.ACTIVE, MissedPickMode.AUTO_ASSIGN, true,
                    LocalDate.of(2026, 4, 4), user1);
            competition.setId(1L);

            gameweek = new Gameweek(competition, 1,
                    LocalDateTime.now().minusMinutes(5),
                    LocalDateTime.of(2026, 4, 4, 15, 0),
                    LocalDateTime.of(2026, 4, 6, 22, 0),
                    GameweekStatus.UPCOMING);
            gameweek.setId(10L);

            cp1 = new CompetitionParticipant(competition, user1, ParticipantStatus.ACTIVE);

            when(gameweekRepository.findById(gameweek.getId())).thenReturn(Optional.of(gameweek));
            when(competitionRepository.findById(competition.getId())).thenReturn(Optional.of(competition));

            // No fixtures this week
            when(participantRepository.findByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(List.of(cp1));
            when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of());
            when(pickRepository.findByCompetitionIdAndUserIdAndGameweekId(
                    competition.getId(), user1.getId(), gameweek.getId()))
                    .thenReturn(Optional.empty());
            when(pickRepository.findUsedTeamIds(competition.getId(), user1.getId()))
                    .thenReturn(new ArrayList<>());
            when(teamRepository.findAllByOrderByNameAsc()).thenReturn(List.of(arsenal, chelsea));

            service.lockGameweek(gameweek.getId());

            assertThat(cp1.getStatus()).isEqualTo(ParticipantStatus.ELIMINATED);
        }

        @Test
        @DisplayName("Locks existing pick at lock time")
        void locksExistingPick() {
            gameweek.setStatus(GameweekStatus.UPCOMING);
            gameweek.setLockAt(LocalDateTime.now().minusMinutes(5));
            stubRepos();

            Pick pick = createPick(1L, competition, user1, gameweek, arsenal);
            pick.setLocked(false);

            when(participantRepository.findByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(List.of(cp1));
            when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of());
            when(pickRepository.findByCompetitionIdAndUserIdAndGameweekId(
                    competition.getId(), user1.getId(), gameweek.getId()))
                    .thenReturn(Optional.of(pick));
            when(pickRepository.save(any(Pick.class))).thenAnswer(i -> i.getArgument(0));

            service.lockGameweek(gameweek.getId());

            assertThat(pick.isLocked()).isTrue();
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════

    private User createUser(Long id, String username) {
        User u = new User(username + "@test.com", username, "hash", Role.USER);
        u.setId(id);
        return u;
    }

    private Team createTeam(Long id, String name, String shortName) {
        Team t = new Team(name, shortName, "EXT-" + shortName, null);
        t.setId(id);
        return t;
    }

    private Pick createPick(Long id, Competition comp, User user, Gameweek gw, Team team) {
        Pick p = new Pick(comp, user, gw, team, PickSource.USER, true);
        p.setId(id);
        return p;
    }

    private Fixture createFinishedFixture(Gameweek gw, Team home, Team away, int scoreHome, int scoreAway) {
        Fixture f = new Fixture(gw, "EXT-F1", home, away,
                LocalDateTime.of(2026, 4, 4, 15, 0), FixtureStatus.FINISHED);
        f.setId(50L);
        f.setImportedScoreHome(scoreHome);
        f.setImportedScoreAway(scoreAway);
        return f;
    }

    private Fixture createPostponedFixture(Gameweek gw, Team home, Team away) {
        Fixture f = new Fixture(gw, "EXT-F2", home, away,
                LocalDateTime.of(2026, 4, 4, 15, 0), FixtureStatus.POSTPONED);
        f.setId(51L);
        return f;
    }

    private Fixture createScheduledFixture(Gameweek gw, Team home, Team away) {
        Fixture f = new Fixture(gw, "EXT-F3", home, away,
                LocalDateTime.of(2026, 4, 4, 15, 0), FixtureStatus.SCHEDULED);
        f.setId(52L);
        return f;
    }
}

