package com.lastmanstanding.repository;

import com.lastmanstanding.entity.Fixture;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface FixtureRepository extends JpaRepository<Fixture, Long> {

    List<Fixture> findByGameweekId(Long gameweekId);

    List<Fixture> findByGameweekIdIn(List<Long> gameweekIds);

    Optional<Fixture> findByExternalFixtureId(String externalFixtureId);

    Optional<Fixture> findByExternalFixtureIdAndGameweekId(String externalFixtureId, Long gameweekId);

    @Modifying
    @Query("DELETE FROM Fixture f WHERE f.gameweek.id = :gameweekId")
    void deleteByGameweekId(@Param("gameweekId") Long gameweekId);

    @Modifying
    @Query("DELETE FROM Fixture f WHERE f.gameweek.id IN (SELECT g.id FROM Gameweek g WHERE g.competition.id = :competitionId)")
    void deleteByCompetitionId(@Param("competitionId") Long competitionId);
}
