package com.lastmanstanding.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "gameweeks")
public class Gameweek {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "competition_id", nullable = false)
    private Competition competition;

    @Column(name = "week_number", nullable = false)
    private int weekNumber;

    @Column(name = "lock_at", nullable = false)
    private LocalDateTime lockAt;

    @Column(name = "starts_at", nullable = false)
    private LocalDateTime startsAt;

    @Column(name = "ends_at", nullable = false)
    private LocalDateTime endsAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private GameweekStatus status;

    @Column(name = "bye_granted", nullable = false)
    private boolean byeGranted = false;

    @Column(name = "reminder_sent", nullable = false)
    private boolean reminderSent = false;

    public Gameweek() {
    }

    public Gameweek(Competition competition, int weekNumber, LocalDateTime lockAt,
                    LocalDateTime startsAt, LocalDateTime endsAt, GameweekStatus status) {
        this.competition = competition;
        this.weekNumber = weekNumber;
        this.lockAt = lockAt;
        this.startsAt = startsAt;
        this.endsAt = endsAt;
        this.status = status;
        this.byeGranted = false;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Competition getCompetition() {
        return competition;
    }

    public void setCompetition(Competition competition) {
        this.competition = competition;
    }

    public int getWeekNumber() {
        return weekNumber;
    }

    public void setWeekNumber(int weekNumber) {
        this.weekNumber = weekNumber;
    }

    public LocalDateTime getLockAt() {
        return lockAt;
    }

    public void setLockAt(LocalDateTime lockAt) {
        this.lockAt = lockAt;
    }

    public LocalDateTime getStartsAt() {
        return startsAt;
    }

    public void setStartsAt(LocalDateTime startsAt) {
        this.startsAt = startsAt;
    }

    public LocalDateTime getEndsAt() {
        return endsAt;
    }

    public void setEndsAt(LocalDateTime endsAt) {
        this.endsAt = endsAt;
    }

    public GameweekStatus getStatus() {
        return status;
    }

    public void setStatus(GameweekStatus status) {
        this.status = status;
    }

    public boolean isByeGranted() {
        return byeGranted;
    }

    public void setByeGranted(boolean byeGranted) {
        this.byeGranted = byeGranted;
    }

    public boolean isReminderSent() {
        return reminderSent;
    }

    public void setReminderSent(boolean reminderSent) {
        this.reminderSent = reminderSent;
    }
}
