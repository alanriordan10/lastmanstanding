package com.lastmanstanding.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

@Component
public class OddsApiClient {

    private static final Logger log = LoggerFactory.getLogger(OddsApiClient.class);

    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .version(HttpClient.Version.HTTP_1_1)
            .build();

    private static final DateTimeFormatter ODDS_TIME_FORMAT =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'");

    @Value("${odds.base-url:https://api.the-odds-api.com/v4}")
    private String baseUrl;

    @Value("${odds.api-key:}")
    private String apiKey;

    @Value("${odds.sport:soccer_epl}")
    private String sport;

    @Value("${odds.regions:uk}")
    private String regions;

    @Value("${odds.markets:h2h}")
    private String markets;

    @Value("${odds.odds-format:decimal}")
    private String oddsFormat;

    @Value("${odds.date-format:iso}")
    private String dateFormat;

    @Value("${odds.quota-backoff-hours:24}")
    private long quotaBackoffHours;

    private volatile Instant quotaBlockedUntil;

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    public List<OddsEvent> fetchOdds(LocalDateTime from, LocalDateTime to) {
        return fetchOdds(sport, from, to);
    }

    public List<OddsEvent> fetchOdds(String sportKey, LocalDateTime from, LocalDateTime to) {
        if (!isConfigured()) {
            return List.of();
        }
        if (isQuotaBlocked()) {
            log.debug("Skipping Odds API request because usage quota is paused until {}", quotaBlockedUntil);
            return List.of();
        }
        String resolvedSport = sportKey == null || sportKey.isBlank() ? sport : sportKey.trim();

        String url = baseUrl + "/sports/" + enc(resolvedSport) + "/odds"
                + "?apiKey=" + enc(apiKey)
                + "&regions=" + enc(regions)
                + "&markets=" + enc(markets)
                + "&oddsFormat=" + enc(oddsFormat)
                + "&dateFormat=" + enc(dateFormat)
                + "&commenceTimeFrom=" + enc(formatOddsTime(from))
                + "&commenceTimeTo=" + enc(formatOddsTime(to));

        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(30))
                    .GET()
                    .header("Accept", "application/json")
                    .build();
            HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() < 200 || res.statusCode() >= 300) {
                if (isUsageQuotaExhausted(res.statusCode(), res.body())) {
                    quotaBlockedUntil = Instant.now().plus(Duration.ofHours(Math.max(1, quotaBackoffHours)));
                    log.warn("Odds API usage quota has been reached; pausing odds requests until {}", quotaBlockedUntil);
                } else {
                    log.warn("Odds API returned {}: {}", res.statusCode(), trimBody(res.body()));
                }
                return List.of();
            }

            List<ApiEvent> payload = objectMapper.readValue(res.body(), new TypeReference<List<ApiEvent>>() {});
            List<OddsEvent> events = new ArrayList<>();
            for (ApiEvent e : payload) {
                LocalDateTime kickoff = parseUtc(e.commenceTime);
                if (kickoff == null || e.homeTeam == null || e.awayTeam == null) {
                    continue;
                }
                events.add(new OddsEvent(e.id, e.homeTeam, e.awayTeam, kickoff, e.bookmakers == null ? List.of() : e.bookmakers));
            }
            return events;
        } catch (Exception e) {
            log.warn("Failed to fetch odds: {}", e.getMessage());
            return List.of();
        }
    }

    public boolean isQuotaBlocked() {
        Instant blockedUntil = quotaBlockedUntil;
        if (blockedUntil == null) return false;
        if (Instant.now().isBefore(blockedUntil)) return true;
        quotaBlockedUntil = null;
        return false;
    }

    private static boolean isUsageQuotaExhausted(int statusCode, String body) {
        if (statusCode != 401 && statusCode != 429) return false;
        return body != null && (body.contains("OUT_OF_USAGE_CREDITS") || body.contains("Usage quota has been reached"));
    }

    private static String enc(String v) {
        return URLEncoder.encode(v, StandardCharsets.UTF_8);
    }

    private static String trimBody(String body) {
        if (body == null) return "";
        return body.length() <= 240 ? body : body.substring(0, 240) + "...";
    }

    private static LocalDateTime parseUtc(String iso) {
        if (iso == null) return null;
        try {
            return OffsetDateTime.parse(iso).toInstant().atOffset(ZoneOffset.UTC).toLocalDateTime();
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String formatOddsTime(LocalDateTime dt) {
        return dt.atOffset(ZoneOffset.UTC).format(ODDS_TIME_FORMAT);
    }

    public record OddsEvent(String eventId, String homeTeam, String awayTeam, LocalDateTime commenceAt, List<ApiBookmaker> bookmakers) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    private static class ApiEvent {
        public String id;
        @JsonProperty("commence_time")
        public String commenceTime;
        @JsonProperty("home_team")
        public String homeTeam;
        @JsonProperty("away_team")
        public String awayTeam;
        public List<ApiBookmaker> bookmakers;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ApiBookmaker {
        public String key;
        public String title;
        @JsonProperty("last_update")
        public String lastUpdate;
        public List<ApiMarket> markets;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ApiMarket {
        public String key;
        public List<ApiOutcome> outcomes;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ApiOutcome {
        public String name;
        public Double price;
    }
}

