package com.lastmanstanding.service;

import com.lastmanstanding.entity.User;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class SupportService {

    private static final Logger log = LoggerFactory.getLogger(SupportService.class);

    private final JavaMailSender mailSender;

    @Value("${app.mail-from:noreply@lastmanstanding.com}")
    private String mailFrom;

    @Value("${app.mail-enabled:false}")
    private boolean mailEnabled;

    @Value("${app.support-email:support@lastmanstanding.com}")
    private String supportEmail;

    public SupportService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    public void sendSupportTicket(
            User user,
            String issueType,
            String subject,
            String message,
            String competitionName,
            String pageUrl,
            MultipartFile screenshot
    ) {
        if (!mailEnabled) {
            log.info("Mail disabled — support ticket captured for user {} [{}]: {}", user.getId(), issueType, subject);
            return;
        }

        try {
            String fullSubject = "[LMS Support] " + subject;
            String body = """
                    <html><body style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:20px;">
                      <h2 style="color:#1a1a2e;">Support ticket</h2>
                      <table style="border-collapse:collapse;width:100%%;margin-bottom:16px;">
                        <tr><td style="padding:6px 8px;border:1px solid #ddd;"><strong>User ID</strong></td><td style="padding:6px 8px;border:1px solid #ddd;">%d</td></tr>
                        <tr><td style="padding:6px 8px;border:1px solid #ddd;"><strong>Username</strong></td><td style="padding:6px 8px;border:1px solid #ddd;">%s</td></tr>
                        <tr><td style="padding:6px 8px;border:1px solid #ddd;"><strong>Email</strong></td><td style="padding:6px 8px;border:1px solid #ddd;">%s</td></tr>
                        <tr><td style="padding:6px 8px;border:1px solid #ddd;"><strong>Role</strong></td><td style="padding:6px 8px;border:1px solid #ddd;">%s</td></tr>
                        <tr><td style="padding:6px 8px;border:1px solid #ddd;"><strong>Issue type</strong></td><td style="padding:6px 8px;border:1px solid #ddd;">%s</td></tr>
                        <tr><td style="padding:6px 8px;border:1px solid #ddd;"><strong>Competition</strong></td><td style="padding:6px 8px;border:1px solid #ddd;">%s</td></tr>
                        <tr><td style="padding:6px 8px;border:1px solid #ddd;"><strong>Page URL</strong></td><td style="padding:6px 8px;border:1px solid #ddd;">%s</td></tr>
                        <tr><td style="padding:6px 8px;border:1px solid #ddd;"><strong>Screenshot attached</strong></td><td style="padding:6px 8px;border:1px solid #ddd;">%s</td></tr>
                      </table>
                      <h3 style="color:#1a1a2e;">Message</h3>
                      <pre style="white-space:pre-wrap;background:#f8f9fb;padding:12px;border:1px solid #ddd;border-radius:8px;">%s</pre>
                    </body></html>
                    """.formatted(
                    user.getId(),
                    escapeHtml(user.getUsername()),
                    escapeHtml(user.getEmail()),
                    user.getRole().name(),
                    escapeHtml(issueType),
                    escapeHtml(competitionName != null ? competitionName : "-"),
                    escapeHtml(pageUrl != null ? pageUrl : "-"),
                    screenshot != null && !screenshot.isEmpty() ? "Yes" : "No",
                    escapeHtml(message)
            );

            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");
            helper.setFrom(mailFrom);
            helper.setTo(supportEmail);
            helper.setReplyTo(user.getEmail());
            helper.setSubject(fullSubject);
            helper.setText(body, true);
            if (screenshot != null && !screenshot.isEmpty()) {
                helper.addAttachment(
                        screenshot.getOriginalFilename() != null ? screenshot.getOriginalFilename() : "screenshot",
                        screenshot
                );
            }
            mailSender.send(mimeMessage);
        } catch (Exception e) {
            log.warn("Failed to send support ticket email for user {}: {}", user.getId(), e.getMessage());
        }
    }

    private String escapeHtml(String value) {
        if (value == null) return "";
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
