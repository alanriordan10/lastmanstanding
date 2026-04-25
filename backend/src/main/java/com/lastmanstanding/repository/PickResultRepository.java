package com.lastmanstanding.repository;

import com.lastmanstanding.entity.PickResult;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface PickResultRepository extends JpaRepository<PickResult, Long> {

    Optional<PickResult> findByPickId(Long pickId);

    List<PickResult> findByPickIdIn(List<Long> pickIds);

    @Modifying
    @Query("DELETE FROM PickResult pr WHERE pr.pick.id IN :pickIds")
    void deleteByPickIdIn(@Param("pickIds") List<Long> pickIds);

    @Query("SELECT pr FROM PickResult pr JOIN pr.pick p WHERE p.competition.id = :competitionId AND p.gameweek.id = :gameweekId")
    List<PickResult> findByCompetitionIdAndGameweekId(@Param("competitionId") Long competitionId, @Param("gameweekId") Long gameweekId);

    @Modifying
    @Query("DELETE FROM PickResult pr WHERE pr.pick.id IN (SELECT p.id FROM Pick p WHERE p.competition.id = :competitionId AND p.user.id = :userId)")
    void deleteByCompetitionIdAndUserId(@Param("competitionId") Long competitionId, @Param("userId") Long userId);

    @Modifying
    @Query("DELETE FROM PickResult pr WHERE pr.pick.id IN (SELECT p.id FROM Pick p WHERE p.competition.id = :competitionId)")
    void deleteByCompetitionId(@Param("competitionId") Long competitionId);

    /** Bulk delete all pick results for a list of users — used in test user cleanup */
    @Modifying
    @Query("DELETE FROM PickResult pr WHERE pr.pick.id IN (SELECT p.id FROM Pick p WHERE p.user.id IN :userIds)")
    void deleteByUserIds(@Param("userIds") List<Long> userIds);
    @Modifying
    @Query("DELETE FROM PickResult pr WHERE pr.pick.id IN (SELECT p.id FROM Pick p WHERE p.competition.id = :competitionId AND p.user.id = :userId AND p.gameweek.weekNumber > :weekNumber)")
    void deleteFuturePickResults(@Param("competitionId") Long competitionId, @Param("userId") Long userId, @Param("weekNumber") int weekNumber);

    /** Bulk-delete future pick results for MULTIPLE users in a single query — avoids N*2 SQL on mass elimination */
    @Modifying
    @Query("DELETE FROM PickResult pr WHERE pr.pick.id IN (SELECT p.id FROM Pick p WHERE p.competition.id = :competitionId AND p.user.id IN :userIds AND p.gameweek.weekNumber > :weekNumber)")
    void deleteFuturePickResultsForUsers(@Param("competitionId") Long competitionId, @Param("userIds") List<Long> userIds, @Param("weekNumber") int weekNumber);

    /** Count pick results by outcome for a gameweek */
    @Query("SELECT pr.outcome, COUNT(pr) FROM PickResult pr JOIN pr.pick p WHERE p.competition.id = :competitionId AND p.gameweek.id = :gameweekId GROUP BY pr.outcome")
    List<Object[]> countByOutcomeForGameweek(@Param("competitionId") Long competitionId, @Param("gameweekId") Long gameweekId);
}
