package com.lastmanstanding.service;

import com.lastmanstanding.entity.*;
import com.lastmanstanding.repository.PickRepository;
import com.lastmanstanding.repository.PickResultRepository;
import com.lastmanstanding.repository.CompetitionParticipantRepository;
import com.lastmanstanding.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.mail.internet.MimeMessage;
import java.util.List;

@Service
public class GameweekEmailService {

    private static final Logger log = LoggerFactory.getLogger(GameweekEmailService.class);

    private final JavaMailSender mailSender;
    private final UserRepository userRepository;
    private final PickRepository pickRepository;
    private final PickResultRepository pickResultRepository;
    private final CompetitionParticipantRepository participantRepository;

    @Value("${app.mail-from:noreply@lastmanstanding.com}")
    private String mailFrom;

    @Value("${app.mail-enabled:false}")
    private boolean mailEnabled;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    public GameweekEmailService(JavaMailSender mailSender,
                                UserRepository userRepository,
                                PickRepository pickRepository,
                                PickResultRepository pickResultRepository,
                                CompetitionParticipantRepository participantRepository) {
        this.mailSender = mailSender;
        this.userRepository = userRepository;
        this.pickRepository = pickRepository;
        this.pickResultRepository = pickResultRepository;
        this.participantRepository = participantRepository;
    }

    /**
     * Send gameweek result emails to all opted-in participants of the competition.
     */
    @Transactional(readOnly = true)
    public void sendGameweekResultEmails(Competition comp, Gameweek gw) {
        if (!mailEnabled) {
            log.info("Mail is disabled (app.mail-enabled=false) — skipping result emails for GW{} competition {}. " +
                     "Set MAIL_ENABLED=true and configure MAIL_HOST/USERNAME/PASSWORD to enable.",
                     gw.getWeekNumber(), comp.getId());
            return;
        }

        List<CompetitionParticipant> participants = participantRepository.findByCompetitionId(comp.getId());

        long optedIn = participants.stream()
                .map(cp -> userRepository.findById(cp.getUser().getId()).orElse(null))
                .filter(u -> u != null && u.isEmailResultsOptIn())
                .count();

        log.info("Sending GW{} result emails for competition {} — {} of {} participants opted in",
                gw.getWeekNumber(), comp.getId(), optedIn, participants.size());

        for (CompetitionParticipant cp : participants) {
            // Re-fetch user to avoid lazy loading issues
            User user = userRepository.findById(cp.getUser().getId()).orElse(null);
            if (user == null || !user.isEmailResultsOptIn()) continue;

            try {
                sendResultEmailToUser(user, comp, gw, cp);
            } catch (Exception e) {
                log.warn("Failed to send result email to {} for GW{}: {}", user.getEmail(), gw.getWeekNumber(), e.getMessage());
            }
        }
    }

    private void sendResultEmailToUser(User user, Competition comp, Gameweek gw,
                                       CompetitionParticipant cp) throws Exception {
        // Find the user's pick and result for this gameweek
        Pick pick = pickRepository.findByCompetitionIdAndUserIdAndGameweekId(
                comp.getId(), user.getId(), gw.getId()).orElse(null);

        String resultLine;
        String statusLine;

        if (pick == null) {
            resultLine = "You had no pick this gameweek.";
            statusLine = "";
        } else {
            PickResult result = pickResultRepository.findByPickId(pick.getId()).orElse(null);
            String outcome = result != null ? result.getOutcome().name() : "PENDING";
            String teamName = pick.getTeam().getName();

            resultLine = switch (outcome) {
                case "ADVANCE"           -> "✅ <strong>" + teamName + "</strong> — You advance to the next round!";
                case "ELIMINATED"        -> "❌ <strong>" + teamName + "</strong> — Unfortunately you have been eliminated.";
                case "POSTPONED_ADVANCE" -> "⏸ <strong>" + teamName + "</strong> — Your fixture was postponed. You advance.";
                default                  -> "⏳ <strong>" + teamName + "</strong> — Result pending.";
            };

            statusLine = switch (cp.getStatus().name()) {
                case "ACTIVE"      -> "You are still in the competition. Good luck next week!";
                case "ELIMINATED"  -> "You have been eliminated from the competition.";
                case "WINNER"      -> "🏆 Congratulations — you are the Last Man Standing!";
                default            -> "";
            };
        }

        // Get gameweek statistics
        GameweekStats stats = calculateGameweekStats(comp.getId(), gw.getId());
        String statsSection = buildStatsSection(stats);

        String subject = "[Last Man Standing] GW" + gw.getWeekNumber() + " Results — " + comp.getName();

        String body = """
                <html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2 style="color:#1a1a2e;">Gameweek %d Results</h2>
                  <p><strong>Competition:</strong> %s</p>
                  <hr/>
                  <p>%s</p>
                  <p>%s</p>
                  %s
                  <hr/>
                  <p style="font-size:12px;color:#666;">
                    <a href="%s/competitions/%d">View competition</a> &middot;
                    <a href="%s/profile">Manage email preferences</a>
                  </p>
                </body></html>
                """.formatted(gw.getWeekNumber(), comp.getName(), resultLine, statusLine,
                statsSection, frontendUrl, comp.getId(), frontendUrl);

        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
        helper.setFrom(mailFrom);
        helper.setTo(user.getEmail());
        helper.setSubject(subject);
        helper.setText(body, true);
        mailSender.send(message);

        log.info("Sent GW{} result email to {}", gw.getWeekNumber(), user.getEmail());
    }

    /**
     * Calculate statistics for a gameweek including eliminated/advanced counts and team pick percentages.
     */
    private GameweekStats calculateGameweekStats(Long competitionId, Long gameweekId) {
        // Get counts by outcome
        List<Object[]> outcomeCounts = pickResultRepository.countByOutcomeForGameweek(competitionId, gameweekId);
        long eliminated = 0;
        long advanced = 0;
        for (Object[] row : outcomeCounts) {
            PickOutcome outcome = (PickOutcome) row[0];
            long count = ((Number) row[1]).longValue();
            if (outcome == PickOutcome.ELIMINATED) {
                eliminated = count;
            } else if (outcome == PickOutcome.ADVANCE || outcome == PickOutcome.POSTPONED_ADVANCE) {
                advanced += count;
            }
        }

        // Get team pick distribution
        List<Object[]> teamPicks = pickRepository.countPicksPerTeam(competitionId, gameweekId);
        long totalPicks = teamPicks.stream().mapToLong(row -> ((Number) row[3]).longValue()).sum();

        List<TeamPickStats> teamStats = new java.util.ArrayList<>();
        for (Object[] row : teamPicks) {
            String teamName = (String) row[1];
            long pickCount = ((Number) row[3]).longValue();
            double percentage = totalPicks > 0 ? (pickCount * 100.0) / totalPicks : 0;
            teamStats.add(new TeamPickStats(teamName, pickCount, percentage));
        }

        // Sort by pick count descending
        teamStats.sort((a, b) -> Long.compare(b.pickCount, a.pickCount));

        return new GameweekStats(eliminated, advanced, totalPicks, teamStats);
    }

    /**
     * Build HTML section for gameweek statistics.
     */
    private String buildStatsSection(GameweekStats stats) {
        if (stats.totalPicks == 0) {
            return "<p style=\"color:#666;font-style:italic;\">No picks data available yet.</p>";
        }

        StringBuilder html = new StringBuilder();
        html.append("<hr/>\n");
        html.append("<h3 style=\"color:#1a1a2e;margin-top:20px;\">📊 Gameweek Summary</h3>\n");
        html.append("<table style=\"width:100%;border-collapse:collapse;margin:15px 0;\">\n");
        html.append("  <tr style=\"background:#f5f5f5;\">\n");
        html.append("    <td style=\"padding:10px;border:1px solid #ddd;\"><strong>Eliminated</strong></td>\n");
        html.append("    <td style=\"padding:10px;border:1px solid #ddd;text-align:right;\">").append(stats.eliminated).append("</td>\n");
        html.append("  </tr>\n");
        html.append("  <tr>\n");
        html.append("    <td style=\"padding:10px;border:1px solid #ddd;\"><strong>Advanced</strong></td>\n");
        html.append("    <td style=\"padding:10px;border:1px solid #ddd;text-align:right;\">").append(stats.advanced).append("</td>\n");
        html.append("  </tr>\n");
        html.append("</table>\n");

        html.append("<h4 style=\"color:#1a1a2e;margin-top:15px;font-size:14px;\">Team Pick Distribution</h4>\n");
        html.append("<table style=\"width:100%;border-collapse:collapse;\">\n");
        html.append("  <tr style=\"background:#f5f5f5;\">\n");
        html.append("    <th style=\"padding:8px;border:1px solid #ddd;text-align:left;\">Team</th>\n");
        html.append("    <th style=\"padding:8px;border:1px solid #ddd;text-align:right;\">Picks</th>\n");
        html.append("    <th style=\"padding:8px;border:1px solid #ddd;text-align:right;\">%</th>\n");
        html.append("  </tr>\n");

        for (TeamPickStats team : stats.teamStats) {
            html.append("  <tr>\n");
            html.append("    <td style=\"padding:8px;border:1px solid #ddd;\">").append(escapeHtml(team.teamName)).append("</td>\n");
            html.append("    <td style=\"padding:8px;border:1px solid #ddd;text-align:right;\">").append(team.pickCount).append("</td>\n");
            html.append("    <td style=\"padding:8px;border:1px solid #ddd;text-align:right;\">").append(String.format("%.1f%%", team.percentage)).append("</td>\n");
            html.append("  </tr>\n");
        }

        html.append("</table>\n");
        return html.toString();
    }

    /**
     * Escape HTML special characters to prevent injection.
     */
    private String escapeHtml(String text) {
        return text.replace("&", "&amp;")
                   .replace("<", "&lt;")
                   .replace(">", "&gt;")
                   .replace("\"", "&quot;")
                   .replace("'", "&#39;");
    }

    /**
     * Internal class to hold gameweek statistics.
     */
    private static class GameweekStats {
        long eliminated;
        long advanced;
        long totalPicks;
        List<TeamPickStats> teamStats;

        GameweekStats(long eliminated, long advanced, long totalPicks, List<TeamPickStats> teamStats) {
            this.eliminated = eliminated;
            this.advanced = advanced;
            this.totalPicks = totalPicks;
            this.teamStats = teamStats;
        }
    }

    /**
     * Internal class to hold team pick statistics.
     */
    private static class TeamPickStats {
        String teamName;
        long pickCount;
        double percentage;

        TeamPickStats(String teamName, long pickCount, double percentage) {
            this.teamName = teamName;
            this.pickCount = pickCount;
            this.percentage = percentage;
        }
    }

    /**
     * Send pick reminder emails to active participants who haven't picked yet.
     * Called ~2 hours before gameweek lock.
     */
    @Transactional(readOnly = true)
    public void sendPickReminderEmails(Competition comp, Gameweek gw) {
        if (!mailEnabled) {
            log.info("Mail disabled — skipping pick reminders for GW{} competition {}", gw.getWeekNumber(), comp.getId());
            return;
        }
        List<CompetitionParticipant> active = participantRepository.findByCompetitionIdAndStatus(
                comp.getId(), com.lastmanstanding.entity.ParticipantStatus.ACTIVE);

        // Find who has already picked
        java.util.Set<Long> alreadyPicked = pickRepository
                .findByCompetitionIdAndGameweekId(comp.getId(), gw.getId())
                .stream().map(p -> p.getUser().getId())
                .collect(java.util.stream.Collectors.toSet());

        for (CompetitionParticipant cp : active) {
            if (alreadyPicked.contains(cp.getUser().getId())) continue;
            User user = userRepository.findById(cp.getUser().getId()).orElse(null);
            if (user == null || !user.isEmailResultsOptIn()) continue;
            try {
                String pickUrl = frontendUrl + "/competitions/" + comp.getId();
                String subject = "⏰ Reminder: Make your pick for " + comp.getName() + " — GW" + gw.getWeekNumber();
                String body = """
                        <html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#0f0f1a;color:#e2e8f0;">
                          <h2 style="color:#818cf8;">⚠️ Pick Reminder</h2>
                          <p>Hi <strong>%s</strong>,</p>
                          <p>You haven't made your pick for <strong>%s — Gameweek %d</strong> yet.</p>
                          <p>The deadline is approaching. If you don't pick before it locks, an automatic selection will be made for you.</p>
                          <p style="margin:24px 0;">
                            <a href="%s" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
                              Make My Pick Now →
                            </a>
                          </p>
                          <p style="color:#64748b;font-size:12px;">You're receiving this because you opted in to email notifications. Manage preferences in your profile.</p>
                        </body></html>
                        """.formatted(user.getUsername(), comp.getName(), gw.getWeekNumber(), pickUrl);

                MimeMessage message = mailSender.createMimeMessage();
                MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
                helper.setFrom(mailFrom);
                helper.setTo(user.getEmail());
                helper.setSubject(subject);
                helper.setText(body, true);
                mailSender.send(message);
                log.info("Sent pick reminder to {} for GW{} competition {}", user.getEmail(), gw.getWeekNumber(), comp.getId());
            } catch (Exception e) {
                log.warn("Failed to send pick reminder to {} for GW{}: {}", cp.getUser().getEmail(), gw.getWeekNumber(), e.getMessage());
            }
        }
    }

    /**
     * Send a password reset link email. Always sends regardless of mailEnabled
     * since users explicitly requested it.
     */
    public void sendPasswordResetEmail(String toEmail, String username, String resetLink) {
        if (!mailEnabled) {
            log.warn("Mail is disabled — cannot send password reset email to {}. " +
                     "Set MAIL_ENABLED=true to enable.", toEmail);
            return;
        }
        try {
            String subject = "[Last Man Standing] Reset your password";
            String body = """
                    <html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                      <h2 style="color:#1a1a2e;">Reset Your Password</h2>
                      <p>Hi <strong>%s</strong>,</p>
                      <p>We received a request to reset your password. Click the button below to choose a new one.</p>
                      <p style="margin:24px 0;">
                        <a href="%s"
                           style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
                          Reset Password
                        </a>
                      </p>
                      <p style="color:#999;font-size:12px;">This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.</p>
                      <p style="color:#999;font-size:12px;">Or copy this link: %s</p>
                    </body></html>
                    """.formatted(username, resetLink, resetLink);

            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(mailFrom);
            helper.setTo(toEmail);
            helper.setSubject(subject);
            helper.setText(body, true);
            mailSender.send(message);
            log.info("Sent password reset email to {}", toEmail);
        } catch (Exception e) {
            log.warn("Failed to send password reset email to {}: {}", toEmail, e.getMessage());
        }
    }
}
