package com.lastmanstanding.controller;

import com.lastmanstanding.dto.CompetitionDtos.SurvivorRow;
import com.lastmanstanding.dto.CompetitionDtos.SurvivorTableResponse;
import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionStatus;
import com.lastmanstanding.entity.Fixture;
import com.lastmanstanding.entity.FixtureStatus;
import com.lastmanstanding.entity.Gameweek;
import com.lastmanstanding.entity.GameweekStatus;
import com.lastmanstanding.entity.MissedPickMode;
import com.lastmanstanding.entity.ParticipantStatus;
import com.lastmanstanding.entity.PickOutcome;
import com.lastmanstanding.entity.PickSource;
import com.lastmanstanding.entity.Role;
import com.lastmanstanding.entity.Team;
import com.lastmanstanding.entity.User;
import com.lastmanstanding.repository.ClubRepository;
import com.lastmanstanding.repository.CompetitionParticipantRepository;
import com.lastmanstanding.repository.CompetitionRepository;
import com.lastmanstanding.repository.FixtureRepository;
import com.lastmanstanding.repository.GameweekRepository;
import com.lastmanstanding.repository.PaymentRepository;
import com.lastmanstanding.repository.PickRepository;
import com.lastmanstanding.repository.PickResultRepository;
import com.lastmanstanding.repository.TeamRepository;
import com.lastmanstanding.service.CompetitionService;
import com.lastmanstanding.service.PickService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CompetitionControllerSurvivorTableTest {

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

    private CompetitionController controller;

    @BeforeEach
    void setUp() {
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
    void survivorTable_mapsProjectionRowsAndUsesLiveOutcomeForPendingInProgressPicks() {
        long competitionId = 55L;
        long participantId = 101L;
        long userId = 309L;
        long gameweekId = 701L;
        long teamId = 801L;

        User creator = new User("creator@example.com", "creator", "x", Role.ADMIN);
        creator.setId(1L);
        Competition competition = new Competition();
        competition.setId(competitionId);
        competition.setName("Comp");
        competition.setStatus(CompetitionStatus.ACTIVE);
        competition.setMissedPickMode(MissedPickMode.ELIMINATE);
        competition.setCreatedBy(creator);

        Gameweek gw = new Gameweek(
                competition,
                3,
                LocalDateTime.now().minusDays(1),
                LocalDateTime.now().minusHours(3),
                LocalDateTime.now().plusHours(3),
                GameweekStatus.IN_PROGRESS
        );
        gw.setId(gameweekId);

        Team home = new Team("Home FC", "HFC", "home-ext", null);
        home.setId(teamId);
        Team away = new Team("Away FC", "AFC", "away-ext", null);
        away.setId(802L);

        Fixture fixture = new Fixture(gw, "fx-1", home, away, LocalDateTime.now().minusHours(1), FixtureStatus.FINISHED);
        fixture.setImportedScoreHome(2);
        fixture.setImportedScoreAway(0);

        when(gameweekRepository.findByCompetitionIdOrderByWeekNumberAsc(competitionId)).thenReturn(List.of(gw));
        when(participantRepository.findSurvivorParticipantRowsByCompetitionId(competitionId)).thenReturn(
                java.util.Collections.singletonList(
                        new Object[]{participantId, userId, "alan", 2, ParticipantStatus.ACTIVE, null, true, 2}
                ));
        when(pickRepository.findSurvivorPickRowsByCompetitionId(competitionId)).thenReturn(
                java.util.Collections.singletonList(
                        new Object[]{participantId, gameweekId, 3, teamId, "HFC", PickSource.USER, true, PickOutcome.PENDING}
                ));
        when(fixtureRepository.findByGameweekIdIn(anyList())).thenReturn(List.of(fixture));

        SurvivorTableResponse response = controller.getSurvivorTable(competitionId);

        assertEquals(1, response.gameweeks().size());
        assertEquals(3, response.gameweeks().get(0).weekNumber());
        assertEquals("IN_PROGRESS", response.gameweeks().get(0).status());

        assertEquals(1, response.rows().size());
        SurvivorRow row = response.rows().get(0);
        assertEquals(participantId, row.participantId());
        assertEquals(userId, row.userId());
        assertEquals("alan", row.username());
        assertEquals(2, row.entryNumber());
        assertEquals("ACTIVE", row.status());
        assertEquals(true, row.lifelineUsed());
        assertEquals(2, row.lifelineUsedWeek());

        assertNotNull(row.picks().get(3));
        assertEquals("HFC", row.picks().get(3).teamShortName());
        assertEquals("ADVANCE", row.picks().get(3).outcome());
        assertEquals("USER", row.picks().get(3).source());
        assertEquals(true, row.picks().get(3).useLifeline());
    }
}
