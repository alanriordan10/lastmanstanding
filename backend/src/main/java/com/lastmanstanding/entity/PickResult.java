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
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "pick_results")
public class PickResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pick_id", nullable = false, unique = true)
    private Pick pick;

    @Enumerated(EnumType.STRING)
    @Column(name = "outcome", nullable = false)
    private PickOutcome outcome;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    public PickResult() {
    }

    public PickResult(Pick pick, PickOutcome outcome) {
        this.pick = pick;
        this.outcome = outcome;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Pick getPick() {
        return pick;
    }

    public void setPick(Pick pick) {
        this.pick = pick;
    }

    public PickOutcome getOutcome() {
        return outcome;
    }

    public void setOutcome(PickOutcome outcome) {
        this.outcome = outcome;
    }

    public LocalDateTime getResolvedAt() {
        return resolvedAt;
    }

    public void setResolvedAt(LocalDateTime resolvedAt) {
        this.resolvedAt = resolvedAt;
    }
}
