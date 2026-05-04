package com.lastmanstanding.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionParticipant;
import com.lastmanstanding.entity.Gameweek;
import com.lastmanstanding.entity.ParticipantStatus;
import com.lastmanstanding.entity.Pick;
import com.lastmanstanding.entity.PickOutcome;
import com.lastmanstanding.entity.PickResult;
import com.lastmanstanding.entity.PushSubscription;
import com.lastmanstanding.entity.User;
import com.lastmanstanding.repository.CompetitionParticipantRepository;
import com.lastmanstanding.repository.PickRepository;
import com.lastmanstanding.repository.PickResultRepository;
import com.lastmanstanding.repository.PushSubscriptionRepository;
import com.lastmanstanding.repository.UserRepository;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import org.jose4j.lang.JoseException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class WebPushService {

    private static final Logger log = LoggerFactory.getLogger(WebPushService.class);

    private final PushSubscriptionRepository pushSubscriptionRepository;
    private final UserRepository userRepository;
    private final CompetitionParticipantRepository participantRepository;
    private final PickRepository pickRepository;
    private final PickResultRepository pickResultRepository;
    private final ObjectMapper objectMapper;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    @Value("${app.vapid-public-key:}")
    private String vapidPublicKey;

    @Value("${app.vapid-private-key:}")
    private String vapidPrivateKey;

    @Value("${app.vapid-subject:}")
    private String vapidSubject;

    public WebPushService(PushSubscriptionRepository pushSubscriptionRepository,
                          UserRepository userRepository,
                          CompetitionParticipantRepository participantRepository,
                          PickRepository pickRepository,
                          PickResultRepository pickResultRepository,
                          ObjectMapper objectMapper) {
        this.pushSubscriptionRepository = pushSubscriptionRepository;
        this.userRepository = userRepository;
        this.participantRepository = participantRepository;
        this.pickRepository = pickRepository;
        this.pickResultRepository = pickResultRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void saveSubscription(Long userId, String endpoint, String p256dhKey, String authKey) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "User not found"));

        PushSubscription subscription = pushSubscriptionRepository.findByEndpoint(endpoint)
                .orElseGet(() -> new PushSubscription(user, endpoint, p256dhKey, authKey));

        subscription.setUser(user);
        subscription.setEndpoint(endpoint);
        subscription.setP256dhKey(p256dhKey);
        subscription.setAuthKey(authKey);
        pushSubscriptionRepository.save(subscription);
    }

    @Transactional
    public void removeSubscriptionsForUser(Long userId) {
        pushSubscriptionRepository.deleteByUserId(userId);
    }

    public boolean isConfigured() {
        return !vapidPublicKey.isBlank() && !vapidPrivateKey.isBlank() && !vapidSubject.isBlank();
    }

    @Transactional
    public void sendPickReminderNotifications(Competition comp, Gameweek gw) {
        if (!isConfigured()) {
            log.info("Web push not configured — skipping push reminders for GW{} competition {}", gw.getWeekNumber(), comp.getId());
            return;
        }

        List<CompetitionParticipant> active = participantRepository.findByCompetitionIdAndStatus(comp.getId(), ParticipantStatus.ACTIVE);
        Set<Long> alreadyPicked = pickRepository.findByCompetitionIdAndGameweekId(comp.getId(), gw.getId())
                .stream()
                .map(p -> p.getUser().getId())
                .collect(Collectors.toSet());

        List<Long> targetUserIds = active.stream()
                .map(cp -> cp.getUser().getId())
                .filter(userId -> !alreadyPicked.contains(userId))
                .toList();

        if (targetUserIds.isEmpty()) {
            return;
        }

        for (Long userId : targetUserIds) {
            List<PushSubscription> subscriptions = pushSubscriptionRepository.findByUserId(userId);
            if (subscriptions.isEmpty()) {
                continue;
            }

            sendToSubscriptions(subscriptions, Map.of(
                    "title", "Pick reminder",
                    "body", "You have not made your pick for " + comp.getName() + " yet. Gameweek " + gw.getWeekNumber() + " locks soon.",
                    "url", frontendUrl + "/competitions/" + comp.getId(),
                    "tag", "pick-reminder-" + gw.getId()
            ));
        }
    }

    @Transactional
    public void sendGameweekResultNotifications(Competition comp, Gameweek gw) {
        if (!isConfigured()) {
            log.info("Web push not configured — skipping result push notifications for GW{} competition {}", gw.getWeekNumber(), comp.getId());
            return;
        }

        List<CompetitionParticipant> participants = participantRepository.findByCompetitionId(comp.getId());
        List<Pick> picks = pickRepository.findByCompetitionIdAndGameweekIdFetch(comp.getId(), gw.getId());
        Map<Long, Pick> pickByUserId = picks.stream().collect(Collectors.toMap(p -> p.getUser().getId(), p -> p));
        List<Long> pickIds = picks.stream().map(Pick::getId).toList();
        Map<Long, PickResult> resultByPickId = pickResultRepository.findByPickIdIn(pickIds)
                .stream()
                .collect(Collectors.toMap(pr -> pr.getPick().getId(), pr -> pr));

        for (CompetitionParticipant cp : participants) {
            List<PushSubscription> subscriptions = pushSubscriptionRepository.findByUserId(cp.getUser().getId());
            if (subscriptions.isEmpty()) {
                continue;
            }

            Pick pick = pickByUserId.get(cp.getUser().getId());
            String body = buildResultBody(comp, gw, cp, pick, pick == null ? null : resultByPickId.get(pick.getId()));
            sendToSubscriptions(subscriptions, Map.of(
                    "title", "Gameweek " + gw.getWeekNumber() + " results",
                    "body", body,
                    "url", frontendUrl + "/competitions/" + comp.getId(),
                    "tag", "gw-results-" + gw.getId() + "-" + cp.getUser().getId()
            ));
        }
    }

    @Transactional
    public void sendPaymentConfirmedNotification(Competition comp, User user) {
        if (!isConfigured()) {
            log.info("Web push not configured — skipping payment-confirmed notification for user {} competition {}",
                    user.getId(), comp.getId());
            return;
        }

        List<PushSubscription> subscriptions = pushSubscriptionRepository.findByUserId(user.getId());
        if (subscriptions.isEmpty()) {
            return;
        }

        sendToSubscriptions(subscriptions, Map.of(
                "title", "Payment confirmed",
                "body", "Your payment for " + comp.getName() + " has been confirmed. You can now make your pick.",
                "url", frontendUrl + "/competitions/" + comp.getId(),
                "tag", "payment-confirmed-" + comp.getId() + "-" + user.getId()
        ));
    }

    private void sendToSubscriptions(List<PushSubscription> subscriptions, Map<String, String> payload) {
        PushService pushService;
        try {
            pushService = buildPushService();
        } catch (GeneralSecurityException | JoseException e) {
            log.warn("Failed to initialise web push service: {}", e.getMessage());
            return;
        }

        byte[] body;
        try {
            body = objectMapper.writeValueAsString(payload).getBytes(StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.warn("Failed to serialise push payload: {}", e.getMessage());
            return;
        }

        for (PushSubscription subscription : subscriptions) {
            try {
                Notification notification = new Notification(
                        subscription.getEndpoint(),
                        subscription.getP256dhKey(),
                        subscription.getAuthKey(),
                        body
                );

                var response = pushService.send(notification);
                int status = response.getStatusLine().getStatusCode();
                if (status == 404 || status == 410) {
                    log.info("Removing stale push subscription for endpoint {}", subscription.getEndpoint());
                    pushSubscriptionRepository.deleteByEndpoint(subscription.getEndpoint());
                } else if (status >= 400) {
                    log.warn("Push delivery failed for endpoint {} with status {}", subscription.getEndpoint(), status);
                }
            } catch (Exception e) {
                log.warn("Failed to send push notification to endpoint {}: {}", subscription.getEndpoint(), e.getMessage());
            }
        }
    }

    private String buildResultBody(Competition comp, Gameweek gw, CompetitionParticipant cp, Pick pick, PickResult result) {
        if (pick == null) {
            return comp.getName() + ": Gameweek " + gw.getWeekNumber() + " is complete. You had no recorded pick.";
        }

        String teamName = pick.getTeam().getName();
        PickOutcome outcome = result != null ? result.getOutcome() : PickOutcome.PENDING;

        return switch (outcome) {
            case ADVANCE -> comp.getName() + ": " + teamName + " advanced you to the next round.";
            case ELIMINATED -> comp.getName() + ": " + teamName + " knocked you out in Gameweek " + gw.getWeekNumber() + ".";
            case POSTPONED_ADVANCE -> comp.getName() + ": " + teamName + " was postponed and you advance.";
            case PENDING -> {
                if (cp.getStatus() == ParticipantStatus.WINNER) {
                    yield comp.getName() + ": you are the winner.";
                }
                yield comp.getName() + ": your " + teamName + " result is still pending.";
            }
        };
    }

    private PushService buildPushService() throws GeneralSecurityException, JoseException {
        return new PushService(vapidPublicKey, vapidPrivateKey, vapidSubject);
    }
}
