package com.lastmanstanding.repository;

import com.lastmanstanding.entity.CompetitionParticipant;
import com.lastmanstanding.entity.ParticipantStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface CompetitionParticipantRepository extends JpaRepository<CompetitionParticipant, Long> {

    Optional<CompetitionParticipant> findByCompetitionIdAndUserId(Long competitionId, Long userId);
    Optional<CompetitionParticipant> findByCompetitionIdAndUserIdAndEntryNumber(Long competitionId, Long userId, Integer entryNumber);
    List<CompetitionParticipant> findByCompetitionIdAndUserIdOrderByEntryNumberAsc(Long competitionId, Long userId);
    Optional<CompetitionParticipant> findByIdAndCompetitionIdAndUserId(Long id, Long competitionId, Long userId);
    Optional<CompetitionParticipant> findByIdAndCompetitionId(Long id, Long competitionId);
    long countByCompetitionIdAndUserId(Long competitionId, Long userId);

    @org.springframework.data.jpa.repository.EntityGraph(attributePaths = {"user", "competition"})
    List<CompetitionParticipant> findByCompetitionId(Long competitionId);

    List<CompetitionParticipant> findByCompetitionIdAndStatus(Long competitionId, ParticipantStatus status);

    boolean existsByCompetitionIdAndUserId(Long competitionId, Long userId);

    @Query("SELECT cp.user.id FROM CompetitionParticipant cp WHERE cp.competition.id = :competitionId AND cp.user.id IN :userIds")
    List<Long> findParticipantUserIdsByCompetitionIdAndUserIdIn(@Param("competitionId") Long competitionId, @Param("userIds") List<Long> userIds);

    long countByCompetitionIdAndStatus(Long competitionId, ParticipantStatus status);

    @Query("SELECT COUNT(cp) FROM CompetitionParticipant cp WHERE cp.competition.id = :competitionId AND (cp.eliminatedWeek IS NULL OR cp.eliminatedWeek >= :weekNumber)")
    long countActiveAtStartForWeek(@Param("competitionId") Long competitionId, @Param("weekNumber") int weekNumber);

    @Query("SELECT COUNT(cp) FROM CompetitionParticipant cp WHERE cp.competition.id = :competitionId AND cp.eliminatedWeek = :weekNumber")
    long countEliminatedInWeek(@Param("competitionId") Long competitionId, @Param("weekNumber") int weekNumber);

    List<CompetitionParticipant> findByUserId(Long userId);

    @org.springframework.data.jpa.repository.EntityGraph(attributePaths = {"competition", "competition.createdBy", "competition.club"})
    List<CompetitionParticipant> findByUserIdOrderByJoinedAtDesc(Long userId);

    /** Returns [competitionId, totalCount, activeCount] rows — avoids N+1 when listing competitions */
    @Query("SELECT cp.competition.id, COUNT(cp), SUM(CASE WHEN cp.status IN ('ACTIVE','WINNER') THEN 1 ELSE 0 END) FROM CompetitionParticipant cp GROUP BY cp.competition.id")
    List<Object[]> countParticipantsGroupedByCompetition();

    @Query("SELECT cp.competition.id, COUNT(cp), SUM(CASE WHEN cp.status IN ('ACTIVE','WINNER') THEN 1 ELSE 0 END) " +
            "FROM CompetitionParticipant cp WHERE cp.competition.id IN :competitionIds GROUP BY cp.competition.id")
    List<Object[]> countParticipantsGroupedByCompetitionIds(@Param("competitionIds") List<Long> competitionIds);

    /** Load all winners across all competitions in one query */
    List<CompetitionParticipant> findByStatus(ParticipantStatus status);

    @Query("SELECT cp.competition.id, cp.user.username FROM CompetitionParticipant cp " +
            "WHERE cp.status = 'WINNER' AND cp.competition.id IN :competitionIds")
    List<Object[]> findWinnerUsernamesByCompetitionIds(@Param("competitionIds") List<Long> competitionIds);

    @Modifying
    @Query("DELETE FROM CompetitionParticipant cp WHERE cp.competition.id = :competitionId AND cp.user.id = :userId")
    void deleteByCompetitionIdAndUserId(@Param("competitionId") Long competitionId, @Param("userId") Long userId);

    @Modifying
    @Query("DELETE FROM CompetitionParticipant cp WHERE cp.user.id = :userId")
    void deleteByUserId(@Param("userId") Long userId);

    @Modifying
    @Query("DELETE FROM CompetitionParticipant cp WHERE cp.competition.id = :competitionId")
    void deleteByCompetitionId(@Param("competitionId") Long competitionId);

    /** Bulk delete participants for a list of users — used in test user cleanup */
    @Modifying
    @Query("DELETE FROM CompetitionParticipant cp WHERE cp.user.id IN :userIds")
    void deleteByUserIds(@Param("userIds") List<Long> userIds);
}
