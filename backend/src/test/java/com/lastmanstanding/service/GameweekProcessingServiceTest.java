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
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
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
    @Mock private PaymentRepository paymentRepository;
    @Mock private FixtureSyncService fixtureSyncService;
    @Mock private GameweekEmailService gameweekEmailService;
    @Mock private WebPushService webPushService;
    @Mock private CompetitionCacheService competitionCacheService;
    @Mock private ApplicationEventPublisher eventPublisher;

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


    void cleanupUnusedFutureGameweeks_removesOnlyUpcomingDependencies() {
        when(gameweekRepository.findIdsByCompetitionIdAndStatus(1L, GameweekStatus.UPCOMING))
                .thenReturn(List.of(20L, 21L));

        int removed = service.cleanupUnusedFutureGameweeks(1L);

        assertThat(removed).isEqualTo(2);
        verify(pickResultRepository).deleteByGameweekIds(List.of(20L, 21L));
        verify(pickRepository).deleteByGameweekIds(List.of(20L, 21L));
        verify(fixtureRepository).deleteByGameweekIds(List.of(20L, 21L));
        verify(gameweekRepository).deleteByIds(List.of(20L, 21L));
        verify(competitionCacheService).evictCompetition(1L);
    }

    // ═══════════════════════════════════════════════════════════════════
    // RESULT CORRECTION
    // ═══════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Prepare Gameweek Correction")
    class PrepareCorrection {

        @Test
        @DisplayName("Restores current-week outcomes before corrected results are replayed")
        void restoresCurrentWeekState() {
            gameweek.setStatus(GameweekStatus.COMPLETED);
            competition.setStatus(CompetitionStatus.COMPLETED);

            cp1.setStatus(ParticipantStatus.ELIMINATED);
            cp1.setEliminatedWeek(1);
            cp1.setLifelineUsed(true);
            cp1.setLifelineUsedWeek(1);
            cp2.setStatus(ParticipantStatus.WINNER);

            Gameweek future = new Gameweek(competition, 2,
                    LocalDateTime.of(2026, 4, 10, 23, 0),
                    LocalDateTime.of(2026, 4, 11, 15, 0),
                    LocalDateTime.of(2026, 4, 13, 22, 0),
                    GameweekStatus.UPCOMING);

            when(gameweekRepository.findById(10L)).thenReturn(Optional.of(gameweek));
            when(gameweekRepository.findAfterWeek(1L, 1)).thenReturn(List.of(future));
            when(competitionRepository.findById(1L)).thenReturn(Optional.of(competition));
            when(participantRepository.findByCompetitionId(1L)).thenReturn(List.of(cp1, cp2, cp3));

            service.prepareGameweekCorrection(1L, 10L);

            assertThat(cp1.getStatus()).isEqualTo(ParticipantStatus.ACTIVE);
            assertThat(cp1.getEliminatedWeek()).isNull();
            assertThat(cp1.isLifelineUsed()).isFalse();
            assertThat(cp1.getLifelineUsedWeek()).isNull();
            assertThat(cp2.getStatus()).isEqualTo(ParticipantStatus.ACTIVE);
            assertThat(gameweek.getStatus()).isEqualTo(GameweekStatus.IN_PROGRESS);
            assertThat(competition.getStatus()).isEqualTo(CompetitionStatus.ACTIVE);
            verify(participantRepository).saveAll(any());
            verify(pickResultRepository).resetForGameweek(1L, 10L);
            verify(gameweekRepository).save(gameweek);
            verify(competitionRepository).save(competition);
            verify(competitionCacheService).evictCompetition(1L);
        }

        @Test
        @DisplayName("Rejects correction after a later gameweek has started")
        void rejectsWhenLaterGameweekStarted() {
            gameweek.setStatus(GameweekStatus.COMPLETED);
            Gameweek later = new Gameweek(competition, 2,
                    LocalDateTime.of(2026, 4, 10, 23, 0),
                    LocalDateTime.of(2026, 4, 11, 15, 0),
                    LocalDateTime.of(2026, 4, 13, 22, 0),
                    GameweekStatus.LOCKED);

            when(gameweekRepository.findById(10L)).thenReturn(Optional.of(gameweek));
            when(gameweekRepository.findAfterWeek(1L, 1)).thenReturn(List.of(later));

            ResponseStatusException error = catchThrowableOfType(
                    () -> service.prepareGameweekCorrection(1L, 10L),
                    ResponseStatusException.class);

            assertThat(error.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
            verifyNoInteractions(pickResultRepository);
            verify(participantRepository, never()).saveAll(any());
            verify(gameweekRepository, never()).save(any(Gameweek.class));
            verify(competitionRepository, never()).save(any(Competition.class));
        }
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

            Pick pick1 = createPick(1L, competition, user1, gameweek, arsenal, cp1);
            PickResult pr1 = new PickResult(pick1, PickOutcome.PENDING);
            pr1.setId(200L);

            when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(fixture));
            when(pickRepository.findByCompetitionIdAndGameweekIdFetch(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of(pick1));
            when(pickResultRepository.findByCompetitionIdAndGameweekId(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of(pr1));
            when(participantRepository.findByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(List.of());
            when(participantRepository.countByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(2L);
            when(pickResultRepository.saveAll(any())).thenReturn(List.of());

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

            Pick pick1 = createPick(1L, competition, user1, gameweek, arsenal, cp1); // picked loser
            PickResult pr1 = new PickResult(pick1, PickOutcome.PENDING);

            when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(fixture));
            when(pickRepository.findByCompetitionIdAndGameweekIdFetch(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of(pick1));
            when(pickResultRepository.findByCompetitionIdAndGameweekId(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of(pr1));
            when(participantRepository.findByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(List.of(cp1));
            when(participantRepository.countByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(2L);
            when(pickResultRepository.saveAll(any())).thenReturn(List.of());

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

            Pick pick1 = createPick(1L, competition, user1, gameweek, arsenal, cp1);
            PickResult pr1 = new PickResult(pick1, PickOutcome.PENDING);

            when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(fixture));
            when(pickRepository.findByCompetitionIdAndGameweekIdFetch(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of(pick1));
            when(pickResultRepository.findByCompetitionIdAndGameweekId(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of(pr1));
            when(participantRepository.findByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(List.of(cp1));
            when(participantRepository.countByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(2L);
            when(pickResultRepository.saveAll(any())).thenReturn(List.of());

            service.processGameweekResults(gameweek.getId());

            assertThat(pr1.getOutcome()).isEqualTo(PickOutcome.ELIMINATED);
            assertThat(cp1.getStatus()).isEqualTo(ParticipantStatus.ELIMINATED);
        }

        @Test
        @DisplayName("Postponed advance: fixture postponed → participant advances")
        void postponedAdvance() {
            stubRepos();
            Fixture postponedFixture = createPostponedFixture(gameweek, arsenal, chelsea);
            Fixture finishedFixture = createFinishedFixture(gameweek, liverpool, everton, 1, 0);

            Pick pick1 = createPick(1L, competition, user1, gameweek, arsenal, cp1);
            PickResult pr1 = new PickResult(pick1, PickOutcome.PENDING);
            pr1.setId(200L);

            when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(postponedFixture, finishedFixture));
            when(pickRepository.findByCompetitionIdAndGameweekIdFetch(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of(pick1));
            when(pickResultRepository.findByCompetitionIdAndGameweekId(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of(pr1));
            when(participantRepository.findByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(List.of());
            when(participantRepository.countByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(2L);
            when(pickResultRepository.saveAll(any())).thenReturn(List.of());

            service.processGameweekResults(gameweek.getId());

            assertThat(pr1.getOutcome()).isEqualTo(PickOutcome.POSTPONED_ADVANCE);
        }

        @Test
        @DisplayName("Competition completed when only 1 active participant remains")
        void competitionCompleted_whenOneRemains() {
            stubRepos();
            Fixture fixture = createFinishedFixture(gameweek, arsenal, chelsea, 0, 2);

            Pick pick1 = createPick(1L, competition, user1, gameweek, arsenal, cp1); // loser
            PickResult pr1 = new PickResult(pick1, PickOutcome.PENDING);

            when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(fixture));
            when(pickRepository.findByCompetitionIdAndGameweekIdFetch(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of(pick1));
            when(pickResultRepository.findByCompetitionIdAndGameweekId(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of(pr1));
            // First call returns both, but after cp1 is eliminated it should only return cp2
            when(participantRepository.findByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(List.of(cp1, cp2))  // During elimination phase
                    .thenReturn(List.of(cp2));      // During winner determination phase
            when(participantRepository.countByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(1L);
            when(pickResultRepository.saveAll(any())).thenReturn(List.of());
            when(participantRepository.save(any())).thenReturn(null);

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
            when(pickRepository.findByCompetitionIdAndGameweekId(
                    competition.getId(), gameweek.getId()))
                    .thenReturn(List.of());

            service.lockGameweek(gameweek.getId());

            assertThat(cp1.getStatus()).isEqualTo(ParticipantStatus.ELIMINATED);
            assertThat(gameweek.getStatus()).isEqualTo(GameweekStatus.LOCKED);
        }

        /*@Test

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
            when(pickRepository.findByCompetitionIdAndGameweekId(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of());
            when(pickRepository.findUsedTeamIdsByParticipantIds(eq(competition.getId()), any()))
                    .thenReturn(List.of());
            when(teamRepository.findAllByOrderByNameAsc())
                    .thenReturn(List.of(arsenal, chelsea, everton, liverpool));
            when(pickRepository.save(any(Pick.class))).thenAnswer(i -> i.getArgument(0));
            when(pickRepository.saveAll(any())).thenAnswer(i -> i.getArgument(0));
            when(pickResultRepository.save(any(PickResult.class))).thenAnswer(i -> i.getArgument(0));
            when(paymentRepository.findPaidUserIdsByCompetitionId(competition.getId())).thenReturn(List.of());

            service.lockGameweek(gameweek.getId());

            ArgumentCaptor<List<Pick>> pickCaptor = ArgumentCaptor.forClass(List.class);
            verify(pickRepository, times(2)).saveAll(pickCaptor.capture());
            List<List<Pick>> allCalls = pickCaptor.getAllValues();
            List<Pick> saved = allCalls.get(allCalls.size() - 1); // Get last call
            if (!saved.isEmpty()) {
                Pick autoPick = saved.get(0);
                assertThat(autoPick.getTeam().getName()).isEqualTo("Arsenal"); // first alphabetically
                assertThat(autoPick.getSource()).isEqualTo(PickSource.AUTO);
                assertThat(autoPick.isLocked()).isTrue();
            }
        }*/

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
            when(pickRepository.findByCompetitionIdAndGameweekId(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of());
            when(pickRepository.findUsedTeamIdsByParticipantIds(eq(competition.getId()), any()))
                    .thenReturn(List.of());

            service.lockGameweek(gameweek.getId());

            assertThat(cp1.getStatus()).isEqualTo(ParticipantStatus.ELIMINATED);
        }

        @Test
        @DisplayName("Locks existing pick at lock time")
        void locksExistingPick() {
            gameweek.setStatus(GameweekStatus.UPCOMING);
            gameweek.setLockAt(LocalDateTime.now().minusMinutes(5));
            stubRepos();

            Pick pick = createPick(1L, competition, user1, gameweek, arsenal, cp1);
            pick.setLocked(false);

            when(participantRepository.findByCompetitionIdAndStatus(competition.getId(), ParticipantStatus.ACTIVE))
                    .thenReturn(List.of(cp1));
            when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of());
            when(pickRepository.findByCompetitionIdAndGameweekId(competition.getId(), gameweek.getId()))
                    .thenReturn(List.of(pick));
            when(pickRepository.saveAll(any())).thenAnswer(i -> i.getArgument(0));

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

    private Pick createPick(Long id, Competition comp, User user, Gameweek gw, Team team, CompetitionParticipant participant) {
        Pick p = new Pick(comp, user, gw, team, PickSource.USER, true);
        p.setId(id);
        p.setParticipant(participant);
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

