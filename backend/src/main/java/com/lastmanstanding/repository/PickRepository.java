package com.lastmanstanding.repository;

import com.lastmanstanding.entity.Pick;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface PickRepository extends JpaRepository<Pick, Long> {

    Optional<Pick> findByCompetitionIdAndUserIdAndGameweekId(Long competitionId, Long userId, Long gameweekId);

    List<Pick> findByCompetitionIdAndUserId(Long competitionId, Long userId);

    List<Pick> findByCompetitionIdAndGameweekId(Long competitionId, Long gameweekId);

    /** Eagerly fetch user and team in one query — eliminates N+1 on the selections endpoint */
    @Query("SELECT p FROM Pick p JOIN FETCH p.user JOIN FETCH p.team WHERE p.competition.id = :competitionId AND p.gameweek.id = :gameweekId")
    List<Pick> findByCompetitionIdAndGameweekIdFetch(@Param("competitionId") Long competitionId, @Param("gameweekId") Long gameweekId);

    boolean existsByCompetitionIdAndUserIdAndTeamId(Long competitionId, Long userId, Long teamId);

    @Query("SELECT p.team.id FROM Pick p WHERE p.competition.id = :competitionId AND p.user.id = :userId")
    List<Long> findUsedTeamIds(@Param("competitionId") Long competitionId, @Param("userId") Long userId);

    /** Returns [userId, teamId] pairs for a list of users in one query — avoids N+1 in auto-assign */
    @Query("SELECT p.user.id, p.team.id FROM Pick p WHERE p.competition.id = :competitionId AND p.user.id IN :userIds")
    List<Object[]> findUsedTeamIdsByUserIds(@Param("competitionId") Long competitionId, @Param("userIds") List<Long> userIds);

    /** Returns pick IDs for a user in future gameweeks — used for elimination cleanup */
    @Query("SELECT p.id FROM Pick p WHERE p.competition.id = :competitionId AND p.user.id = :userId AND p.gameweek.weekNumber > :weekNumber")
    List<Long> findFuturePickIds(@Param("competitionId") Long competitionId, @Param("userId") Long userId, @Param("weekNumber") int weekNumber);

    /** Bulk delete picks for future gameweeks after elimination */
    @Modifying
    @Query("DELETE FROM Pick p WHERE p.competition.id = :competitionId AND p.user.id = :userId AND p.gameweek.weekNumber > :weekNumber")
    void deleteFuturePicks(@Param("competitionId") Long competitionId, @Param("userId") Long userId, @Param("weekNumber") int weekNumber);

    /** Bulk-delete future picks for MULTIPLE users in a single query — avoids N SQL statements on mass elimination */
    @Modifying
    @Query("DELETE FROM Pick p WHERE p.competition.id = :competitionId AND p.user.id IN :userIds AND p.gameweek.weekNumber > :weekNumber")
    void deleteFuturePicksForUsers(@Param("competitionId") Long competitionId, @Param("userIds") List<Long> userIds, @Param("weekNumber") int weekNumber);

    List<Pick> findByCompetitionId(Long competitionId);

    @Query(value = "SELECT id FROM picks WHERE competition_id = :competitionId ORDER BY id LIMIT :limit", nativeQuery = true)
    List<Long> findIdsByCompetitionIdLimit(@Param("competitionId") Long competitionId, @Param("limit") int limit);

    List<Pick> findByUserId(Long userId);

    @Modifying
    @Query("DELETE FROM Pick p WHERE p.competition.id = :competitionId AND p.user.id = :userId")
    void deleteByCompetitionIdAndUserId(@Param("competitionId") Long competitionId, @Param("userId") Long userId);

    @Modifying
    @Query("DELETE FROM Pick p WHERE p.user.id = :userId")
    void deleteByUserId(@Param("userId") Long userId);

    /** Bulk delete picks for a list of users — used in test user cleanup */
    @Modifying
    @Query("DELETE FROM Pick p WHERE p.user.id IN :userIds")
    void deleteByUserIds(@Param("userIds") List<Long> userIds);

    @Modifying
    @Query("DELETE FROM Pick p WHERE p.competition.id = :competitionId")
    void deleteByCompetitionId(@Param("competitionId") Long competitionId);

    /** Returns [teamId, teamName, teamShortName, count] for all picks in a gameweek */
    @Query("SELECT p.team.id, p.team.name, p.team.shortName, COUNT(p) FROM Pick p WHERE p.competition.id = :competitionId AND p.gameweek.id = :gameweekId GROUP BY p.team.id, p.team.name, p.team.shortName")
    List<Object[]> countPicksPerTeam(@Param("competitionId") Long competitionId, @Param("gameweekId") Long gameweekId);
}
