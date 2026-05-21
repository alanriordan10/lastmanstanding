package com.lastmanstanding.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionParticipant;
import com.lastmanstanding.entity.Gameweek;
import com.lastmanstanding.entity.MobilePushToken;
import com.lastmanstanding.entity.ParticipantStatus;
import com.lastmanstanding.entity.Pick;
import com.lastmanstanding.entity.PickOutcome;
import com.lastmanstanding.entity.PickResult;
import com.lastmanstanding.entity.PushSubscription;
import com.lastmanstanding.entity.User;
import com.lastmanstanding.repository.CompetitionParticipantRepository;
import com.lastmanstanding.repository.MobilePushTokenRepository;
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
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
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
    private static final String EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

    private final PushSubscriptionRepository pushSubscriptionRepository;
    private final MobilePushTokenRepository mobilePushTokenRepository;
    private final UserRepository userRepository;
    private final CompetitionParticipantRepository participantRepository;
    private final PickRepository pickRepository;
    private final PickResultRepository pickResultRepository;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    @Value("${app.vapid-public-key:}")
    private String vapidPublicKey;

    @Value("${app.vapid-private-key:}")
    private String vapidPrivateKey;

    @Value("${app.vapid-subject:}")
    private String vapidSubject;

    public WebPushService(PushSubscriptionRepository pushSubscriptionRepository,
                          MobilePushTokenRepository mobilePushTokenRepository,
                          UserRepository userRepository,
                          CompetitionParticipantRepository participantRepository,
                          PickRepository pickRepository,
                          PickResultRepository pickResultRepository,
                          ObjectMapper objectMapper) {
        this.pushSubscriptionRepository = pushSubscriptionRepository;
        this.mobilePushTokenRepository = mobilePushTokenRepository;
        this.userRepository = userRepository;
        this.participantRepository = participantRepository;
        this.pickRepository = pickRepository;
        this.pickResultRepository = pickResultRepository;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newHttpClient();
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
            log.info("Web push not configured — skipping web-push reminders for GW{} competition {}", gw.getWeekNumber(), comp.getId());
        }

        List<CompetitionParticipant> active = participantRepository.findByCompetitionIdAndStatus(comp.getId(), ParticipantStatus.ACTIVE);
        Set<Long> alreadyPicked = pickRepository.findByCompetitionIdAndGameweekId(comp.getId(), gw.getId())
                .stream()
                .map(p -> p.getParticipant().getId())
                .collect(Collectors.toSet());

        List<Long> targetUserIds = active.stream()
                .filter(cp -> !alreadyPicked.contains(cp.getId()))
                .map(cp -> cp.getUser().getId())
                .toList();

        if (targetUserIds.isEmpty()) {
            return;
        }

        for (Long userId : targetUserIds) {
            String title = "Pick reminder";
            String body = "You have not made your pick for " + comp.getName() + " yet. Gameweek " + gw.getWeekNumber() + " locks soon.";
            String url = frontendUrl + "/competitions/" + comp.getId();
            String tag = "pick-reminder-" + gw.getId();

            if (isConfigured()) {
                List<PushSubscription> subscriptions = pushSubscriptionRepository.findByUserId(userId);
                if (!subscriptions.isEmpty()) {
                    sendToSubscriptions(subscriptions, Map.of(
                            "title", title,
                            "body", body,
                            "url", url,
                            "tag", tag
                    ));
                }
            }

            sendToMobileTokens(userId, title, body, url, tag);
        }
    }

    @Transactional
    public void sendGameweekResultNotifications(Competition comp, Gameweek gw) {
        if (!isConfigured()) {
            log.info("Web push not configured — skipping web-push result notifications for GW{} competition {}", gw.getWeekNumber(), comp.getId());
        }

        List<CompetitionParticipant> participants = participantRepository.findByCompetitionId(comp.getId());
        List<Pick> picks = pickRepository.findByCompetitionIdAndGameweekIdFetch(comp.getId(), gw.getId());
        Map<Long, Pick> pickByParticipantId = picks.stream().collect(Collectors.toMap(p -> p.getParticipant().getId(), p -> p, (a, b) -> a));
        List<Long> pickIds = picks.stream().map(Pick::getId).toList();
        Map<Long, PickResult> resultByPickId = pickResultRepository.findByPickIdIn(pickIds)
                .stream()
                .collect(Collectors.toMap(pr -> pr.getPick().getId(), pr -> pr));

        for (CompetitionParticipant cp : participants) {
            String title = "Gameweek " + gw.getWeekNumber() + " results";
            String body = buildResultBody(comp, gw, cp, pickByParticipantId.get(cp.getId()),
                    pickByParticipantId.get(cp.getId()) == null ? null : resultByPickId.get(pickByParticipantId.get(cp.getId()).getId()));
            String url = frontendUrl + "/competitions/" + comp.getId();
            String tag = "gw-results-" + gw.getId() + "-" + cp.getUser().getId();

            if (isConfigured()) {
                List<PushSubscription> subscriptions = pushSubscriptionRepository.findByUserId(cp.getUser().getId());
                if (!subscriptions.isEmpty()) {
                    sendToSubscriptions(subscriptions, Map.of(
                            "title", title,
                            "body", body,
                            "url", url,
                            "tag", tag
                    ));
                }
            }

            sendToMobileTokens(cp.getUser().getId(), title, body, url, tag);
        }
    }

    @Transactional
    public void sendPaymentConfirmedNotification(Competition comp, User user) {
        String title = "Payment confirmed";
        String body = "Your payment for " + comp.getName() + " has been confirmed. You can now make your pick.";
        String url = frontendUrl + "/competitions/" + comp.getId();
        String tag = "payment-confirmed-" + comp.getId() + "-" + user.getId();

        if (isConfigured()) {
            List<PushSubscription> subscriptions = pushSubscriptionRepository.findByUserId(user.getId());
            if (!subscriptions.isEmpty()) {
                sendToSubscriptions(subscriptions, Map.of(
                        "title", title,
                        "body", body,
                        "url", url,
                        "tag", tag
                ));
            }
        } else {
            log.info("Web push not configured — skipping web-push payment notification for user {} competition {}",
                    user.getId(), comp.getId());
        }

        sendToMobileTokens(user.getId(), title, body, url, tag);
    }

    private void sendToMobileTokens(Long userId, String title, String body, String url, String tag) {
        List<MobilePushToken> tokens = mobilePushTokenRepository.findByUserId(userId);
        if (tokens.isEmpty()) return;

        for (MobilePushToken token : tokens) {
            try {
                Map<String, Object> payload = Map.of(
                        "to", token.getToken(),
                        "title", title,
                        "body", body,
                        "sound", "default",
                        "data", Map.of("url", url, "tag", tag)
                );

                String json = objectMapper.writeValueAsString(payload);
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(EXPO_PUSH_URL))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(json))
                        .build();

                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() >= 400) {
                    log.warn("Expo push send failed status={} userId={} tokenPrefix={}",
                            response.statusCode(), userId, previewToken(token.getToken()));
                    continue;
                }

                JsonNode root = objectMapper.readTree(response.body());
                JsonNode data = root.path("data");
                if (data.isArray() && data.size() > 0) {
                    JsonNode first = data.get(0);
                    if ("error".equals(first.path("status").asText())) {
                        String expoError = first.path("details").path("error").asText();
                        if ("DeviceNotRegistered".equals(expoError)) {
                            log.info("Removing stale Expo token userId={} tokenPrefix={}", userId, previewToken(token.getToken()));
                            mobilePushTokenRepository.deleteByToken(token.getToken());
                        } else {
                            log.warn("Expo push error userId={} error={} tokenPrefix={}",
                                    userId, expoError, previewToken(token.getToken()));
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to send Expo push userId={} tokenPrefix={} error={}",
                        userId, previewToken(token.getToken()), e.getMessage());
            }
        }
    }

    private String previewToken(String token) {
        if (token == null || token.length() < 12) return "short";
        return token.substring(0, 12) + "...";
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
