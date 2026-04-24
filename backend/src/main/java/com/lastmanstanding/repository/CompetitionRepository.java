package com.lastmanstanding.repository;

import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionStatus;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CompetitionRepository extends JpaRepository<Competition, Long> {

    List<Competition> findByStatusOrderByStartDateAsc(CompetitionStatus status);

    List<Competition> findByStatusInOrderByStartDateAsc(List<CompetitionStatus> statuses);

    List<Competition> findByStatusInAndClubIdOrderByStartDateAsc(List<CompetitionStatus> statuses, Long clubId);

    List<Competition> findByClubIdOrderByStartDateDesc(Long clubId);

    List<Competition> findByStatusOrderByStartDateDesc(CompetitionStatus status);

    List<Competition> findByStatusAndClubIdOrderByStartDateDesc(CompetitionStatus status, Long clubId);
}
