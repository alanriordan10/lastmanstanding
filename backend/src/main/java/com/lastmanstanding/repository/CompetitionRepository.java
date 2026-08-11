package com.lastmanstanding.repository;

import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionStatus;
import com.lastmanstanding.entity.CompetitionVisibility;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CompetitionRepository extends JpaRepository<Competition, Long> {

    List<Competition> findByStatusOrderByStartDateAsc(CompetitionStatus status);

    List<Competition> findByStatusInOrderByStartDateAsc(List<CompetitionStatus> statuses);

    List<Competition> findByStatusInAndVisibilityOrderByStartDateAsc(List<CompetitionStatus> statuses, CompetitionVisibility visibility);

    List<Competition> findByStatusInAndClubIdOrderByStartDateAsc(List<CompetitionStatus> statuses, Long clubId);

    List<Competition> findByStatusInAndClubIdAndVisibilityOrderByStartDateAsc(List<CompetitionStatus> statuses, Long clubId, CompetitionVisibility visibility);

    List<Competition> findByClubIdOrderByStartDateDesc(Long clubId);

    long countByClubId(Long clubId);

    List<Competition> findByStatusOrderByStartDateDesc(CompetitionStatus status);

    List<Competition> findByStatusAndClubIdOrderByStartDateDesc(CompetitionStatus status, Long clubId);

    Optional<Competition> findByJoinCodeIgnoreCase(String joinCode);

    boolean existsByJoinCode(String joinCode);
}
