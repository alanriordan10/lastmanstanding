package com.lastmanstanding.service;

import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionStatus;
import com.lastmanstanding.entity.Gameweek;
import com.lastmanstanding.entity.GameweekStatus;
import com.lastmanstanding.entity.MissedPickMode;
import com.lastmanstanding.entity.User;
import com.lastmanstanding.repository.CompetitionRepository;
import com.lastmanstanding.repository.GameweekRepository;
import com.lastmanstanding.repository.FixtureRepository;
import com.lastmanstanding.repository.PickRepository;
import com.lastmanstanding.repository.PickResultRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CompetitionPauseServiceTest {

    @Mock private CompetitionRepository competitionRepository;
    @Mock private GameweekRepository gameweekRepository;
    @Mock private FixtureRepository fixtureRepository;
    @Mock private PickRepository pickRepository;
    @Mock private PickResultRepository pickResultRepository;
    @Mock private CompetitionCacheService competitionCacheService;

    @InjectMocks private CompetitionPauseService service;

    private Competition competition;

    @BeforeEach
    void setUp() {
        competition = new Competition("Pause Test", null, BigDecimal.ZERO,
                CompetitionStatus.ACTIVE, MissedPickMode.ELIMINATE, true,
                LocalDate.of(2026, 6, 20), new User());
        competition.setId(42L);
    }

    @Test
    void pauseStoresReasonAndTimestamp() {
        when(competitionRepository.findById(42L)).thenReturn(Optional.of(competition));

        Competition paused = service.pause(42L, " Awaiting corrected result ");

        assertThat(paused.isPaused()).isTrue();
        assertThat(paused.getPauseReason()).isEqualTo("Awaiting corrected result");
        assertThat(paused.getPausedAt()).isNotNull();
        verify(competitionRepository).save(competition);
        verify(competitionCacheService).evictCompetition(42L);
    }

    @Test
    void resumeVoidsGameweekWhoseLockPassedDuringPause() {
        LocalDateTime pausedAt = LocalDateTime.now().minusHours(3);
        Gameweek voided = new Gameweek(competition, 2, pausedAt.plusHours(1),
                pausedAt.plusHours(1), pausedAt.plusDays(2), GameweekStatus.IN_PROGRESS);
        voided.setId(22L);
        Gameweek future = new Gameweek(competition, 3, LocalDateTime.now().plusHours(2),
                LocalDateTime.now().plusHours(2), LocalDateTime.now().plusDays(2), GameweekStatus.UPCOMING);
        future.setId(23L);
        competition.setPaused(true);
        competition.setPauseReason("Weather delay");
        competition.setPausedAt(pausedAt);
        when(competitionRepository.findById(42L)).thenReturn(Optional.of(competition));
        when(gameweekRepository.findByCompetitionIdOrderByWeekNumberAsc(42L)).thenReturn(List.of(voided, future));
        when(fixtureRepository.findByGameweekIdIn(List.of(22L, 23L))).thenReturn(List.of());

        service.resume(42L);

        assertThat(voided.getStatus()).isEqualTo(GameweekStatus.COMPLETED);
        assertThat(voided.isVoided()).isTrue();
        assertThat(voided.isByeGranted()).isTrue();
        assertThat(future.getStatus()).isEqualTo(GameweekStatus.UPCOMING);
        assertThat(future.getLockAt()).isAfter(LocalDateTime.now());
        verify(pickResultRepository).deleteByGameweekIds(List.of(22L));
        verify(pickRepository).deleteByGameweekIds(List.of(22L));
        verify(gameweekRepository).saveAll(List.of(voided));
        assertThat(competition.isPaused()).isFalse();
        verify(competitionRepository).save(competition);
        verify(competitionCacheService).evictCompetition(42L);
    }

    @Test
    void completedCompetitionCannotBePaused() {
        competition.setStatus(CompetitionStatus.COMPLETED);
        when(competitionRepository.findById(42L)).thenReturn(Optional.of(competition));

        ResponseStatusException error = catchThrowableOfType(
                () -> service.pause(42L, "Too late"),
                ResponseStatusException.class);

        assertThat(error.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        verify(competitionRepository, never()).save(competition);
    }
}
