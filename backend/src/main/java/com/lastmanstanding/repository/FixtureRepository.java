package com.lastmanstanding.repository;

import com.lastmanstanding.entity.Fixture;
import java.util.List;
import java.util.Optional;
import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface FixtureRepository extends JpaRepository<Fixture, Long> {

    List<Fixture> findByGameweekId(Long gameweekId);

    List<Fixture> findByGameweekIdIn(List<Long> gameweekIds);

    @Query("SELECT DISTINCT f FROM Fixture f " +
            "JOIN FETCH f.gameweek " +
            "JOIN FETCH f.importedHomeTeam " +
            "JOIN FETCH f.importedAwayTeam " +
            "LEFT JOIN FETCH f.overrideHomeTeam " +
            "LEFT JOIN FETCH f.overrideAwayTeam " +
            "WHERE f.gameweek.id = :gameweekId")
    List<Fixture> findByGameweekIdFetchAll(@Param("gameweekId") Long gameweekId);

    @Query("SELECT DISTINCT f FROM Fixture f " +
            "JOIN FETCH f.gameweek " +
            "JOIN FETCH f.importedHomeTeam " +
            "JOIN FETCH f.importedAwayTeam " +
            "LEFT JOIN FETCH f.overrideHomeTeam " +
            "LEFT JOIN FETCH f.overrideAwayTeam " +
            "WHERE f.gameweek.id IN :gameweekIds")
    List<Fixture> findByGameweekIdInFetchAll(@Param("gameweekIds") List<Long> gameweekIds);

    Optional<Fixture> findByExternalFixtureId(String externalFixtureId);

    Optional<Fixture> findByExternalFixtureIdAndGameweekId(String externalFixtureId, Long gameweekId);
    List<Fixture> findByExternalFixtureIdIn(List<String> externalFixtureIds);

    @Modifying
    @Query("DELETE FROM Fixture f WHERE f.gameweek.id = :gameweekId")
    void deleteByGameweekId(@Param("gameweekId") Long gameweekId);

    @Modifying
    @Query("DELETE FROM Fixture f WHERE f.gameweek.id IN :gameweekIds")
    void deleteByGameweekIds(@Param("gameweekIds") List<Long> gameweekIds);

    @Modifying
    @Query("DELETE FROM Fixture f WHERE f.gameweek.id IN (SELECT g.id FROM Gameweek g WHERE g.competition.id = :competitionId)")
    void deleteByCompetitionId(@Param("competitionId") Long competitionId);

    @Query(value = "SELECT id FROM fixtures WHERE gameweek_id = :gameweekId ORDER BY id LIMIT :limit", nativeQuery = true)
    List<Long> findIdsByGameweekIdLimit(@Param("gameweekId") Long gameweekId, @Param("limit") int limit);

    @Query("SELECT f FROM Fixture f " +
            "JOIN FETCH f.importedHomeTeam " +
            "JOIN FETCH f.importedAwayTeam " +
            "JOIN FETCH f.gameweek gw " +
            "JOIN FETCH gw.competition " +
            "WHERE f.importedKickoffAt >= :from " +
            "AND f.importedKickoffAt <= :to " +
            "AND (f.oddsUpdatedAt IS NULL OR f.oddsUpdatedAt < :staleBefore) " +
            "AND gw.status IN (" +
            "com.lastmanstanding.entity.GameweekStatus.UPCOMING, " +
            "com.lastmanstanding.entity.GameweekStatus.LOCKED, " +
            "com.lastmanstanding.entity.GameweekStatus.IN_PROGRESS)")
    List<Fixture> findOddsSyncCandidates(@Param("from") LocalDateTime from,
                                         @Param("to") LocalDateTime to,
                                         @Param("staleBefore") LocalDateTime staleBefore);
}
