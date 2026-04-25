package com.lastmanstanding.service;

import com.lastmanstanding.entity.*;
import com.lastmanstanding.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class TestDataGenerator {

    private static final Logger log = LoggerFactory.getLogger(TestDataGenerator.class);

    private final UserRepository userRepository;
    private final CompetitionRepository competitionRepository;
    private final CompetitionParticipantRepository participantRepository;
    private final GameweekRepository gameweekRepository;
    private final PickRepository pickRepository;
    private final PickResultRepository pickResultRepository;
    private final TeamRepository teamRepository;
    private final PasswordEncoder passwordEncoder;

    public TestDataGenerator(UserRepository userRepository,
                             CompetitionRepository competitionRepository,
                             CompetitionParticipantRepository participantRepository,
                             GameweekRepository gameweekRepository,
                             PickRepository pickRepository,
                             PickResultRepository pickResultRepository,
                             TeamRepository teamRepository,
                             PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.competitionRepository = competitionRepository;
        this.participantRepository = participantRepository;
        this.gameweekRepository = gameweekRepository;
        this.pickRepository = pickRepository;
        this.pickResultRepository = pickResultRepository;
        this.teamRepository = teamRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public GenerationResult generateTestUsers(Long competitionId, int count, List<Integer> gameweeksToSeedPicks) {
        log.info("Generating {} test users for competition {}", count, competitionId);

        Competition comp = competitionRepository.findById(competitionId)
                .orElseThrow(() -> new IllegalArgumentException("Competition not found"));

        List<Team> allTeams = teamRepository.findAllByOrderByNameAsc();
        if (allTeams.isEmpty()) throw new IllegalStateException("No teams available");

        String passwordHash = passwordEncoder.encode("password123");

        // Build the expected emails/usernames for this batch
        List<String> expectedEmails = new ArrayList<>();
        for (int i = 1; i <= count; i++) expectedEmails.add(String.format("testuser%03d@lms.com", i));

        // Load ALL existing test users matching pattern in ONE query instead of scanning the entire table
        List<User> existingTestUsers = userRepository.findByUsernameLike("testuser%");
        Map<String, User> existingByEmail = existingTestUsers.stream()
                .collect(Collectors.toMap(User::getEmail, u -> u));

        List<User> usersToCreate = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            String email = String.format("testuser%03d@lms.com", i);
            String username = String.format("testuser%03d", i);
            if (!existingByEmail.containsKey(email)) {
                usersToCreate.add(new User(email, username, passwordHash, Role.USER));
            }
        }

        List<User> savedUsers = new ArrayList<>();
        final int USER_BATCH = 200;
        for (int i = 0; i < usersToCreate.size(); i += USER_BATCH) {
            int end = Math.min(i + USER_BATCH, usersToCreate.size());
            savedUsers.addAll(userRepository.saveAll(usersToCreate.subList(i, end)));
        }
        int usersCreated = savedUsers.size();

        // Rebuild full map after save (includes newly created)
        savedUsers.forEach(u -> existingByEmail.put(u.getEmail(), u));
        List<User> allTestUsers = expectedEmails.stream()
                .map(existingByEmail::get).filter(Objects::nonNull).toList();

        // Load existing participants in ONE query
        Set<Long> existingParticipantUserIds = participantRepository.findByCompetitionId(competitionId)
                .stream().map(cp -> cp.getUser().getId()).collect(Collectors.toSet());

        List<CompetitionParticipant> participantsToCreate = allTestUsers.stream()
                .filter(u -> !existingParticipantUserIds.contains(u.getId()))
                .map(u -> new CompetitionParticipant(comp, u, ParticipantStatus.ACTIVE))
                .toList();

        // Save participants in batches
        List<CompetitionParticipant> savedParticipants = new ArrayList<>();
        final int PARTICIPANT_BATCH = 200;
        for (int i = 0; i < participantsToCreate.size(); i += PARTICIPANT_BATCH) {
            int end = Math.min(i + PARTICIPANT_BATCH, participantsToCreate.size());
            savedParticipants.addAll(participantRepository.saveAll(participantsToCreate.subList(i, end)));
        }
        int usersJoined = savedParticipants.size();

        // Seed picks
        int picksCreated = 0;
        if (gameweeksToSeedPicks != null && !gameweeksToSeedPicks.isEmpty()) {
            Random random = new Random();

            for (Integer weekNumber : gameweeksToSeedPicks) {
                Gameweek gw = gameweekRepository.findByCompetitionIdAndWeekNumber(competitionId, weekNumber)
                        .orElse(null);
                if (gw == null) continue;

                // Load picks that already exist for this gameweek in ONE query
                Set<Long> usersWithPick = pickRepository.findByCompetitionIdAndGameweekId(competitionId, gw.getId())
                        .stream().map(p -> p.getUser().getId()).collect(Collectors.toSet());

                List<User> usersNeedingPick = allTestUsers.stream()
                        .filter(u -> !usersWithPick.contains(u.getId())).toList();

                if (usersNeedingPick.isEmpty()) continue;

                // Load ALL used team IDs for ALL users needing picks in ONE query
                List<Long> userIds = usersNeedingPick.stream().map(User::getId).toList();
                Map<Long, Set<Long>> usedTeamsByUser = new HashMap<>();
                userIds.forEach(uid -> usedTeamsByUser.put(uid, new HashSet<>()));
                if (!userIds.isEmpty()) {
                    pickRepository.findUsedTeamIdsByUserIds(competitionId, userIds)
                            .forEach(row -> usedTeamsByUser
                                    .computeIfAbsent((Long) row[0], k -> new HashSet<>())
                                    .add((Long) row[1]));
                }

                List<Pick> picksToCreate = new ArrayList<>();
                for (User user : usersNeedingPick) {
                    Set<Long> usedTeamIds = usedTeamsByUser.getOrDefault(user.getId(), Set.of());
                    List<Team> available = allTeams.stream()
                            .filter(t -> !usedTeamIds.contains(t.getId())).toList();
                    if (!available.isEmpty()) {
                        picksToCreate.add(new Pick(comp, user, gw,
                                available.get(random.nextInt(available.size())), PickSource.USER, true));
                    }
                }
                // Save picks in batches to avoid large insert transactions
                final int PICK_BATCH = 200;
                for (int i = 0; i < picksToCreate.size(); i += PICK_BATCH) {
                    int end = Math.min(i + PICK_BATCH, picksToCreate.size());
                    pickRepository.saveAll(picksToCreate.subList(i, end));
                }
                picksCreated += picksToCreate.size();
            }
        }

        log.info("Generation complete: {} created, {} joined, {} picks", usersCreated, usersJoined, picksCreated);
        return new GenerationResult(usersCreated, usersJoined, picksCreated);
    }

    @Transactional
    public int cleanupTestUsers() {
        log.info("Cleaning up test users...");

        // Load all test users matching pattern in one query
        List<Long> userIds = userRepository.findByUsernameLike("testuser%")
                .stream()
                .map(User::getId).toList();

        if (userIds.isEmpty()) return 0;

        // 3 bulk DELETE statements — no loops
        pickResultRepository.deleteByUserIds(userIds);
        pickRepository.deleteByUserIds(userIds);
        participantRepository.deleteByUserIds(userIds);
        userRepository.deleteAllById(userIds);

        log.info("Deleted {} test users", userIds.size());
        return userIds.size();
    }

    public record GenerationResult(int usersCreated, int participantsAdded, int picksCreated) {}
}
