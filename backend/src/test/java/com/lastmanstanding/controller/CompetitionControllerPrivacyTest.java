package com.lastmanstanding.controller;

import com.lastmanstanding.dto.CompetitionDtos.GameweekSelectionsData;
import com.lastmanstanding.dto.CompetitionDtos.SurvivorTableResponse;
import com.lastmanstanding.entity.*;
import com.lastmanstanding.repository.*;
import com.lastmanstanding.service.CompetitionService;
import com.lastmanstanding.service.PickService;
import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CompetitionControllerPrivacyTest {

    @Mock private CompetitionService competitionService;
    @Mock private PickService pickService;
    @Mock private CompetitionRepository competitionRepository;
    @Mock private GameweekRepository gameweekRepository;
    @Mock private FixtureRepository fixtureRepository;
    @Mock private PickRepository pickRepository;
    @Mock private PickResultRepository pickResultRepository;
    @Mock private CompetitionParticipantRepository participantRepository;
    @Mock private TeamRepository teamRepository;
    @Mock private ClubRepository clubRepository;
    @Mock private PaymentRepository paymentRepository;
    @Mock private HttpServletRequest request;

    private CompetitionController controller;
    private Competition competition;
    private User user;
    private CompetitionParticipant participant;
    private Gameweek upcomingWeek;
    private Gameweek lockedWeek;
    private Team arsenal;
    private Team chelsea;

    @BeforeEach
    void setUp() {
        user = new User("alice@test.com", "alice", "hash", Role.USER);
        user.setId(10L);

        competition = new Competition("Privacy Cup", null, BigDecimal.ZERO,
                CompetitionStatus.ACTIVE, MissedPickMode.ELIMINATE, true,
                LocalDate.of(2026, 6, 1), user);
        competition.setId(1L);

        participant = new CompetitionParticipant(competition, user, ParticipantStatus.ACTIVE);
        participant.setId(100L);
        participant.setEntryNumber(1);

        upcomingWeek = new Gameweek(competition, 1,
                LocalDateTime.now().plusDays(1),
                LocalDateTime.now().plusDays(2),
                LocalDateTime.now().plusDays(3),
                GameweekStatus.UPCOMING);
        upcomingWeek.setId(1000L);

        lockedWeek = new Gameweek(competition, 2,
                LocalDateTime.now().minusDays(1),
                LocalDateTime.now().plusHours(1),
                LocalDateTime.now().plusDays(1),
                GameweekStatus.LOCKED);
        lockedWeek.setId(1001L);

        arsenal = new Team("Arsenal", "ARS", "ARS", null);
        arsenal.setId(200L);
        chelsea = new Team("Chelsea", "CHE", "CHE", null);
        chelsea.setId(201L);

        controller = new CompetitionController(
                competitionService,
                pickService,
                competitionRepository,
                gameweekRepository,
                fixtureRepository,
                pickRepository,
                pickResultRepository,
                participantRepository,
                teamRepository,
                clubRepository,
                paymentRepository
        );
    }

    @Test
    void selectionsForUpcomingGameweekDoNotReturnPicks() {
        when(gameweekRepository.findById(upcomingWeek.getId())).thenReturn(Optional.of(upcomingWeek));
        when(participantRepository.countActiveAtStartForWeek(competition.getId(), upcomingWeek.getWeekNumber())).thenReturn(1L);
        when(participantRepository.countEliminatedInWeek(competition.getId(), upcomingWeek.getWeekNumber())).thenReturn(0L);

        GameweekSelectionsData data = controller.getSelections(competition.getId(), upcomingWeek.getId(), request).getBody();

        assertThat(data.selections()).isEmpty();
        assertThat(data.weekNumber()).isEqualTo(1);
        verifyNoInteractions(pickService);
    }


    @Test
    void selectionsReturnNotModifiedWhenEtagMatches() {
        when(gameweekRepository.findById(upcomingWeek.getId())).thenReturn(Optional.of(upcomingWeek));
        when(participantRepository.countActiveAtStartForWeek(competition.getId(), upcomingWeek.getWeekNumber())).thenReturn(1L);
        when(participantRepository.countEliminatedInWeek(competition.getId(), upcomingWeek.getWeekNumber())).thenReturn(0L);
        when(request.getHeader("If-None-Match")).thenReturn(null);

        ResponseEntity<GameweekSelectionsData> initial = controller.getSelections(
                competition.getId(), upcomingWeek.getId(), request);
        String etag = initial.getHeaders().getETag();
        when(request.getHeader("If-None-Match")).thenReturn(etag);

        ResponseEntity<GameweekSelectionsData> unchanged = controller.getSelections(
                competition.getId(), upcomingWeek.getId(), request);

        assertThat(unchanged.getStatusCode()).isEqualTo(HttpStatus.NOT_MODIFIED);
        assertThat(unchanged.getBody()).isNull();
    }

    @Test
    void survivorTableRedactsUpcomingPicksButShowsLockedPicks() {
        Pick upcomingPick = new Pick(competition, user, participant, upcomingWeek, arsenal, PickSource.USER, false);
        upcomingPick.setId(500L);
        Pick lockedPick = new Pick(competition, user, participant, lockedWeek, chelsea, PickSource.USER, true);
        lockedPick.setId(501L);

        when(gameweekRepository.findByCompetitionIdOrderByWeekNumberAsc(competition.getId()))
                .thenReturn(List.of(upcomingWeek, lockedWeek));
        when(participantRepository.findByCompetitionId(competition.getId())).thenReturn(List.of(participant));
        when(pickRepository.findByCompetitionIdFetchForSurvivor(competition.getId())).thenReturn(List.of(upcomingPick, lockedPick));
        when(pickResultRepository.findByPickIdIn(List.of(500L, 501L))).thenReturn(List.of());
        when(fixtureRepository.findByGameweekIdIn(List.of(upcomingWeek.getId(), lockedWeek.getId()))).thenReturn(List.of());
        when(request.getHeader("If-None-Match")).thenReturn(null);

        SurvivorTableResponse response = controller.getSurvivorTable(competition.getId(), request).getBody();

        assertThat(response).isNotNull();
        Map<Integer, ?> picks = response.rows().get(0).picks();
        assertThat(picks).doesNotContainKey(1);
        assertThat(response.rows().get(0).picks().get(2).teamShortName()).isEqualTo("CHE");
    }
}
