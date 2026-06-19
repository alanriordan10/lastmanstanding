package com.lastmanstanding.repository;

import com.lastmanstanding.entity.Gameweek;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface GameweekRepository extends JpaRepository<Gameweek, Long> {

    List<Gameweek> findByCompetitionIdOrderByWeekNumberAsc(Long competitionId);

    @Query("SELECT g.id FROM Gameweek g WHERE g.competition.id = :competitionId ORDER BY g.weekNumber ASC")
    List<Long> findIdsByCompetitionIdOrderByWeekNumberAsc(@Param("competitionId") Long competitionId);

    @Query("SELECT g.id FROM Gameweek g WHERE g.competition.id = :competitionId AND g.status = :status")
    List<Long> findIdsByCompetitionIdAndStatus(@Param("competitionId") Long competitionId,
                                                @Param("status") com.lastmanstanding.entity.GameweekStatus status);

    Optional<Gameweek> findByCompetitionIdAndWeekNumber(Long competitionId, Integer weekNumber);

    @Query("SELECT g FROM Gameweek g WHERE g.competition.id = :competitionId AND g.status <> com.lastmanstanding.entity.GameweekStatus.COMPLETED ORDER BY g.weekNumber ASC LIMIT 1")
    Optional<Gameweek> findCurrentGameweek(@Param("competitionId") Long competitionId);

    @Query("SELECT g FROM Gameweek g WHERE g.competition.id = :competitionId AND g.status IN (com.lastmanstanding.entity.GameweekStatus.UPCOMING, com.lastmanstanding.entity.GameweekStatus.LOCKED, com.lastmanstanding.entity.GameweekStatus.IN_PROGRESS) ORDER BY g.weekNumber ASC LIMIT :limit")
    List<Gameweek> findNextUpcomingGameweeks(@Param("competitionId") Long competitionId, @Param("limit") int limit);

    @Query("SELECT g FROM Gameweek g WHERE g.competition.id = :competitionId AND g.weekNumber > :weekNumber ORDER BY g.weekNumber ASC")
    List<Gameweek> findAfterWeek(@Param("competitionId") Long competitionId, @Param("weekNumber") int weekNumber);

    @org.springframework.data.jpa.repository.Modifying
    @Query("DELETE FROM Gameweek g WHERE g.competition.id = :competitionId")
    void deleteByCompetitionId(@Param("competitionId") Long competitionId);

    @org.springframework.data.jpa.repository.Modifying
    @Query("DELETE FROM Gameweek g WHERE g.id IN :gameweekIds")
    void deleteByIds(@Param("gameweekIds") List<Long> gameweekIds);

    /** Returns [competitionId, startsAt] for the first non-completed gameweek per competition — avoids N+1 */
    @Query("SELECT g.competition.id, MIN(g.startsAt) FROM Gameweek g WHERE g.competition.id IN :competitionIds AND g.status IN (com.lastmanstanding.entity.GameweekStatus.UPCOMING, com.lastmanstanding.entity.GameweekStatus.LOCKED, com.lastmanstanding.entity.GameweekStatus.IN_PROGRESS) GROUP BY g.competition.id")
    List<Object[]> findFirstActiveGameweekDates(@Param("competitionIds") List<Long> competitionIds);

    /** Returns the next pickable gameweek per competition in one query. */
    @Query("SELECT g FROM Gameweek g WHERE g.competition.id IN :competitionIds AND g.status = com.lastmanstanding.entity.GameweekStatus.UPCOMING AND g.lockAt > :now ORDER BY g.competition.id ASC, g.weekNumber ASC")
    List<Gameweek> findPickableGameweeksByCompetitionIds(@Param("competitionIds") List<Long> competitionIds, @Param("now") java.time.LocalDateTime now);

    /** Find UPCOMING gameweeks locking between now and :cutoff that haven't had a reminder sent */
    @Query("SELECT g FROM Gameweek g WHERE g.status = com.lastmanstanding.entity.GameweekStatus.UPCOMING AND g.reminderSent = false AND g.lockAt > :now AND g.lockAt <= :cutoff")
    List<Gameweek> findGameweeksNeedingReminder(@Param("now") java.time.LocalDateTime now, @Param("cutoff") java.time.LocalDateTime cutoff);

    /**
     * Only gameweeks that can require scheduled processing.
     * Fetching the competition here avoids scanning every completed gameweek and
     * avoids a lazy competition lookup for each returned row.
     */
    @Query("""
            SELECT g
            FROM Gameweek g
            JOIN FETCH g.competition c
            WHERE c.status IN (
                com.lastmanstanding.entity.CompetitionStatus.UPCOMING,
                com.lastmanstanding.entity.CompetitionStatus.ACTIVE
            )
            AND (
                (g.status = com.lastmanstanding.entity.GameweekStatus.UPCOMING AND g.lockAt <= :now)
                OR g.status IN (
                    com.lastmanstanding.entity.GameweekStatus.LOCKED,
                    com.lastmanstanding.entity.GameweekStatus.IN_PROGRESS
                )
            )
            ORDER BY g.lockAt ASC, g.weekNumber ASC
            """)
    List<Gameweek> findGameweeksNeedingProcessing(@Param("now") java.time.LocalDateTime now);
}
