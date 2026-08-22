package com.lastmanstanding.repository;

import com.lastmanstanding.entity.AuditLog;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, Long>, JpaSpecificationExecutor<AuditLog> {

    List<AuditLog> findByEntityTypeAndEntityIdOrderByCreatedAtDesc(String entityType, Long entityId);

    /** Used by the admin debug summary to roll in per-participant audit entries. */
    List<AuditLog> findByEntityTypeAndEntityIdInOrderByCreatedAtDesc(String entityType, Collection<Long> entityIds);

    Page<AuditLog> findAllByOrderByCreatedAtDesc(Pageable pageable);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update AuditLog a set a.user = null where a.user.id = :userId")
    int detachUser(@Param("userId") Long userId);
}

