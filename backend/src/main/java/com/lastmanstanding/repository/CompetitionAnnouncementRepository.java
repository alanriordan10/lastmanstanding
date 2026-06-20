package com.lastmanstanding.repository;

import com.lastmanstanding.entity.CompetitionAnnouncement;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CompetitionAnnouncementRepository extends JpaRepository<CompetitionAnnouncement, Long> {

    @EntityGraph(attributePaths = {"competition", "competition.club", "createdBy"})
    List<CompetitionAnnouncement> findByCompetitionIdOrderByCreatedAtDesc(Long competitionId, Pageable pageable);

    @EntityGraph(attributePaths = {"competition", "competition.club", "createdBy"})
    @Query("""
            SELECT DISTINCT a FROM CompetitionAnnouncement a
            LEFT JOIN CompetitionParticipant cp ON cp.competition.id = a.competition.id
            WHERE cp.user.id = :userId OR a.createdBy.id = :userId
            ORDER BY a.createdAt DESC
            """)
    List<CompetitionAnnouncement> findVisibleToUser(@Param("userId") Long userId, Pageable pageable);
}
