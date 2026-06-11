package com.lastmanstanding.provider;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Real fixture provider backed by football-data.org v4 API (free tier).
 *
 * Caching strategy:
 *   - Teams:    24-hour TTL  (rarely change)
 *   - Fixtures: 24-hour TTL  (upcoming schedule; 1 call/day is enough)
 *   - Results:  1-hour  TTL  (re-check after each gameweek ends)
 *   - Live:     5-minute TTL (in-play scores during active matches)
 *
 * Free tier limit: 10 req/min, so we are very conservative.
 */
@Component
@ConditionalOnProperty(name = "fixture.provider", havingValue = "football-data")
public class FootballDataProvider implements FixtureProvider {

    private static final Logger log = LoggerFactory.getLogger(FootballDataProvider.class);

    @Value("${football-data.api-key}")
    private String apiKey;

    @Value("${football-data.base-url:https://api.football-data.org/v4}")
    private String baseUrl;

    @Value("${football-data.competition-code:PL}")
    private String competitionCode;

    @Value("${football-data.teams-cache-ttl:86400}")
    private long teamsCacheTtl;

    @Value("${football-data.fixtures-cache-ttl:86400}")
    private long fixturesCacheTtl;

    @Value("${football-data.results-cache-ttl:3600}")
    private long resultsCacheTtl;

    @Value("${football-data.live-cache-ttl:300}")
    private long liveCacheTtl;

    @Value("${football-data.live-status-cache-ttl:30}")
    private long liveStatusCacheTtl;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(30))
            .version(HttpClient.Version.HTTP_1_1)
            .build();
    private final ObjectMapper mapper = new ObjectMapper()
            .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    // ── Simple in-memory cache ───────────────────────────────────────────

    private record CacheEntry<T>(T value, Instant expiresAt) {
        boolean isExpired() { return Instant.now().isAfter(expiresAt); }
    }

    private final Map<String, CacheEntry<?>> cache = new ConcurrentHashMap<>();

    @SuppressWarnings("unchecked")
    private <T> Optional<T> fromCache(String key) {
        CacheEntry<?> entry = cache.get(key);
        if (entry != null && !entry.isExpired()) return Optional.of((T) entry.value());
        cache.remove(key);
        return Optional.empty();
    }

    private <T> void putCache(String key, T value, long ttlSeconds) {
        cache.put(key, new CacheEntry<>(value, Instant.now().plusSeconds(ttlSeconds)));
    }

    /** Evict all cached entries — call after a manual sync. */
    public void evictAll() { cache.clear(); }

    // ── FixtureProvider implementation ──────────────────────────────────

    @Override
    public List<ProviderTeam> fetchTeams() {
        return fetchTeams(competitionCode);
    }

    @Override
    public List<ProviderTeam> fetchTeams(String competitionCode) {
        String code = normalizeCompetitionCode(competitionCode);
        Optional<List<ProviderTeam>> cached = fromCache("teams:" + code);
        if (cached.isPresent()) return cached.get();
        List<ProviderTeam> teams = loadTeams(code);
        putCache("teams:" + code, teams, teamsCacheTtl);
        return teams;
    }

    @Override
    public List<ProviderFixture> fetchFixtures(LocalDate from, LocalDate to) {
        return fetchFixtures(from, to, competitionCode);
    }

    @Override
    public List<ProviderFixture> fetchFixtures(LocalDate from, LocalDate to, String competitionCode) {
        String code = normalizeCompetitionCode(competitionCode);
        boolean hasLive = hasLiveMatchesNow(code);
        long ttl = hasLive ? liveStatusCacheTtl : fixturesCacheTtl;
        String key = "fixtures:" + code + ":" + from + ":" + to;
        if (!hasLive) {
            Optional<List<ProviderFixture>> cached = fromCache(key);
            if (cached.isPresent()) return cached.get();
        }
        List<ProviderFixture> fixtures = loadMatches(from, to, false, code);
        if (hasLive) {
            fixtures = mergeProviderFixtures(fixtures, loadLiveMatches(code));
        }
        putCache(key, fixtures, ttl);
        return fixtures;
    }

    @Override
    public List<ProviderFixture> fetchResults(LocalDate from, LocalDate to) {
        return fetchResults(from, to, competitionCode);
    }

    @Override
    public List<ProviderFixture> fetchResults(LocalDate from, LocalDate to, String competitionCode) {
        String code = normalizeCompetitionCode(competitionCode);
        boolean hasLive = hasLiveMatchesNow(code);
        String key = "results:" + code + ":" + from + ":" + to + (hasLive ? ":live" : "");
        if (!hasLive) {
            Optional<List<ProviderFixture>> cached = fromCache(key);
            if (cached.isPresent()) return cached.get();
        }
        List<ProviderFixture> results = loadMatches(from, to, true, code);
        if (hasLive) {
            results = mergeProviderFixtures(results, loadLiveMatches(code));
        }
        putCache(key, results, hasLive ? liveStatusCacheTtl : resultsCacheTtl);
        return results;
    }

    // ── Private helpers ──────────────────────────────────────────────────

    /** True if any match in the competition is currently IN_PLAY or PAUSED. */
    public boolean hasLiveMatchesNow() {
        return hasLiveMatchesNow(competitionCode);
    }

    public boolean hasLiveMatchesNow(String competitionCode) {
        String code = normalizeCompetitionCode(competitionCode);
        Optional<Boolean> cached = fromCache("live-status:" + code);
        if (cached.isPresent()) return cached.get();

        boolean live = hasLiveMatches(code);
        putCache("live-status:" + code, live, liveStatusCacheTtl);
        return live;
    }

    private boolean hasLiveMatches(String competitionCode) {
        try {
            String url = baseUrl + "/competitions/" + competitionCode + "/matches?status=IN_PLAY,PAUSED";
            MatchesResponse resp = get(url, MatchesResponse.class);
            return resp != null && resp.matches() != null && !resp.matches().isEmpty();
        } catch (Exception e) {
            log.debug("Could not check live matches: {}", e.getMessage());
            return false;
        }
    }

    private List<ProviderTeam> loadTeams(String competitionCode) {
        try {
            String url = baseUrl + "/competitions/" + competitionCode + "/teams";
            TeamsResponse resp = get(url, TeamsResponse.class);
            if (resp == null || resp.teams() == null) return List.of();
            return resp.teams().stream().map(t -> {
                // Prefer TLA (e.g. "ARS") as short name — it's always ≤5 chars and clean.
                // Fall back to shortName, truncated to 50 chars for safety.
                String shortName = t.tla() != null && !t.tla().isBlank()
                        ? t.tla()
                        : t.shortName() != null
                        ? t.shortName().substring(0, Math.min(t.shortName().length(), 50))
                        : t.name().substring(0, Math.min(t.name().length(), 50));
                return new ProviderTeam(
                        String.valueOf(t.id()),
                        t.name(),
                        shortName,
                        t.crest()
                );
            }).toList();
        } catch (HttpConnectTimeoutException e) {
            log.error("Failed to connect to football-data.org teams endpoint within timeout: {}", e.getMessage());
            return List.of();
        } catch (Exception e) {
            log.error("Failed to load teams from football-data.org ({}): {}", e.getClass().getSimpleName(), e.getMessage());
            return List.of();
        }
    }

    private List<ProviderFixture> loadMatches(LocalDate from, LocalDate to, boolean finishedOnly, String competitionCode) {
        try {
            String statusParam = finishedOnly ? "&status=FINISHED" : "";
            String url = baseUrl + "/competitions/" + competitionCode + "/matches"
                    + "?dateFrom=" + from
                    + "&dateTo=" + to
                    + statusParam;

            MatchesResponse resp = get(url, MatchesResponse.class);
            if (resp == null || resp.matches() == null) return List.of();

            return resp.matches().stream()
                    .filter(m -> m.utcDate() != null)
                    .map(this::toProviderFixture)
                    .filter(Objects::nonNull)
                    .toList();
        } catch (HttpConnectTimeoutException e) {
            log.error("Failed to connect to football-data.org matches endpoint within timeout for {} to {}: {}", from, to, e.getMessage());
            return List.of();
        } catch (Exception e) {
            log.error("Failed to load matches from football-data.org ({}): {}", e.getClass().getSimpleName(), e.getMessage());
            return List.of();
        }
    }

    private List<ProviderFixture> loadLiveMatches(String competitionCode) {
        try {
            String url = baseUrl + "/competitions/" + competitionCode + "/matches?status=IN_PLAY,PAUSED";
            MatchesResponse resp = get(url, MatchesResponse.class);
            if (resp == null || resp.matches() == null) return List.of();
            return resp.matches().stream()
                    .filter(m -> m.utcDate() != null)
                    .map(this::toProviderFixture)
                    .filter(Objects::nonNull)
                    .toList();
        } catch (Exception e) {
            log.debug("Failed to load live matches from football-data.org for {}: {}", competitionCode, e.getMessage());
            return List.of();
        }
    }

    private List<ProviderFixture> mergeProviderFixtures(List<ProviderFixture> base, List<ProviderFixture> overlay) {
        if (overlay.isEmpty()) return base;
        Map<String, ProviderFixture> merged = new LinkedHashMap<>();
        base.forEach(f -> merged.put(f.externalFixtureId(), f));
        overlay.forEach(f -> merged.put(f.externalFixtureId(), f));
        return new ArrayList<>(merged.values());
    }

    private String normalizeCompetitionCode(String code) {
        if (code == null || code.isBlank()) return competitionCode;
        return code.trim().toUpperCase(Locale.ROOT);
    }

    private ProviderFixture toProviderFixture(ApiMatch m) {
        try {
            LocalDateTime kickoff = LocalDateTime.parse(
                    m.utcDate().replace("Z", ""), DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                    .atOffset(ZoneOffset.UTC).toLocalDateTime();

            String status = mapStatus(m.status());
            Integer[] resolvedScore = resolveScore(m.score(), status);
            Integer homeScore = resolvedScore[0];
            Integer awayScore = resolvedScore[1];

            String homeId = m.homeTeam() != null ? String.valueOf(m.homeTeam().id()) : null;
            String awayId = m.awayTeam() != null ? String.valueOf(m.awayTeam().id()) : null;
            if (homeId == null || awayId == null) return null;

            int weekNumber = m.matchday() != null ? m.matchday() : 1;

            return new ProviderFixture(
                    String.valueOf(m.id()),
                    homeId,
                    awayId,
                    kickoff,
                    status,
                    homeScore,
                    awayScore,
                    weekNumber
            );
        } catch (Exception e) {
            log.warn("Could not map match id={}: {}", m.id(), e.getMessage());
            return null;
        }
    }

    /** Map football-data status strings to our FixtureStatus names. */
    private String mapStatus(String s) {
        if (s == null) return "SCHEDULED";
        return switch (s.toUpperCase()) {
            case "FINISHED"           -> "FINISHED";
            case "IN_PLAY", "PAUSED"  -> "IN_PLAY";
            case "POSTPONED"          -> "POSTPONED";
            case "CANCELLED","SUSPENDED","AWARDED" -> "CANCELLED";
            case "TIMED","SCHEDULED"  -> "SCHEDULED";
            default                   -> "SCHEDULED";
        };
    }

    /**
     * Resolve the most useful score for the current match state.
     * For live matches we prefer the most current feed available.
     */
    private Integer[] resolveScore(ApiScore score, String status) {
        if (score == null) return new Integer[]{null, null};

        ApiScoreDetail primary =
                "IN_PLAY".equals(status)
                        ? firstPresent(score.fullTime(), score.regularTime(), score.halfTime())
                        : firstPresent(score.fullTime(), score.regularTime(), score.halfTime());

        if (primary == null) return new Integer[]{null, null};
        return new Integer[]{primary.home(), primary.away()};
    }

    private ApiScoreDetail firstPresent(ApiScoreDetail... candidates) {
        for (ApiScoreDetail candidate : candidates) {
            if (candidate != null && candidate.home() != null && candidate.away() != null) {
                return candidate;
            }
        }
        return null;
    }

    // ── HTTP helper ──────────────────────────────────────────────────────

    private <T> T get(String url, Class<T> type) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("X-Auth-Token", apiKey)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(45))
                .GET()
                .build();

        log.info("football-data.org GET {}", url);
        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());

        if (resp.statusCode() == 429) {
            log.warn("football-data.org rate limit hit (429). Will retry on next sync.");
            return null;
        }
        if (resp.statusCode() != 200) {
            log.error("football-data.org returned {} for {}: {}", resp.statusCode(), url, resp.body());
            return null;
        }
        return mapper.readValue(resp.body(), type);
    }

    // ── JSON response records ────────────────────────────────────────────

    @JsonIgnoreProperties(ignoreUnknown = true)
    record TeamsResponse(List<ApiTeam> teams) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ApiTeam(
            long id,
            String name,
            String shortName,
            String tla,
            String crest
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record MatchesResponse(
            @JsonProperty("matches") List<ApiMatch> matches
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ApiMatch(
            long id,
            String utcDate,
            String status,
            Integer matchday,
            ApiMatchTeam homeTeam,
            ApiMatchTeam awayTeam,
            ApiScore score
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ApiMatchTeam(long id, String name, String shortName, String tla, String crest) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ApiScore(String winner, ApiScoreDetail fullTime, ApiScoreDetail regularTime, ApiScoreDetail halfTime) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ApiScoreDetail(Integer home, Integer away) {}
}
