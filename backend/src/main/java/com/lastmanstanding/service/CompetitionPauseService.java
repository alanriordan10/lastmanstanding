package com.lastmanstanding.service;

import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionStatus;
import com.lastmanstanding.entity.Gameweek;
import com.lastmanstanding.entity.GameweekStatus;
import com.lastmanstanding.repository.CompetitionRepository;
import com.lastmanstanding.repository.GameweekRepository;
import com.lastmanstanding.repository.FixtureRepository;
import com.lastmanstanding.repository.PickRepository;
import com.lastmanstanding.repository.PickResultRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class CompetitionPauseService {

    private final CompetitionRepository competitionRepository;
    private final GameweekRepository gameweekRepository;
    private final FixtureRepository fixtureRepository;
    private final PickRepository pickRepository;
    private final PickResultRepository pickResultRepository;
    private final CompetitionCacheService competitionCacheService;

    public CompetitionPauseService(CompetitionRepository competitionRepository,
                                   GameweekRepository gameweekRepository,
                                   FixtureRepository fixtureRepository,
                                   PickRepository pickRepository,
                                   PickResultRepository pickResultRepository,
                                   CompetitionCacheService competitionCacheService) {
        this.competitionRepository = competitionRepository;
        this.gameweekRepository = gameweekRepository;
        this.fixtureRepository = fixtureRepository;
        this.pickRepository = pickRepository;
        this.pickResultRepository = pickResultRepository;
        this.competitionCacheService = competitionCacheService;
    }

    @Transactional
    public Competition pause(Long competitionId, String reason) {
        Competition competition = getCompetition(competitionId);
        if (competition.getStatus() == CompetitionStatus.COMPLETED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A completed competition cannot be paused");
        }
        if (competition.isPaused()) return competition;
        String cleanReason = reason == null ? "" : reason.trim();
        if (cleanReason.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A pause reason is required");
        }
        if (cleanReason.length() > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pause reason must be 500 characters or fewer");
        }
        competition.setPaused(true);
        competition.setPauseReason(cleanReason);
        competition.setPausedAt(LocalDateTime.now());
        competitionRepository.save(competition);
        competitionCacheService.evictCompetition(competitionId);
        return competition;
    }

    @Transactional
    public Competition resume(Long competitionId) {
        Competition competition = getCompetition(competitionId);
        if (!competition.isPaused()) return competition;

        voidGameweeksLockedDuringPause(competition);

        competition.setPaused(false);
        competition.setPauseReason(null);
        competition.setPausedAt(null);
        competitionRepository.save(competition);
        competitionCacheService.evictCompetition(competitionId);
        return competition;
    }

    private void voidGameweeksLockedDuringPause(Competition competition) {
        LocalDateTime pausedAt = competition.getPausedAt();
        if (pausedAt == null) return;
        LocalDateTime resumedAt = LocalDateTime.now();

        List<Gameweek> candidateGameweeks = gameweekRepository
                .findByCompetitionIdOrderByWeekNumberAsc(competition.getId())
                .stream()
                .filter(gameweek -> gameweek.getStatus() != GameweekStatus.COMPLETED)
                .filter(gameweek -> gameweek.getLockAt() != null)
                .toList();
        List<Long> candidateIds = candidateGameweeks.stream().map(Gameweek::getId).toList();
        java.util.Map<Long, List<com.lastmanstanding.entity.Fixture>> fixturesByGameweek = candidateIds.isEmpty()
                ? java.util.Map.of()
                : fixtureRepository.findByGameweekIdIn(candidateIds).stream()
                        .collect(java.util.stream.Collectors.groupingBy(fixture -> fixture.getGameweek().getId()));

        List<Gameweek> voidedGameweeks = candidateGameweeks.stream()
                .filter(gameweek -> {
                    boolean lockPassedDuringPause = gameweek.getLockAt().isAfter(pausedAt)
                            && !gameweek.getLockAt().isAfter(resumedAt);
                    List<com.lastmanstanding.entity.Fixture> fixtures = fixturesByGameweek
                            .getOrDefault(gameweek.getId(), List.of());
                    boolean fixturesResolvedWhileStatusLagged = gameweek.getStatus() == GameweekStatus.UPCOMING
                            && !fixtures.isEmpty()
                            && fixtures.stream().allMatch(fixture ->
                                    fixture.getEffectiveStatus() == com.lastmanstanding.entity.FixtureStatus.FINISHED
                                            || fixture.getEffectiveStatus() == com.lastmanstanding.entity.FixtureStatus.POSTPONED
                                            || fixture.getEffectiveStatus() == com.lastmanstanding.entity.FixtureStatus.CANCELLED);
                    return lockPassedDuringPause || fixturesResolvedWhileStatusLagged;
                })
                .toList();
        if (voidedGameweeks.isEmpty()) return;

        List<Long> gameweekIds = voidedGameweeks.stream().map(Gameweek::getId).toList();
        pickResultRepository.deleteByGameweekIds(gameweekIds);
        pickRepository.deleteByGameweekIds(gameweekIds);

        for (Gameweek gameweek : voidedGameweeks) {
            gameweek.setStatus(GameweekStatus.COMPLETED);
            gameweek.setByeGranted(true);
            gameweek.setVoided(true);
            gameweek.setVoidReason("Competition was paused when this gameweek locked. All active entries advance.");
        }
        gameweekRepository.saveAll(voidedGameweeks);
    }

    private Competition getCompetition(Long competitionId) {
        return competitionRepository.findById(competitionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));
    }
}
