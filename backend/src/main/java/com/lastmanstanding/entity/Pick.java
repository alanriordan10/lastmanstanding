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
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "picks")
public class Pick {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "competition_id", nullable = false)
    private Competition competition;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "gameweek_id", nullable = false)
    private Gameweek gameweek;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "participant_id", nullable = false)
    private CompetitionParticipant participant;

    @Column(name = "picked_at", nullable = false, updatable = false)
    private LocalDateTime pickedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false)
    private PickSource source;

    @Column(name = "locked", nullable = false)
    private boolean locked;

    @Column(name = "use_lifeline", nullable = false)
    private boolean useLifeline = false;

    public Pick() {
    }

    public Pick(Competition competition, User user, Gameweek gameweek, Team team,
                PickSource source, boolean locked) {
        this.competition = competition;
        this.user = user;
        this.gameweek = gameweek;
        this.team = team;
        this.source = source;
        this.locked = locked;
    }

    public Pick(Competition competition, User user, CompetitionParticipant participant, Gameweek gameweek, Team team,
                PickSource source, boolean locked) {
        this.competition = competition;
        this.user = user;
        this.participant = participant;
        this.gameweek = gameweek;
        this.team = team;
        this.source = source;
        this.locked = locked;
    }

    @PrePersist
    protected void onCreate() {
        this.pickedAt = LocalDateTime.now();
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

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public Gameweek getGameweek() {
        return gameweek;
    }

    public void setGameweek(Gameweek gameweek) {
        this.gameweek = gameweek;
    }

    public Team getTeam() {
        return team;
    }

    public void setTeam(Team team) {
        this.team = team;
    }

    public CompetitionParticipant getParticipant() {
        return participant;
    }

    public void setParticipant(CompetitionParticipant participant) {
        this.participant = participant;
    }

    public LocalDateTime getPickedAt() {
        return pickedAt;
    }

    public void setPickedAt(LocalDateTime pickedAt) {
        this.pickedAt = pickedAt;
    }

    public PickSource getSource() {
        return source;
    }

    public void setSource(PickSource source) {
        this.source = source;
    }

    public boolean isLocked() {
        return locked;
    }

    public void setLocked(boolean locked) {
        this.locked = locked;
    }

    public boolean isUseLifeline() {
        return useLifeline;
    }

    public void setUseLifeline(boolean useLifeline) {
        this.useLifeline = useLifeline;
    }
}
