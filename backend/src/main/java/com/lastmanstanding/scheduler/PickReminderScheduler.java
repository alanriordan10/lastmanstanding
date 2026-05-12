package com.lastmanstanding.scheduler;

import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.Gameweek;
import com.lastmanstanding.repository.CompetitionRepository;
import com.lastmanstanding.repository.GameweekRepository;
import com.lastmanstanding.service.GameweekEmailService;
import com.lastmanstanding.service.WebPushService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Runs every 15 minutes. Finds UPCOMING gameweeks locking within 2 hours
 * that haven't had a reminder sent, and emails any active participants who
 * have not yet made their pick.
 */
@Component
public class PickReminderScheduler {

    private static final Logger log = LoggerFactory.getLogger(PickReminderScheduler.class);

    private final GameweekRepository gameweekRepository;
    private final CompetitionRepository competitionRepository;
    private final GameweekEmailService gameweekEmailService;
    private final WebPushService webPushService;

    public PickReminderScheduler(GameweekRepository gameweekRepository,
                                 CompetitionRepository competitionRepository,
                                 GameweekEmailService gameweekEmailService,
                                 WebPushService webPushService) {
        this.gameweekRepository = gameweekRepository;
        this.competitionRepository = competitionRepository;
        this.gameweekEmailService = gameweekEmailService;
        this.webPushService = webPushService;
    }

    @Scheduled(fixedDelay = 900_000) // every 15 minutes
    @Transactional
    public void sendReminders() {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime cutoff = now.plusHours(2);

        List<Gameweek> gameweeks = gameweekRepository.findGameweeksNeedingReminder(now, cutoff);
        if (gameweeks.isEmpty()) return;

        log.info("PickReminderScheduler: {} gameweek(s) locking within 2h — sending reminders", gameweeks.size());

        for (Gameweek gw : gameweeks) {
            Competition comp = competitionRepository.findById(gw.getCompetition().getId()).orElse(null);
            if (comp == null) continue;
            try {
                GameweekEmailService.ReminderSendResult emailResult = gameweekEmailService.sendPickReminderEmails(comp, gw);
                webPushService.sendPickReminderNotifications(comp, gw);

                if (emailResult.mailDisabled()) {
                    log.info("GW{} competition {} reminders not marked sent because mail is disabled",
                            gw.getWeekNumber(), comp.getId());
                    continue;
                }

                if (emailResult.failed() > 0) {
                    log.warn("GW{} competition {} reminder emails had failures (attempted={}, sent={}, failed={}) — will retry next run",
                            gw.getWeekNumber(), comp.getId(), emailResult.attempted(), emailResult.sent(), emailResult.failed());
                    continue;
                }

                // Mark sent if all attempted reminders succeeded, or there were no eligible recipients.
                gw.setReminderSent(true);
                gameweekRepository.save(gw);
                log.info("GW{} competition {} reminders marked sent (attempted={}, sent={})",
                        gw.getWeekNumber(), comp.getId(), emailResult.attempted(), emailResult.sent());
            } catch (Exception e) {
                log.warn("Error sending reminders for GW{} competition {}: {}", gw.getWeekNumber(), comp.getId(), e.getMessage());
            }
        }
    }
}
