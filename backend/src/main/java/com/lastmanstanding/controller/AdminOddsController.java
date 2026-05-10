package com.lastmanstanding.controller;

import com.lastmanstanding.entity.Fixture;
import com.lastmanstanding.repository.FixtureRepository;
import com.lastmanstanding.repository.GameweekRepository;
import com.lastmanstanding.service.FixtureOddsSyncService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/admin/odds")
public class AdminOddsController {

    private final FixtureRepository fixtureRepository;
    private final GameweekRepository gameweekRepository;
    private final FixtureOddsSyncService fixtureOddsSyncService;

    public AdminOddsController(FixtureRepository fixtureRepository,
                               GameweekRepository gameweekRepository,
                               FixtureOddsSyncService fixtureOddsSyncService) {
        this.fixtureRepository = fixtureRepository;
        this.gameweekRepository = gameweekRepository;
        this.fixtureOddsSyncService = fixtureOddsSyncService;
    }

    @GetMapping("/debug")
    public FixtureOddsSyncService.OddsDebugResponse debug(@RequestParam Long competitionId) {
        List<Long> gameweekIds = gameweekRepository.findIdsByCompetitionIdOrderByWeekNumberAsc(competitionId);
        if (gameweekIds.isEmpty()) {
            return new FixtureOddsSyncService.OddsDebugResponse(true, true, "No gameweeks found for competition", List.of());
        }
        List<Fixture> fixtures = fixtureRepository.findByGameweekIdIn(gameweekIds);
        return fixtureOddsSyncService.debugFixtures(fixtures);
    }

    @PostMapping("/sync-now")
    public SyncNowResponse syncNow() {
        int updated = fixtureOddsSyncService.syncOdds();
        return new SyncNowResponse(updated);
    }

    public record SyncNowResponse(int updatedFixtures) {}
}
