package com.lastmanstanding.service;

import com.lastmanstanding.entity.Fixture;
import com.lastmanstanding.repository.FixtureRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class FixtureOddsSyncService {

    private static final Logger log = LoggerFactory.getLogger(FixtureOddsSyncService.class);

    private final OddsApiClient oddsApiClient;
    private final FixtureRepository fixtureRepository;
    private static final Map<String, String> TEAM_ALIASES = buildTeamAliases();

    @Value("${odds.enabled:false}")
    private boolean oddsEnabled;

    @Value("${odds.sync.from-days:0}")
    private int fromDays;

    @Value("${odds.sync.to-days:14}")
    private int toDays;

    @Value("${odds.sports.pl:soccer_epl}")
    private String premierLeagueSport;

    @Value("${odds.sports.wc:soccer_fifa_world_cup}")
    private String worldCupSport;

    public FixtureOddsSyncService(OddsApiClient oddsApiClient, FixtureRepository fixtureRepository) {
        this.oddsApiClient = oddsApiClient;
        this.fixtureRepository = fixtureRepository;
    }

    @Transactional
    public int syncOdds() {
        if (!oddsEnabled || !oddsApiClient.isConfigured() || oddsApiClient.isQuotaBlocked()) {
            return 0;
        }

        LocalDateTime from = LocalDateTime.now(ZoneOffset.UTC).minusDays(Math.max(0, fromDays));
        LocalDateTime to = LocalDateTime.now(ZoneOffset.UTC).plusDays(Math.max(1, toDays));

        List<Fixture> candidates = fixtureRepository.findOddsSyncCandidates(from, to);
        if (candidates.isEmpty()) {
            return 0;
        }

        int updated = 0;
        Map<String, List<Fixture>> candidatesBySport = candidates.stream()
                .collect(Collectors.groupingBy(this::oddsSportForFixture, java.util.LinkedHashMap::new, Collectors.toList()));

        for (Map.Entry<String, List<Fixture>> entry : candidatesBySport.entrySet()) {
            String sportKey = entry.getKey();
            List<OddsApiClient.OddsEvent> oddsEvents = oddsApiClient.fetchOdds(sportKey, from, to);
            if (oddsEvents.isEmpty()) {
                log.debug("Odds sync returned no events for sport {}", sportKey);
                continue;
            }

            for (Fixture fixture : entry.getValue()) {
                Optional<OddsApiClient.OddsEvent> match = findBestEventForFixture(fixture, oddsEvents);
                if (match.isEmpty()) {
                    continue;
                }
                ConsensusOdds consensus = toConsensusOdds(match.get());
                if (consensus == null) {
                    continue;
                }

                fixture.setOddsHomeWin(consensus.homeWin);
                fixture.setOddsDraw(consensus.draw);
                fixture.setOddsAwayWin(consensus.awayWin);
                fixture.setOddsImpliedHome(consensus.impliedHome);
                fixture.setOddsImpliedDraw(consensus.impliedDraw);
                fixture.setOddsImpliedAway(consensus.impliedAway);
                fixture.setOddsSource("the-odds-api:" + sportKey);
                fixture.setOddsUpdatedAt(LocalDateTime.now(ZoneOffset.UTC));
                updated++;
            }
        }

        if (updated > 0) {
            fixtureRepository.saveAll(candidates);
        }
        log.info("Odds sync updated {} fixture(s) from {} candidate(s)", updated, candidates.size());
        return updated;
    }

    @Transactional(readOnly = true)
    public OddsDebugResponse debugFixtures(List<Fixture> fixtures) {
        if (!oddsEnabled) {
            return new OddsDebugResponse(false, oddsApiClient.isConfigured(), "ODDS_ENABLED is false", List.of());
        }
        if (!oddsApiClient.isConfigured()) {
            return new OddsDebugResponse(true, false, "ODDS_API_KEY is not configured", List.of());
        }
        if (fixtures.isEmpty()) {
            return new OddsDebugResponse(true, true, "No fixtures provided", List.of());
        }

        LocalDateTime from = fixtures.stream()
                .map(Fixture::getEffectiveKickoffAt)
                .min(LocalDateTime::compareTo)
                .orElse(LocalDateTime.now(ZoneOffset.UTC))
                .minusDays(1);
        LocalDateTime to = fixtures.stream()
                .map(Fixture::getEffectiveKickoffAt)
                .max(LocalDateTime::compareTo)
                .orElse(LocalDateTime.now(ZoneOffset.UTC))
                .plusDays(1);

        Map<String, List<Fixture>> fixturesBySport = fixtures.stream()
                .collect(Collectors.groupingBy(this::oddsSportForFixture, java.util.LinkedHashMap::new, Collectors.toList()));
        List<OddsDebugRow> rows = new ArrayList<>();
        for (Map.Entry<String, List<Fixture>> entry : fixturesBySport.entrySet()) {
            List<OddsApiClient.OddsEvent> oddsEvents = oddsApiClient.fetchOdds(entry.getKey(), from, to);
            for (Fixture fixture : entry.getValue()) {
                rows.add(debugRowForFixture(fixture, oddsEvents));
            }
        }
        return new OddsDebugResponse(true, true, null, rows);
    }

    private String oddsSportForFixture(Fixture fixture) {
        String competitionCode = Optional.ofNullable(fixture.getGameweek())
                .map(gw -> gw.getCompetition())
                .map(comp -> comp.getFixtureCompetitionCode())
                .orElse("PL");
        return switch (competitionCode == null ? "PL" : competitionCode.trim().toUpperCase(Locale.ROOT)) {
            case "WC" -> worldCupSport;
            case "PL" -> premierLeagueSport;
            default -> premierLeagueSport;
        };
    }

    private Optional<OddsApiClient.OddsEvent> findBestEventForFixture(Fixture fixture, List<OddsApiClient.OddsEvent> events) {
        String home = canonicalTeamName(fixture.getEffectiveHomeTeam().getName());
        String away = canonicalTeamName(fixture.getEffectiveAwayTeam().getName());
        LocalDateTime kickoff = fixture.getEffectiveKickoffAt();

        return events.stream()
                .filter(e -> {
                    String eventHome = canonicalTeamName(e.homeTeam());
                    String eventAway = canonicalTeamName(e.awayTeam());
                    boolean direct = teamsMatch(home, eventHome) && teamsMatch(away, eventAway);
                    boolean reversed = teamsMatch(home, eventAway) && teamsMatch(away, eventHome);
                    return direct || reversed;
                })
                .filter(e -> Math.abs(Duration.between(kickoff, e.commenceAt()).toHours()) <= 12)
                .min(Comparator.comparingLong(e -> Math.abs(Duration.between(kickoff, e.commenceAt()).toMinutes())));
    }

    private OddsDebugRow debugRowForFixture(Fixture fixture, List<OddsApiClient.OddsEvent> oddsEvents) {
        String homeNorm = canonicalTeamName(fixture.getEffectiveHomeTeam().getName());
        String awayNorm = canonicalTeamName(fixture.getEffectiveAwayTeam().getName());
        LocalDateTime kickoff = fixture.getEffectiveKickoffAt();

        if (oddsEvents.isEmpty()) {
            return new OddsDebugRow(
                    fixture.getId(),
                    fixture.getGameweek().getId(),
                    fixture.getGameweek().getWeekNumber(),
                    fixture.getEffectiveHomeTeam().getName(),
                    fixture.getEffectiveAwayTeam().getName(),
                    kickoff,
                    false,
                    "no_event_available",
                    null,
                    null,
                    "No odds events returned for this fixture group"
            );
        }

        List<OddsApiClient.OddsEvent> nameCandidates = oddsEvents.stream()
                .filter(e -> {
                    String eventHome = canonicalTeamName(e.homeTeam());
                    String eventAway = canonicalTeamName(e.awayTeam());
                    boolean direct = teamsMatch(homeNorm, eventHome) && teamsMatch(awayNorm, eventAway);
                    boolean reversed = teamsMatch(homeNorm, eventAway) && teamsMatch(awayNorm, eventHome);
                    return direct || reversed;
                })
                .toList();
        if (nameCandidates.isEmpty()) {
            return new OddsDebugRow(
                    fixture.getId(),
                    fixture.getGameweek().getId(),
                    fixture.getGameweek().getWeekNumber(),
                    fixture.getEffectiveHomeTeam().getName(),
                    fixture.getEffectiveAwayTeam().getName(),
                    kickoff,
                    false,
                    "name_mismatch",
                    null,
                    null,
                    eventSummary(oddsEvents)
            );
        }

        List<OddsApiClient.OddsEvent> kickoffCandidates = nameCandidates.stream()
                .filter(e -> Math.abs(Duration.between(kickoff, e.commenceAt()).toHours()) <= 12)
                .toList();
        if (kickoffCandidates.isEmpty()) {
            OddsApiClient.OddsEvent nearest = nameCandidates.stream()
                    .min(Comparator.comparingLong(e -> Math.abs(Duration.between(kickoff, e.commenceAt()).toMinutes())))
                    .orElse(null);
            return new OddsDebugRow(
                    fixture.getId(),
                    fixture.getGameweek().getId(),
                    fixture.getGameweek().getWeekNumber(),
                    fixture.getEffectiveHomeTeam().getName(),
                    fixture.getEffectiveAwayTeam().getName(),
                    kickoff,
                    false,
                    "kickoff_too_far",
                    nearest == null ? null : nearest.eventId(),
                    nearest == null ? null : nearest.commenceAt(),
                    nearest == null ? null : nearest.homeTeam() + " vs " + nearest.awayTeam() + " @ " + nearest.commenceAt()
            );
        }

        OddsApiClient.OddsEvent best = kickoffCandidates.stream()
                .min(Comparator.comparingLong(e -> Math.abs(Duration.between(kickoff, e.commenceAt()).toMinutes())))
                .orElse(null);
        if (best == null) {
            return new OddsDebugRow(fixture.getId(), fixture.getGameweek().getId(), fixture.getGameweek().getWeekNumber(),
                    fixture.getEffectiveHomeTeam().getName(), fixture.getEffectiveAwayTeam().getName(), kickoff,
                    false, "no_event", null, null, null);
        }

        ConsensusOdds consensus = toConsensusOdds(best);
        if (consensus == null) {
            String books = best.bookmakers().stream().map(b -> b.key).collect(Collectors.joining(","));
            return new OddsDebugRow(
                    fixture.getId(),
                    fixture.getGameweek().getId(),
                    fixture.getGameweek().getWeekNumber(),
                    fixture.getEffectiveHomeTeam().getName(),
                    fixture.getEffectiveAwayTeam().getName(),
                    kickoff,
                    false,
                    "missing_h2h_market_or_outcomes",
                    best.eventId(),
                    best.commenceAt(),
                    books
            );
        }

        return new OddsDebugRow(
                fixture.getId(),
                fixture.getGameweek().getId(),
                fixture.getGameweek().getWeekNumber(),
                fixture.getEffectiveHomeTeam().getName(),
                fixture.getEffectiveAwayTeam().getName(),
                kickoff,
                true,
                "matched",
                best.eventId(),
                best.commenceAt(),
                null
        );
    }

    private static String eventSummary(List<OddsApiClient.OddsEvent> events) {
        if (events == null || events.isEmpty()) {
            return "No odds events returned";
        }
        String summary = events.stream()
                .limit(12)
                .map(e -> e.homeTeam() + " vs " + e.awayTeam() + " @ " + e.commenceAt())
                .collect(Collectors.joining(" | "));
        if (events.size() > 12) {
            summary += " | ... +" + (events.size() - 12) + " more";
        }
        return summary;
    }

    private static boolean teamsMatch(String a, String b) {
        if (a.equals(b)) return true;
        return a.length() >= 5 && b.length() >= 5 && (a.contains(b) || b.contains(a));
    }

    private static String normalizeTeamName(String name) {
        if (name == null) return "";
        return name.toLowerCase(Locale.ROOT)
                .replace("fc", "")
                .replace("afc", "")
                .replace("football club", "")
                .replaceAll("[^a-z0-9]", "");
    }

    private static String canonicalTeamName(String name) {
        String normalized = normalizeTeamName(name);
        return TEAM_ALIASES.getOrDefault(normalized, normalized);
    }

    private static Map<String, String> buildTeamAliases() {
        Map<String, String> aliases = new HashMap<>();
        aliases.put("afcbournemouth", "bournemouth");
        aliases.put("bournemouth", "bournemouth");
        aliases.put("wolverhamptonwanderers", "wolves");
        aliases.put("wolves", "wolves");
        aliases.put("manchestercity", "mancity");
        aliases.put("mancity", "mancity");
        aliases.put("manchesterunited", "manutd");
        aliases.put("manutd", "manutd");
        aliases.put("tottenhamhotspur", "tottenham");
        aliases.put("tottenham", "tottenham");
        aliases.put("nottinghamforest", "nottmforest");
        aliases.put("nottmforest", "nottmforest");
        aliases.put("brightonhovealbion", "brighton");
        aliases.put("brighton", "brighton");
        aliases.put("westhamunited", "westham");
        aliases.put("westham", "westham");
        aliases.put("newcastleunited", "newcastle");
        aliases.put("newcastle", "newcastle");
        aliases.put("crystalpalace", "crystalpalace");
        aliases.put("sunderland", "sunderland");
        aliases.put("arsenal", "arsenal");
        aliases.put("chelsea", "chelsea");
        aliases.put("liverpool", "liverpool");
        aliases.put("everton", "everton");
        aliases.put("fulham", "fulham");
        aliases.put("leedsunited", "leeds");
        aliases.put("leeds", "leeds");
        aliases.put("burnley", "burnley");
        aliases.put("astonvilla", "astonvilla");
        aliases.put("brentford", "brentford");

        addAliases(aliases, "argentina", "Argentina", "ARG");
        addAliases(aliases, "australia", "Australia", "AUS");
        addAliases(aliases, "austria", "Austria", "AUT");
        addAliases(aliases, "belgium", "Belgium", "BEL");
        addAliases(aliases, "bosniaherzegovina", "Bosnia-Herzegovina", "Bosnia and Herzegovina", "BIH");
        addAliases(aliases, "brazil", "Brazil", "BRA");
        addAliases(aliases, "canada", "Canada", "CAN");
        addAliases(aliases, "chile", "Chile", "CHI", "CHL");
        addAliases(aliases, "colombia", "Colombia", "COL");
        addAliases(aliases, "congodr", "Congo DR", "DR Congo", "Democratic Republic of Congo", "Congo Democratic Republic", "COD", "DRC");
        addAliases(aliases, "croatia", "Croatia", "CRO", "HRV");
        addAliases(aliases, "czechia", "Czechia", "Czech Republic", "Czech Rep", "CZE");
        addAliases(aliases, "denmark", "Denmark", "DEN");
        addAliases(aliases, "ecuador", "Ecuador", "ECU");
        addAliases(aliases, "egypt", "Egypt", "EGY");
        addAliases(aliases, "england", "England", "ENG");
        addAliases(aliases, "france", "France", "FRA");
        addAliases(aliases, "germany", "Germany", "GER", "DEU");
        addAliases(aliases, "ghana", "Ghana", "GHA");
        addAliases(aliases, "iran", "Iran", "IRN");
        addAliases(aliases, "italy", "Italy", "ITA");
        addAliases(aliases, "ivorycoast", "Ivory Coast", "Cote dIvoire", "Côte dIvoire", "CIV");
        addAliases(aliases, "japan", "Japan", "JPN");
        addAliases(aliases, "mexico", "Mexico", "MEX");
        addAliases(aliases, "morocco", "Morocco", "MAR");
        addAliases(aliases, "netherlands", "Netherlands", "Holland", "NED", "NLD");
        addAliases(aliases, "newzealand", "New Zealand", "NZL");
        addAliases(aliases, "nigeria", "Nigeria", "NGA");
        addAliases(aliases, "norway", "Norway", "NOR");
        addAliases(aliases, "paraguay", "Paraguay", "PAR", "PRY");
        addAliases(aliases, "peru", "Peru", "PER");
        addAliases(aliases, "poland", "Poland", "POL");
        addAliases(aliases, "portugal", "Portugal", "POR");
        addAliases(aliases, "qatar", "Qatar", "QAT");
        addAliases(aliases, "saudiarabia", "Saudi Arabia", "KSA", "SAU");
        addAliases(aliases, "scotland", "Scotland", "SCO");
        addAliases(aliases, "senegal", "Senegal", "SEN");
        addAliases(aliases, "serbia", "Serbia", "SRB");
        addAliases(aliases, "southafrica", "South Africa", "RSA", "ZAF");
        addAliases(aliases, "southkorea", "South Korea", "Korea Republic", "Republic of Korea", "Korea", "KOR");
        addAliases(aliases, "spain", "Spain", "ESP");
        addAliases(aliases, "sweden", "Sweden", "SWE");
        addAliases(aliases, "switzerland", "Switzerland", "SUI", "CHE");
        addAliases(aliases, "tunisia", "Tunisia", "TUN");
        addAliases(aliases, "turkey", "Turkey", "Turkiye", "Türkiye", "TUR");
        addAliases(aliases, "ukraine", "Ukraine", "UKR");
        addAliases(aliases, "unitedstates", "United States", "United States of America", "USA", "USMNT");
        addAliases(aliases, "uruguay", "Uruguay", "URU");
        addAliases(aliases, "wales", "Wales", "WAL");

        return aliases;
    }

    private static void addAliases(Map<String, String> aliases, String canonical, String... names) {
        aliases.put(normalizeTeamName(canonical), canonical);
        for (String name : names) {
            aliases.put(normalizeTeamName(name), canonical);
        }
    }

    private static ConsensusOdds toConsensusOdds(OddsApiClient.OddsEvent event) {
        List<BigDecimal> home = new ArrayList<>();
        List<BigDecimal> draw = new ArrayList<>();
        List<BigDecimal> away = new ArrayList<>();

        String eventHome = canonicalTeamName(event.homeTeam());
        String eventAway = canonicalTeamName(event.awayTeam());

        for (OddsApiClient.ApiBookmaker bookmaker : event.bookmakers()) {
            if (bookmaker.markets == null) continue;
            bookmaker.markets.stream()
                    .filter(m -> "h2h".equalsIgnoreCase(m.key) && m.outcomes != null)
                    .findFirst()
                    .ifPresent(market -> {
                        for (OddsApiClient.ApiOutcome outcome : market.outcomes) {
                            if (outcome == null || outcome.price == null || outcome.name == null || outcome.price <= 1.0d) {
                                continue;
                            }
                            BigDecimal price = BigDecimal.valueOf(outcome.price).setScale(4, RoundingMode.HALF_UP);
                            String outcomeName = canonicalTeamName(outcome.name);
                            if ("draw".equals(outcomeName)) {
                                draw.add(price);
                            } else if (teamsMatch(outcomeName, eventHome)) {
                                home.add(price);
                            } else if (teamsMatch(outcomeName, eventAway)) {
                                away.add(price);
                            }
                        }
                    });
        }

        if (home.isEmpty() || draw.isEmpty() || away.isEmpty()) {
            return null;
        }

        BigDecimal homeAvg = average(home);
        BigDecimal drawAvg = average(draw);
        BigDecimal awayAvg = average(away);
        if (homeAvg == null || drawAvg == null || awayAvg == null) {
            return null;
        }

        BigDecimal rawHome = BigDecimal.ONE.divide(homeAvg, 8, RoundingMode.HALF_UP);
        BigDecimal rawDraw = BigDecimal.ONE.divide(drawAvg, 8, RoundingMode.HALF_UP);
        BigDecimal rawAway = BigDecimal.ONE.divide(awayAvg, 8, RoundingMode.HALF_UP);
        BigDecimal overround = rawHome.add(rawDraw).add(rawAway);
        if (overround.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }

        BigDecimal impliedHome = rawHome.divide(overround, 6, RoundingMode.HALF_UP);
        BigDecimal impliedDraw = rawDraw.divide(overround, 6, RoundingMode.HALF_UP);
        BigDecimal impliedAway = rawAway.divide(overround, 6, RoundingMode.HALF_UP);

        return new ConsensusOdds(homeAvg, drawAvg, awayAvg, impliedHome, impliedDraw, impliedAway);
    }

    private static BigDecimal average(List<BigDecimal> values) {
        if (values.isEmpty()) return null;
        BigDecimal sum = values.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        return sum.divide(BigDecimal.valueOf(values.size()), 4, RoundingMode.HALF_UP);
    }

    private record ConsensusOdds(
            BigDecimal homeWin,
            BigDecimal draw,
            BigDecimal awayWin,
            BigDecimal impliedHome,
            BigDecimal impliedDraw,
            BigDecimal impliedAway
    ) {}

    public record OddsDebugResponse(
            boolean oddsEnabled,
            boolean apiConfigured,
            String message,
            List<OddsDebugRow> fixtures
    ) {}

    public record OddsDebugRow(
            Long fixtureId,
            Long gameweekId,
            Integer weekNumber,
            String homeTeam,
            String awayTeam,
            LocalDateTime fixtureKickoff,
            boolean matched,
            String reason,
            String matchedEventId,
            LocalDateTime matchedCommenceAt,
            String diagnostics
    ) {}
}
