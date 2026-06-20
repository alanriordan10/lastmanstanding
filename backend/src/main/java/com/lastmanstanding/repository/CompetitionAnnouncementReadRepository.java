package com.lastmanstanding.repository;

import com.lastmanstanding.entity.CompetitionAnnouncementRead;
import com.lastmanstanding.entity.CompetitionAnnouncementReadId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Set;

public interface CompetitionAnnouncementReadRepository extends JpaRepository<CompetitionAnnouncementRead, CompetitionAnnouncementReadId> {

    @Query("SELECT r.id.announcementId FROM CompetitionAnnouncementRead r WHERE r.id.userId = :userId")
    Set<Long> findReadAnnouncementIds(@Param("userId") Long userId);
}
