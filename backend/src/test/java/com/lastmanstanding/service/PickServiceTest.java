package com.lastmanstanding.service;

import com.lastmanstanding.entity.*;
import com.lastmanstanding.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PickServiceTest {

    @Mock private PickRepository pickRepository;
    @Mock private PickResultRepository pickResultRepository;
    @Mock private CompetitionParticipantRepository participantRepository;
    @Mock private GameweekRepository gameweekRepository;
    @Mock private FixtureRepository fixtureRepository;
    @Mock private TeamRepository teamRepository;

    @InjectMocks
    private PickService pickService;

    private User user;
    private Competition competition;
    private Gameweek gameweek;
    private Team arsenal, chelsea;
    private CompetitionParticipant participant;

    @BeforeEach
    void setUp() {
        user = new User("alice@test.com", "alice", "hash", Role.USER);
        user.setId(1L);

        competition = new Competition("Test Cup", null, BigDecimal.ZERO,
                CompetitionStatus.ACTIVE, MissedPickMode.ELIMINATE, true,
                LocalDate.of(2026, 4, 4), user);
        competition.setId(1L);
        competition.setLifelineEnabled(true);

        gameweek = new Gameweek(competition, 1,
                LocalDateTime.now().plusHours(2), // not yet locked
                LocalDateTime.of(2026, 4, 4, 15, 0),
                LocalDateTime.of(2026, 4, 6, 22, 0),
                GameweekStatus.UPCOMING);
        gameweek.setId(10L);

        arsenal = new Team("Arsenal", "ARS", "EXT-ARS", null);
        arsenal.setId(1L);
        chelsea = new Team("Chelsea", "CHE", "EXT-CHE", null);
        chelsea.setId(2L);

        participant = new CompetitionParticipant(competition, user, ParticipantStatus.ACTIVE);
        participant.setId(100L);
    }

    @Test
    @DisplayName("Successfully make a pick")
    void makePick_success() {
        Fixture fixture = new Fixture(gameweek, "EXT-F1", arsenal, chelsea,
                LocalDateTime.of(2026, 4, 4, 15, 0), FixtureStatus.SCHEDULED);
        fixture.setId(50L);

        when(gameweekRepository.findById(gameweek.getId())).thenReturn(Optional.of(gameweek));
        when(participantRepository.findByCompetitionIdAndUserIdOrderByEntryNumberAsc(competition.getId(), user.getId()))
                .thenReturn(List.of(participant));
        when(teamRepository.findById(arsenal.getId())).thenReturn(Optional.of(arsenal));
        when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(fixture));
        when(pickRepository.findByCompetitionIdAndParticipantIdAndGameweekId(
                competition.getId(), participant.getId(), gameweek.getId()))
                .thenReturn(Optional.empty());
        when(pickRepository.findConsumedTeamIdsForParticipant(competition.getId(), participant.getId()))
                .thenReturn(new ArrayList<>());
        when(pickRepository.save(any(Pick.class))).thenAnswer(i -> {
            Pick p = i.getArgument(0);
            p.setId(1L);
            return p;
        });
        when(pickResultRepository.findByPickId(1L)).thenReturn(Optional.empty());
        when(pickResultRepository.save(any(PickResult.class))).thenAnswer(i -> i.getArgument(0));

        Pick result = pickService.makePick(competition.getId(), gameweek.getId(), arsenal.getId(), user.getId(), null, null);

        assertThat(result.getTeam()).isEqualTo(arsenal);
        assertThat(result.getSource()).isEqualTo(PickSource.USER);
        verify(pickRepository).save(any(Pick.class));
        verify(pickResultRepository).save(any(PickResult.class));
    }

    @Test
    @DisplayName("Mark participant lifeline as used when lifeline is selected")
    void makePick_withLifeline_marksParticipantAsUsed() {
        Fixture fixture = new Fixture(gameweek, "EXT-F1", arsenal, chelsea,
                LocalDateTime.of(2026, 4, 4, 15, 0), FixtureStatus.SCHEDULED);
        fixture.setId(50L);

        when(gameweekRepository.findById(gameweek.getId())).thenReturn(Optional.of(gameweek));
        when(participantRepository.findByCompetitionIdAndUserIdOrderByEntryNumberAsc(competition.getId(), user.getId()))
                .thenReturn(List.of(participant));
        when(teamRepository.findById(arsenal.getId())).thenReturn(Optional.of(arsenal));
        when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(fixture));
        when(pickRepository.findByCompetitionIdAndParticipantIdAndGameweekId(
                competition.getId(), participant.getId(), gameweek.getId()))
                .thenReturn(Optional.empty());
        when(pickRepository.findConsumedTeamIdsForParticipant(competition.getId(), participant.getId()))
                .thenReturn(new ArrayList<>());
        when(pickRepository.save(any(Pick.class))).thenAnswer(i -> {
            Pick p = i.getArgument(0);
            p.setId(1L);
            return p;
        });
        when(pickResultRepository.findByPickId(1L)).thenReturn(Optional.empty());
        when(pickResultRepository.save(any(PickResult.class))).thenAnswer(i -> i.getArgument(0));

        Pick result = pickService.makePick(competition.getId(), gameweek.getId(), arsenal.getId(), user.getId(), null, true);

        assertThat(result.isUseLifeline()).isTrue();
        assertThat(participant.isLifelineUsed()).isTrue();
        assertThat(participant.getLifelineUsedWeek()).isEqualTo(gameweek.getWeekNumber());
    }

    @Test
    @DisplayName("Clear participant lifeline when removing lifeline from the same gameweek pick")
    void makePick_removeLifeline_clearsParticipantState() {
        Fixture fixture = new Fixture(gameweek, "EXT-F1", arsenal, chelsea,
                LocalDateTime.of(2026, 4, 4, 15, 0), FixtureStatus.SCHEDULED);
        fixture.setId(50L);

        participant.setLifelineUsed(true);
        participant.setLifelineUsedWeek(gameweek.getWeekNumber());
        Pick existing = new Pick(competition, user, participant, gameweek, arsenal, PickSource.USER, false);
        existing.setUseLifeline(true);
        existing.setId(2L);

        when(gameweekRepository.findById(gameweek.getId())).thenReturn(Optional.of(gameweek));
        when(participantRepository.findByCompetitionIdAndUserIdOrderByEntryNumberAsc(competition.getId(), user.getId()))
                .thenReturn(List.of(participant));
        when(teamRepository.findById(arsenal.getId())).thenReturn(Optional.of(arsenal));
        when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(fixture));
        when(pickRepository.findByCompetitionIdAndParticipantIdAndGameweekId(
                competition.getId(), participant.getId(), gameweek.getId()))
                .thenReturn(Optional.of(existing));
        when(pickRepository.findConsumedTeamIdsForParticipant(competition.getId(), participant.getId()))
                .thenReturn(new ArrayList<>(List.of(arsenal.getId())));
        when(pickRepository.existsOtherLifelinePick(competition.getId(), participant.getId(), gameweek.getId()))
                .thenReturn(false);
        when(pickRepository.save(any(Pick.class))).thenAnswer(i -> i.getArgument(0));
        when(pickResultRepository.findByPickId(existing.getId())).thenReturn(Optional.of(new PickResult(existing, PickOutcome.PENDING)));

        Pick result = pickService.makePick(competition.getId(), gameweek.getId(), arsenal.getId(), user.getId(), null, false);

        assertThat(result.isUseLifeline()).isFalse();
        assertThat(participant.isLifelineUsed()).isFalse();
        assertThat(participant.getLifelineUsedWeek()).isNull();
    }

    @Test
    @DisplayName("Allow changing team when lifeline is already selected on current gameweek pick")
    void makePick_changeTeamWithCurrentLifeline_allowsUpdate() {
        Fixture fixture = new Fixture(gameweek, "EXT-F1", arsenal, chelsea,
                LocalDateTime.of(2026, 4, 4, 15, 0), FixtureStatus.SCHEDULED);
        fixture.setId(50L);

        participant.setLifelineUsed(true);
        participant.setLifelineUsedWeek(gameweek.getWeekNumber());
        Pick existing = new Pick(competition, user, participant, gameweek, arsenal, PickSource.USER, false);
        existing.setUseLifeline(true);
        existing.setId(3L);

        when(gameweekRepository.findById(gameweek.getId())).thenReturn(Optional.of(gameweek));
        when(participantRepository.findByCompetitionIdAndUserIdOrderByEntryNumberAsc(competition.getId(), user.getId()))
                .thenReturn(List.of(participant));
        when(teamRepository.findById(chelsea.getId())).thenReturn(Optional.of(chelsea));
        when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(fixture));
        when(pickRepository.findByCompetitionIdAndParticipantIdAndGameweekId(
                competition.getId(), participant.getId(), gameweek.getId()))
                .thenReturn(Optional.of(existing));
        when(pickRepository.findConsumedTeamIdsForParticipant(competition.getId(), participant.getId()))
                .thenReturn(new ArrayList<>(List.of(arsenal.getId())));
        when(pickRepository.existsOtherLifelinePick(competition.getId(), participant.getId(), gameweek.getId()))
                .thenReturn(false);
        when(pickRepository.save(any(Pick.class))).thenAnswer(i -> i.getArgument(0));
        when(pickResultRepository.findByPickId(existing.getId())).thenReturn(Optional.of(new PickResult(existing, PickOutcome.PENDING)));

        Pick result = pickService.makePick(competition.getId(), gameweek.getId(), chelsea.getId(), user.getId(), null, true);

        assertThat(result.getTeam()).isEqualTo(chelsea);
        assertThat(result.isUseLifeline()).isTrue();
    }

    @Test
    @DisplayName("Reject pick after lock time")
    void makePick_afterLock_throws() {
        gameweek.setLockAt(LocalDateTime.now().minusHours(1)); // already locked

        when(gameweekRepository.findById(gameweek.getId())).thenReturn(Optional.of(gameweek));

        assertThatThrownBy(() ->
                pickService.makePick(competition.getId(), gameweek.getId(), arsenal.getId(), user.getId(), null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("locked");
    }

    @Test
    @DisplayName("Reject pick if team already used")
    void makePick_teamAlreadyUsed_throws() {
        Fixture fixture = new Fixture(gameweek, "EXT-F1", arsenal, chelsea,
                LocalDateTime.of(2026, 4, 4, 15, 0), FixtureStatus.SCHEDULED);
        fixture.setId(50L);

        when(gameweekRepository.findById(gameweek.getId())).thenReturn(Optional.of(gameweek));
        when(participantRepository.findByCompetitionIdAndUserIdOrderByEntryNumberAsc(competition.getId(), user.getId()))
                .thenReturn(List.of(participant));
        when(teamRepository.findById(arsenal.getId())).thenReturn(Optional.of(arsenal));
        when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(fixture));
        when(pickRepository.findByCompetitionIdAndParticipantIdAndGameweekId(
                competition.getId(), participant.getId(), gameweek.getId()))
                .thenReturn(Optional.empty());
        // Arsenal already used in a previous week
        when(pickRepository.findConsumedTeamIdsForParticipant(competition.getId(), participant.getId()))
                .thenReturn(new ArrayList<>(List.of(arsenal.getId())));

        assertThatThrownBy(() ->
                pickService.makePick(competition.getId(), gameweek.getId(), arsenal.getId(), user.getId(), null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("already used");
    }

    @Test
    @DisplayName("Reject pick if participant is eliminated")
    void makePick_eliminated_throws() {
        participant.setStatus(ParticipantStatus.ELIMINATED);

        when(gameweekRepository.findById(gameweek.getId())).thenReturn(Optional.of(gameweek));
        when(participantRepository.findByCompetitionIdAndUserIdOrderByEntryNumberAsc(competition.getId(), user.getId()))
                .thenReturn(List.of(participant));

        assertThatThrownBy(() ->
                pickService.makePick(competition.getId(), gameweek.getId(), arsenal.getId(), user.getId(), null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("eliminated");
    }

    @Test
    @DisplayName("Reject pick if team has no fixture this gameweek")
    void makePick_noFixture_throws() {
        // Only Liverpool vs Everton this gameweek, not Arsenal
        Team liverpool = new Team("Liverpool", "LIV", "EXT-LIV", null);
        liverpool.setId(3L);
        Team everton = new Team("Everton", "EVE", "EXT-EVE", null);
        everton.setId(4L);

        Fixture fixture = new Fixture(gameweek, "EXT-F1", liverpool, everton,
                LocalDateTime.of(2026, 4, 4, 15, 0), FixtureStatus.SCHEDULED);
        fixture.setId(50L);

        when(gameweekRepository.findById(gameweek.getId())).thenReturn(Optional.of(gameweek));
        when(participantRepository.findByCompetitionIdAndUserIdOrderByEntryNumberAsc(competition.getId(), user.getId()))
                .thenReturn(List.of(participant));
        when(teamRepository.findById(arsenal.getId())).thenReturn(Optional.of(arsenal));
        when(fixtureRepository.findByGameweekId(gameweek.getId())).thenReturn(List.of(fixture));

        assertThatThrownBy(() ->
                pickService.makePick(competition.getId(), gameweek.getId(), arsenal.getId(), user.getId(), null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("no fixture");
    }

    @Test
    @DisplayName("Selections hidden before lock time")
    void selections_beforeLock_throws() {
        gameweek.setLockAt(LocalDateTime.now().plusHours(2));
        when(gameweekRepository.findById(gameweek.getId())).thenReturn(Optional.of(gameweek));

        assertThatThrownBy(() ->
                pickService.getGameweekSelections(competition.getId(), gameweek.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("hidden");
    }
}
