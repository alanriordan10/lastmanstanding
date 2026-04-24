package com.lastmanstanding.provider;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Mock fixture provider that returns seeded Premier League data.
 * Activated when fixture.provider=mock (default).
 */
@Component
@ConditionalOnMissingBean(FixtureProvider.class)
public class MockFixtureProvider implements FixtureProvider {

    private static final List<ProviderTeam> TEAMS = List.of(
            new ProviderTeam("EXT-ARS", "Arsenal", "ARS", null),
            new ProviderTeam("EXT-AVL", "Aston Villa", "AVL", null),
            new ProviderTeam("EXT-BOU", "Bournemouth", "BOU", null),
            new ProviderTeam("EXT-BRE", "Brentford", "BRE", null),
            new ProviderTeam("EXT-BHA", "Brighton", "BHA", null),
            new ProviderTeam("EXT-CHE", "Chelsea", "CHE", null),
            new ProviderTeam("EXT-CRY", "Crystal Palace", "CRY", null),
            new ProviderTeam("EXT-EVE", "Everton", "EVE", null),
            new ProviderTeam("EXT-FUL", "Fulham", "FUL", null),
            new ProviderTeam("EXT-IPS", "Ipswich Town", "IPS", null),
            new ProviderTeam("EXT-LEI", "Leicester City", "LEI", null),
            new ProviderTeam("EXT-LIV", "Liverpool", "LIV", null),
            new ProviderTeam("EXT-MCI", "Manchester City", "MCI", null),
            new ProviderTeam("EXT-MUN", "Manchester United", "MUN", null),
            new ProviderTeam("EXT-NEW", "Newcastle United", "NEW", null),
            new ProviderTeam("EXT-NFO", "Nottingham Forest", "NFO", null),
            new ProviderTeam("EXT-SOU", "Southampton", "SOU", null),
            new ProviderTeam("EXT-TOT", "Tottenham", "TOT", null),
            new ProviderTeam("EXT-WHU", "West Ham United", "WHU", null),
            new ProviderTeam("EXT-WOL", "Wolverhampton", "WOL", null)
    );

    // Fixture pairings per gameweek (indices into TEAMS list). 10 matches per week.
    private static final int[][][] WEEK_PAIRINGS = {
            // GW 1
            {{0,1},{2,3},{4,5},{6,7},{8,9},{10,11},{12,13},{14,15},{16,17},{18,19}},
            // GW 2
            {{1,2},{3,4},{5,6},{7,8},{9,10},{11,12},{13,14},{15,16},{17,18},{19,0}},
            // GW 3
            {{0,2},{1,3},{4,6},{5,7},{8,10},{9,11},{12,14},{13,15},{16,18},{17,19}},
            // GW 4
            {{2,0},{3,1},{6,4},{7,5},{10,8},{11,9},{14,12},{15,13},{18,16},{19,17}},
            // GW 5
            {{0,4},{1,5},{2,6},{3,7},{8,12},{9,13},{10,14},{11,15},{16,19},{17,18}},
            // GW 6
            {{4,0},{5,1},{6,2},{7,3},{12,8},{13,9},{14,10},{15,11},{19,16},{18,17}},
            // GW 7
            {{0,8},{1,9},{2,10},{3,11},{4,12},{5,13},{6,14},{7,15},{16,17},{18,19}},
            // GW 8
            {{8,0},{9,1},{10,2},{11,3},{12,4},{13,5},{14,6},{15,7},{17,16},{19,18}},
    };

    // Some finished results for first 2 gameweeks (home score, away score)
    private static final int[][][] RESULTS = {
            // GW 1 results
            {{3,1},{0,0},{2,1},{1,1},{2,0},{1,3},{4,2},{0,1},{1,0},{2,2}},
            // GW 2 results
            {{2,1},{1,0},{3,2},{0,0},{1,1},{2,0},{1,2},{3,1},{0,1},{2,3}},
    };

    @Override
    public List<ProviderTeam> fetchTeams() {
        return TEAMS;
    }

    @Override
    public List<ProviderFixture> fetchFixtures(LocalDate from, LocalDate to) {
        return generateFixtures(from, to, false);
    }

    @Override
    public List<ProviderFixture> fetchResults(LocalDate from, LocalDate to) {
        return generateFixtures(from, to, true);
    }

    private List<ProviderFixture> generateFixtures(LocalDate from, LocalDate to, boolean resultsOnly) {
        List<ProviderFixture> fixtures = new ArrayList<>();

        // Anchor GW1 to the most recent Saturday on or before `from`,
        // so there are always upcoming gameweeks regardless of the date.
        // If `from` is in the future, start from the next Saturday after today.
        LocalDate anchor = from;
        // Step back to Saturday (or stay if already Saturday)
        while (anchor.getDayOfWeek() != java.time.DayOfWeek.SATURDAY) {
            anchor = anchor.minusDays(1);
        }

        for (int gw = 0; gw < WEEK_PAIRINGS.length; gw++) {
            LocalDate weekDate = anchor.plusWeeks(gw);
            if (weekDate.isBefore(from) || weekDate.isAfter(to)) continue;

            // Mark first 2 GWs relative to anchor as FINISHED (seeded results)
            boolean hasResults = gw < RESULTS.length
                    && weekDate.isBefore(LocalDate.now());
            if (resultsOnly && !hasResults) continue;

            int[][] pairings = WEEK_PAIRINGS[gw];
            for (int m = 0; m < pairings.length; m++) {
                int homeIdx = pairings[m][0];
                int awayIdx = pairings[m][1];

                String status = hasResults ? "FINISHED" : "SCHEDULED";
                Integer scoreHome = hasResults ? RESULTS[gw][m][0] : null;
                Integer scoreAway = hasResults ? RESULTS[gw][m][1] : null;

                LocalTime kickoff;
                if (m < 5) kickoff = LocalTime.of(15, 0);
                else if (m < 8) kickoff = LocalTime.of(17, 30);
                else kickoff = LocalTime.of(20, 0);

                fixtures.add(new ProviderFixture(
                        "MOCK-GW" + (gw + 1) + "-" + anchor + "-M" + (m + 1),
                        TEAMS.get(homeIdx).externalId(),
                        TEAMS.get(awayIdx).externalId(),
                        LocalDateTime.of(weekDate, kickoff),
                        status,
                        scoreHome,
                        scoreAway,
                        gw + 1
                ));
            }
        }
        return fixtures;
    }
}
