package com.lastmanstanding.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;

@Embeddable
public class CompetitionAnnouncementReadId implements Serializable {

    @Column(name = "announcement_id")
    private Long announcementId;

    @Column(name = "user_id")
    private Long userId;

    protected CompetitionAnnouncementReadId() {}

    public CompetitionAnnouncementReadId(Long announcementId, Long userId) {
        this.announcementId = announcementId;
        this.userId = userId;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) return true;
        if (!(other instanceof CompetitionAnnouncementReadId that)) return false;
        return Objects.equals(announcementId, that.announcementId) && Objects.equals(userId, that.userId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(announcementId, userId);
    }
}
