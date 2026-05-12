package com.lastmanstanding.config;

import com.lastmanstanding.entity.*;
import com.lastmanstanding.repository.*;
import com.lastmanstanding.service.FixtureSyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Seeds the database with test data on startup if the DB is empty.
 * Creates: admin user, regular users, competitions, fixtures (via sync), participants, picks, and results.
 */
@Configuration
public class DataSeeder {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    @Bean
    CommandLineRunner seedData(UserRepository userRepository,
                               CompetitionRepository competitionRepository,
                               CompetitionParticipantRepository participantRepository,
                               GameweekRepository gameweekRepository,
                               TeamRepository teamRepository,
                               PickRepository pickRepository,
                               PickResultRepository pickResultRepository,
                               FixtureSyncService fixtureSyncService,
                               PasswordEncoder passwordEncoder) {
        return args -> {
            if (userRepository.existsByEmail("admin@lms.com")) {
                log.info("Seed data already present — skipping.");
                return;
            }

            log.info("═══════════════════════════════════════");
            log.info("  Seeding test data...");
            log.info("═══════════════════════════════════════");

            // ── 1. Create Users ─────────────────────────────────────
            User admin = userRepository.save(new User(
                    "admin@lms.com", "admin",
                    passwordEncoder.encode("admin1234"), Role.ADMIN));

            User alice = userRepository.save(new User(
                    "alice@test.com", "alice",
                    passwordEncoder.encode("password123"), Role.USER));

            User bob = userRepository.save(new User(
                    "bob@test.com", "bob",
                    passwordEncoder.encode("password123"), Role.USER));

            User charlie = userRepository.save(new User(
                    "charlie@test.com", "charlie",
                    passwordEncoder.encode("password123"), Role.USER));

            User dave = userRepository.save(new User(
                    "dave@test.com", "dave",
                    passwordEncoder.encode("password123"), Role.USER));

            User emma = userRepository.save(new User(
                    "emma@test.com", "emma",
                    passwordEncoder.encode("password123"), Role.USER));

            User frank = userRepository.save(new User(
                    "frank@test.com", "frank",
                    passwordEncoder.encode("password123"), Role.USER));

            User grace = userRepository.save(new User(
                    "grace@test.com", "grace",
                    passwordEncoder.encode("password123"), Role.USER));

            log.info("Created 8 users (admin + 7 players)");

            // ��─ 2. Sync Teams & Fixtures from MockProvider ──────────
            fixtureSyncService.syncTeams();
            log.info("Synced teams");

            // ── 3. Create Competitions ──────────────────────────────
            Competition comp1 = competitionRepository.save(new Competition(
                    "Premier League Survivor 2026",
                    "Classic last man standing. Pick a team to win each week — get it wrong and you're out! Entry fee goes to the winner.",
                    new BigDecimal("10.00"),
                    CompetitionStatus.ACTIVE,
                    MissedPickMode.ELIMINATE,
                    true,
                    LocalDate.of(2026, 3, 21),
                    admin));

            Competition comp2 = competitionRepository.save(new Competition(
                    "Office Challenge",
                    "Friendly office competition with auto-assign for missed picks. No entry fee.",
                    BigDecimal.ZERO,
                    CompetitionStatus.ACTIVE,
                    MissedPickMode.AUTO_ASSIGN,
                    false,
                    LocalDate.of(2026, 3, 21),
                    admin));

            Competition comp3 = competitionRepository.save(new Competition(
                    "Champions Cup 2026",
                    "High stakes survivor — €50 entry. Winner takes all!",
                    new BigDecimal("50.00"),
                    CompetitionStatus.UPCOMING,
                    MissedPickMode.ELIMINATE,
                    true,
                    LocalDate.of(2026, 4, 11),
                    admin));

            log.info("Created 3 competitions");

            // ── 4. Sync Fixtures (creates gameweeks + fixtures for active comps) ──
            fixtureSyncService.syncFixturesAndResults();
            log.info("Synced fixtures and results");

            // ── 5. Add Participants to Competition 1 ────────────────
            List<User> comp1Players = List.of(admin, alice, bob, charlie, dave, emma, frank, grace);
            for (User u : comp1Players) {
                participantRepository.save(new CompetitionParticipant(comp1, u, ParticipantStatus.ACTIVE));
            }

            // Add some to comp2
            List<User> comp2Players = List.of(alice, bob, charlie, dave);
            for (User u : comp2Players) {
                participantRepository.save(new CompetitionParticipant(comp2, u, ParticipantStatus.ACTIVE));
            }

            log.info("Added participants to competitions");

            // ── 6. Create Picks & Results for GW1 and GW2 (finished) ─
            List<Team> teams = teamRepository.findAllByOrderByNameAsc();
            // Build a quick name→team map
            java.util.Map<String, Team> teamMap = new java.util.HashMap<>();
            for (Team t : teams) teamMap.put(t.getShortName(), t);
            log.info("Available team short names: {}", teamMap.keySet());

            List<Gameweek> comp1Gameweeks = gameweekRepository.findByCompetitionIdOrderByWeekNumberAsc(comp1.getId());
            if (comp1Gameweeks.size() < 2) {
                log.warn("Not enough gameweeks to seed picks");
                return;
            }

            Gameweek gw1 = comp1Gameweeks.get(0);
            Gameweek gw2 = comp1Gameweeks.get(1);

            // Mark GW1 and GW2 as completed
            gw1.setStatus(GameweekStatus.COMPLETED);
            gameweekRepository.save(gw1);
            gw2.setStatus(GameweekStatus.COMPLETED);
            gameweekRepository.save(gw2);

            // ── GW1 Picks ───────────────────────────────────────────
            // GW1 results (from MockProvider):
            // ARS 3-1 AVL (Arsenal WIN), BOU 0-0 BRE (draw), BHA 2-1 CHE (Brighton WIN),
            // CRY 1-1 EVE (draw), FUL 2-0 IPS (Fulham WIN), LEI 1-3 LIV (Liverpool WIN),
            // MCI 4-2 MUN (Man City WIN), NEW 0-1 NFO (Nott Forest WIN),
            // SOU 1-0 TOT (Southampton WIN), WHU 2-2 WOL (draw)

            createPickWithResult(participantRepository, pickRepository, pickResultRepository,
                    comp1, admin, gw1, teamMap.get("ARS"), PickOutcome.ADVANCE);     // Arsenal won 3-1
            createPickWithResult(participantRepository, pickRepository, pickResultRepository,
                    comp1, alice, gw1, teamMap.get("LIV"), PickOutcome.ADVANCE);     // Liverpool won 3-1
            createPickWithResult(participantRepository, pickRepository, pickResultRepository,
                    comp1, bob, gw1, teamMap.get("MCI"), PickOutcome.ADVANCE);       // Man City won 4-2
            createPickWithResult(participantRepository, pickRepository, pickResultRepository,
                    comp1, charlie, gw1, teamMap.get("BHA"), PickOutcome.ADVANCE);   // Brighton won 2-1
            createPickWithResult(participantRepository, pickRepository, pickResultRepository,
                    comp1, dave, gw1, teamMap.get("EVE"), PickOutcome.ELIMINATED);   // Draw 1-1 → eliminated!
            createPickWithResult(participantRepository, pickRepository, pickResultRepository,
                    comp1, emma, gw1, teamMap.get("FUL"), PickOutcome.ADVANCE);      // Fulham won 2-0
            createPickWithResult(participantRepository, pickRepository, pickResultRepository,
                    comp1, frank, gw1, teamMap.get("NFO"), PickOutcome.ADVANCE);     // Nott Forest won 1-0
            createPickWithResult(participantRepository, pickRepository, pickResultRepository,
                    comp1, grace, gw1, teamMap.get("SOU"), PickOutcome.ADVANCE);     // Southampton won 1-0

            // Eliminate Dave
            CompetitionParticipant daveCp = participantRepository
                    .findByCompetitionIdAndUserId(comp1.getId(), dave.getId()).orElseThrow();
            daveCp.setStatus(ParticipantStatus.ELIMINATED);
            daveCp.setEliminatedWeek(1);
            participantRepository.save(daveCp);

            // ── GW2 Picks ───────────────────────────────────────────
            // GW2 results: AVL 2-1 BOU (Villa WIN), BRE 1-0 BHA (Brentford WIN),
            // CHE 3-2 CRY (Chelsea WIN), EVE 0-0 FUL (draw), IPS 1-1 LEI (draw),
            // LIV 2-0 MCI (Liverpool WIN), MUN 1-2 NEW (Newcastle WIN),
            // NFO 3-1 SOU (Nott Forest WIN), TOT 0-1 WHU (West Ham WIN), WOL 2-3 ARS (Arsenal WIN)

            createPickWithResult(participantRepository, pickRepository, pickResultRepository,
                    comp1, admin, gw2, teamMap.get("CHE"), PickOutcome.ADVANCE);     // Chelsea won 3-2
            createPickWithResult(participantRepository, pickRepository, pickResultRepository,
                    comp1, alice, gw2, teamMap.get("AVL"), PickOutcome.ADVANCE);     // Aston Villa won 2-1
            createPickWithResult(participantRepository, pickRepository, pickResultRepository,
                    comp1, bob, gw2, teamMap.get("NEW"), PickOutcome.ADVANCE);       // Newcastle won 2-1
            createPickWithResult(participantRepository, pickRepository, pickResultRepository,
                    comp1, charlie, gw2, teamMap.get("EVE"), PickOutcome.ELIMINATED);// Draw 0-0 → eliminated!
            // dave is already eliminated, no pick
            createPickWithResult(participantRepository, pickRepository, pickResultRepository,
                    comp1, emma, gw2, teamMap.get("WHU"), PickOutcome.ADVANCE);      // West Ham won 1-0
            createPickWithResult(participantRepository, pickRepository, pickResultRepository,
                    comp1, frank, gw2, teamMap.get("LIV"), PickOutcome.ADVANCE);     // Liverpool won 2-0
            createPickWithResult(participantRepository, pickRepository, pickResultRepository,
                    comp1, grace, gw2, teamMap.get("BRE"), PickOutcome.ADVANCE);     // Brentford won 1-0

            // Eliminate Charlie
            CompetitionParticipant charlieCp = participantRepository
                    .findByCompetitionIdAndUserId(comp1.getId(), charlie.getId()).orElseThrow();
            charlieCp.setStatus(ParticipantStatus.ELIMINATED);
            charlieCp.setEliminatedWeek(2);
            participantRepository.save(charlieCp);

            // ── GW3 — LOCKED / IN PROGRESS with pending picks ───────
            // GW3 pairings: ARS vs BHA, AVL vs BRE, BOU vs CRY, CHE vs EVE, FUL vs LEI,
            //               IPS vs LIV, MCI vs NFO, MUN vs SOU, TOT vs WOL, WHU vs ...
            // Set GW3 as IN_PROGRESS with lockAt in the past so selections are visible
            if (comp1Gameweeks.size() >= 3) {
                Gameweek gw3 = comp1Gameweeks.get(2);
                gw3.setStatus(GameweekStatus.IN_PROGRESS);
                gw3.setLockAt(LocalDateTime.now().minusHours(2)); // locked 2 hours ago
                gw3.setStartsAt(LocalDateTime.now().minusHours(1));
                gw3.setEndsAt(LocalDateTime.now().plusHours(24));
                gameweekRepository.save(gw3);

                // Active players pick for GW3 (no results yet — all PENDING)
                // Each player picks a team they haven't used in GW1/GW2
                createLockedPick(participantRepository, pickRepository, comp1, admin, gw3, teamMap.get("TOT"));    // admin used ARS(gw1), CHE(gw2)
                createLockedPick(participantRepository, pickRepository, comp1, alice, gw3, teamMap.get("MCI"));    // alice used LIV(gw1), AVL(gw2)
                createLockedPick(participantRepository, pickRepository, comp1, bob, gw3, teamMap.get("ARS"));      // bob used MCI(gw1), NEW(gw2)
                // charlie eliminated — no pick
                // dave eliminated — no pick
                createLockedPick(participantRepository, pickRepository, comp1, emma, gw3, teamMap.get("LIV"));     // emma used FUL(gw1), WHU(gw2)
                createLockedPick(participantRepository, pickRepository, comp1, frank, gw3, teamMap.get("MUN"));    // frank used NFO(gw1), LIV(gw2)
                createLockedPick(participantRepository, pickRepository, comp1, grace, gw3, teamMap.get("ARS"));    // grace used SOU(gw1), BRE(gw2)
                                                                                            // Note: grace & bob both picked ARS — that's fine, different users

                log.info("Created GW3 picks (IN_PROGRESS, locked, pending results)");
            }

            // ── GW4-6: Add locked picks for future simulation testing ───
            // This ensures admins can simulate results without all participants being eliminated for missed picks
            if (comp1Gameweeks.size() >= 6) {
                Gameweek gw4 = comp1Gameweeks.get(3);
                Gameweek gw5 = comp1Gameweeks.get(4);
                Gameweek gw6 = comp1Gameweeks.get(5);

                // GW4 picks (admin, alice, bob, emma, frank, grace - all still active)
                createLockedPick(participantRepository, pickRepository, comp1, admin, gw4, teamMap.get("BHA"));
                createLockedPick(participantRepository, pickRepository, comp1, alice, gw4, teamMap.get("WHU"));
                createLockedPick(participantRepository, pickRepository, comp1, bob, gw4, teamMap.get("BRE"));
                createLockedPick(participantRepository, pickRepository, comp1, emma, gw4, teamMap.get("NFO"));
                createLockedPick(participantRepository, pickRepository, comp1, frank, gw4, teamMap.get("TOT"));
                createLockedPick(participantRepository, pickRepository, comp1, grace, gw4, teamMap.get("LEI"));

                // GW5 picks
                createLockedPick(participantRepository, pickRepository, comp1, admin, gw5, teamMap.get("FUL"));
                createLockedPick(participantRepository, pickRepository, comp1, alice, gw5, teamMap.get("BOU"));
                createLockedPick(participantRepository, pickRepository, comp1, bob, gw5, teamMap.get("EVE"));
                createLockedPick(participantRepository, pickRepository, comp1, emma, gw5, teamMap.get("CHE"));
                createLockedPick(participantRepository, pickRepository, comp1, frank, gw5, teamMap.get("WOL"));
                createLockedPick(participantRepository, pickRepository, comp1, grace, gw5, teamMap.get("CRY"));

                // GW6 picks
                createLockedPick(participantRepository, pickRepository, comp1, admin, gw6, teamMap.get("IPS"));
                createLockedPick(participantRepository, pickRepository, comp1, alice, gw6, teamMap.get("SOU"));
                createLockedPick(participantRepository, pickRepository, comp1, bob, gw6, teamMap.get("WHU"));
                createLockedPick(participantRepository, pickRepository, comp1, emma, gw6, teamMap.get("BRE"));
                createLockedPick(participantRepository, pickRepository, comp1, frank, gw6, teamMap.get("CHE"));
                createLockedPick(participantRepository, pickRepository, comp1, grace, gw6, teamMap.get("MCI"));

                log.info("Created picks for GW4-6 for simulation testing");
            }

            log.info("═══════════════════════════════════════");
            log.info("  Seed complete! Test accounts:");
            log.info("  ─────────────────────────────────────");
            log.info("  ADMIN:  admin@lms.com / admin1234");
            log.info("  USERS:  alice@test.com / password123");
            log.info("          bob@test.com / password123");
            log.info("          charlie@test.com / password123  (ELIMINATED GW2)");
            log.info("          dave@test.com / password123     (ELIMINATED GW1)");
            log.info("          emma@test.com / password123");
            log.info("          frank@test.com / password123");
            log.info("          grace@test.com / password123");
            log.info("  ─────────────────────────────────────");
            log.info("  Competitions: 3 (2 active, 1 upcoming)");
            log.info("  GW1 & GW2: completed with picks/results");
            log.info("  GW3: IN PROGRESS — picks locked, visible!");
            log.info("  GW4-6: picks seeded for simulation testing");
            log.info("  Eliminated: dave (GW1), charlie (GW2)");
            log.info("  GW7+: upcoming — ready for picks!");
            log.info("═══════════════════════════════════════");
        };
    }

    private void createPickWithResult(CompetitionParticipantRepository participantRepository, PickRepository pickRepo, PickResultRepository resultRepo,
                                      Competition comp, User user, Gameweek gw, Team team,
                                      PickOutcome outcome) {
        if (team == null) {
            log.warn("Skipping seeded pick for user={} gw={} — team not found (short name mismatch)", user.getUsername(), gw.getWeekNumber());
            return;
        }
        CompetitionParticipant participant = participantRepository.findByCompetitionIdAndUserId(comp.getId(), user.getId()).orElseThrow();
        Pick pick = new Pick(comp, user, participant, gw, team, PickSource.USER, true);
        pick = pickRepo.save(pick);

        PickResult result = new PickResult(pick, outcome);
        result.setResolvedAt(LocalDateTime.now());
        resultRepo.save(result);
    }

    private void createLockedPick(CompetitionParticipantRepository participantRepository, PickRepository pickRepo,
                                  Competition comp, User user, Gameweek gw, Team team) {
        if (team == null) {
            log.warn("Skipping seeded locked pick for user={} gw={} — team not found (short name mismatch)", user.getUsername(), gw.getWeekNumber());
            return;
        }
        CompetitionParticipant participant = participantRepository.findByCompetitionIdAndUserId(comp.getId(), user.getId()).orElseThrow();
        Pick pick = new Pick(comp, user, participant, gw, team, PickSource.USER, true);
        pickRepo.save(pick);
        // No PickResult — outcome is PENDING (matches not finished yet)
    }
}
