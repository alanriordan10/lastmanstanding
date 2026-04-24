package com.lastmanstanding.service;

import com.lastmanstanding.entity.*;
import com.lastmanstanding.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class PickService {

    private final PickRepository pickRepository;
    private final PickResultRepository pickResultRepository;
    private final CompetitionParticipantRepository participantRepository;
    private final GameweekRepository gameweekRepository;
    private final FixtureRepository fixtureRepository;
    private final TeamRepository teamRepository;

    public PickService(PickRepository pickRepository,
                       PickResultRepository pickResultRepository,
                       CompetitionParticipantRepository participantRepository,
                       GameweekRepository gameweekRepository,
                       FixtureRepository fixtureRepository,
                       TeamRepository teamRepository) {
        this.pickRepository = pickRepository;
        this.pickResultRepository = pickResultRepository;
        this.participantRepository = participantRepository;
        this.gameweekRepository = gameweekRepository;
        this.fixtureRepository = fixtureRepository;
        this.teamRepository = teamRepository;
    }

    /**
     * Create or update a pick for the given competition/gameweek.
     * Validates lock time, team reuse, and participant status.
     */
    @Transactional
    public Pick makePick(Long competitionId, Long gameweekId, Long teamId, Long userId) {
        Gameweek gw = gameweekRepository.findById(gameweekId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Gameweek not found"));

        if (!gw.getCompetition().getId().equals(competitionId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gameweek does not belong to this competition");
        }

        // Check lock time
        if (LocalDateTime.now().isAfter(gw.getLockAt())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gameweek is locked — picks cannot be changed");
        }

        // Check participant is ACTIVE
        CompetitionParticipant cp = participantRepository.findByCompetitionIdAndUserId(competitionId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Not a participant in this competition"));

        if (cp.getStatus() != ParticipantStatus.ACTIVE && cp.getStatus() != ParticipantStatus.WINNER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "You are eliminated from this competition" +
                (cp.getEliminatedWeek() != null ? " (GW" + cp.getEliminatedWeek() + ")" : ""));
        }

        // Additional check: if eliminated, ensure they can't pick for gameweeks AFTER elimination
        if (cp.getStatus() == ParticipantStatus.ELIMINATED && cp.getEliminatedWeek() != null) {
            if (gw.getWeekNumber() > cp.getEliminatedWeek()) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "You were eliminated in Gameweek " + cp.getEliminatedWeek() +
                    " and cannot make picks for Gameweek " + gw.getWeekNumber());
            }
        }

        // Validate team exists
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Team not found"));

        // Check team has a fixture this gameweek
        List<Fixture> gwFixtures = fixtureRepository.findByGameweekId(gameweekId);
        boolean teamHasFixture = gwFixtures.stream().anyMatch(f ->
                f.getEffectiveHomeTeam().getId().equals(teamId) ||
                        f.getEffectiveAwayTeam().getId().equals(teamId));
        if (!teamHasFixture) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected team has no fixture this gameweek");
        }

        // Check team reuse — exclude the current gameweek pick from reuse check
        Optional<Pick> existingPick = pickRepository.findByCompetitionIdAndUserIdAndGameweekId(
                competitionId, userId, gameweekId);

        List<Long> usedTeamIds = pickRepository.findUsedTeamIds(competitionId, userId);
        if (existingPick.isPresent()) {
            usedTeamIds.remove(existingPick.get().getTeam().getId());
        }
        if (usedTeamIds.contains(teamId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Team already used in this competition");
        }

        // Create or update
        Pick pick;
        if (existingPick.isPresent()) {
            pick = existingPick.get();
            pick.setTeam(team);
            pick.setSource(PickSource.USER);
        } else {
            pick = new Pick(gw.getCompetition(), cp.getUser(), gw, team, PickSource.USER, false);
        }

        pick = pickRepository.save(pick);

        // Ensure a PENDING pick result exists
        PickResult pr = pickResultRepository.findByPickId(pick.getId()).orElse(null);
        if (pr == null) {
            pr = new PickResult(pick, PickOutcome.PENDING);
            pickResultRepository.save(pr);
        } else if (pr.getOutcome() != PickOutcome.PENDING) {
            // Reset result if we're updating before lock (should not normally happen if business rules are followed)
            pr.setOutcome(PickOutcome.PENDING);
            pr.setResolvedAt(null);
            pickResultRepository.save(pr);
        }

        return pick;
    }

    /**
     * Get user's pick history for a competition.
     */
    public List<Pick> getPickHistory(Long competitionId, Long userId) {
        return pickRepository.findByCompetitionIdAndUserId(competitionId, userId);
    }

    /**
     * Get all picks for a gameweek with user+team eagerly loaded (no N+1).
     */
    public List<Pick> getGameweekSelectionsFetch(Long competitionId, Long gameweekId) {
        Gameweek gw = gameweekRepository.findById(gameweekId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Gameweek not found"));
        if (gw.getStatus() == GameweekStatus.UPCOMING) {
            if (LocalDateTime.now().isBefore(gw.getLockAt())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Selections are hidden until the gameweek is locked");
            }
        }
        return pickRepository.findByCompetitionIdAndGameweekIdFetch(competitionId, gameweekId);
    }

    /**
     * Get all picks for a gameweek (only after lock time).
     */
    public List<Pick> getGameweekSelections(Long competitionId, Long gameweekId) {
        Gameweek gw = gameweekRepository.findById(gameweekId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Gameweek not found"));

        // Allow viewing if gameweek is locked, in progress, or completed (regardless of lockAt time)
        // This handles simulated gameweeks where lockAt might be in the future
        if (gw.getStatus() == GameweekStatus.UPCOMING) {
            // For upcoming gameweeks, also check if lock time has passed
            if (LocalDateTime.now().isBefore(gw.getLockAt())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Selections are hidden until the gameweek is locked");
            }
        }

        return pickRepository.findByCompetitionIdAndGameweekId(competitionId, gameweekId);
    }

    /**
     * Get the current user's pick for a specific gameweek (visible at any time to the user).
     */
    public Optional<Pick> getMyPick(Long competitionId, Long gameweekId, Long userId) {
        return pickRepository.findByCompetitionIdAndUserIdAndGameweekId(competitionId, userId, gameweekId);
    }
}
