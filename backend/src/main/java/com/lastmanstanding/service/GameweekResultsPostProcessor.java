package com.lastmanstanding.service;

import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionStatus;
import com.lastmanstanding.entity.Gameweek;
import com.lastmanstanding.entity.GameweekStatus;
import com.lastmanstanding.repository.CompetitionRepository;
import com.lastmanstanding.repository.GameweekRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Service
public class GameweekResultsPostProcessor {

    private static final Logger log = LoggerFactory.getLogger(GameweekResultsPostProcessor.class);
    private static final int MIN_UPCOMING_BUFFER = 3;

    private final CompetitionRepository competitionRepository;
    private final GameweekRepository gameweekRepository;
    private final FixtureSyncService fixtureSyncService;
    private final GameweekEmailService gameweekEmailService;
    private final WebPushService webPushService;

    public GameweekResultsPostProcessor(CompetitionRepository competitionRepository,
                                        GameweekRepository gameweekRepository,
                                        FixtureSyncService fixtureSyncService,
                                        GameweekEmailService gameweekEmailService,
                                        WebPushService webPushService) {
        this.competitionRepository = competitionRepository;
        this.gameweekRepository = gameweekRepository;
        this.fixtureSyncService = fixtureSyncService;
        this.gameweekEmailService = gameweekEmailService;
        this.webPushService = webPushService;
    }

    @Async("notificationExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handle(GameweekResultsFinalizedEvent event) {
        Competition competition = competitionRepository.findById(event.competitionId()).orElse(null);
        Gameweek gameweek = gameweekRepository.findById(event.gameweekId()).orElse(null);
        if (competition == null || gameweek == null) return;

        if (competition.getStatus() != CompetitionStatus.COMPLETED) {
            long upcomingCount = gameweekRepository.countByCompetitionIdAndStatus(
                    competition.getId(), GameweekStatus.UPCOMING);
            if (upcomingCount < MIN_UPCOMING_BUFFER) {
                try {
                    int added = fixtureSyncService.syncForCompetition(competition);
                    log.info("Post-processing buffered {} fixture(s) for competition {}",
                            added, competition.getId());
                } catch (Exception e) {
                    log.warn("Could not buffer fixtures after GW{} for competition {}: {}",
                            gameweek.getWeekNumber(), competition.getId(), e.getMessage());
                }
            }
        }

        if (!gameweek.isResultsEmailSent()) {
            try {
                gameweekEmailService.sendGameweekResultEmails(competition, gameweek);
                gameweek.setResultsEmailSent(true);
                gameweekRepository.save(gameweek);
            } catch (Exception e) {
                log.warn("Failed to send result emails for GW{} competition {}: {}",
                        gameweek.getWeekNumber(), competition.getId(), e.getMessage());
            }
        }

        try {
            webPushService.sendGameweekResultNotifications(competition, gameweek);
        } catch (Throwable e) {
            log.warn("Failed to send result notifications for GW{} competition {}: {}",
                    gameweek.getWeekNumber(), competition.getId(), e.getMessage());
        }
    }
}
