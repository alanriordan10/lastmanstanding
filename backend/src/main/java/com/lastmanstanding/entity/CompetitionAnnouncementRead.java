package com.lastmanstanding.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "competition_announcement_reads")
public class CompetitionAnnouncementRead {

    @EmbeddedId
    private CompetitionAnnouncementReadId id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @MapsId("announcementId")
    @JoinColumn(name = "announcement_id", nullable = false)
    private CompetitionAnnouncement announcement;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @MapsId("userId")
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "read_at", nullable = false)
    private LocalDateTime readAt;

    protected CompetitionAnnouncementRead() {}

    public CompetitionAnnouncementRead(CompetitionAnnouncement announcement, User user) {
        this.id = new CompetitionAnnouncementReadId(announcement.getId(), user.getId());
        this.announcement = announcement;
        this.user = user;
    }

    @PrePersist
    protected void onCreate() {
        readAt = LocalDateTime.now();
    }
}
