package com.lastmanstanding.repository;

import com.lastmanstanding.entity.Team;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TeamRepository extends JpaRepository<Team, Long> {

    Optional<Team> findByExternalTeamId(String externalTeamId);

    Optional<Team> findByName(String name);

    List<Team> findAllByOrderByNameAsc();
}
