package com.lastmanstanding.repository;

import com.lastmanstanding.entity.Team;
import java.util.List;
import java.util.Optional;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TeamRepository extends JpaRepository<Team, Long> {

    @Override
    @Cacheable(cacheNames = com.lastmanstanding.config.CacheConfig.TEAM_BY_ID_CACHE, key = "#id")
    Optional<Team> findById(Long id);

    Optional<Team> findByExternalTeamId(String externalTeamId);

    Optional<Team> findByName(String name);

    List<Team> findAllByOrderByNameAsc();
}
