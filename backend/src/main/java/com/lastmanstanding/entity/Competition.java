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
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "competitions")
public class Competition {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "description")
    private String description;

    @Column(name = "entry_fee", precision = 10, scale = 2)
    private BigDecimal entryFee;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private CompetitionStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "missed_pick_mode", nullable = false)
    private MissedPickMode missedPickMode;

    @Column(name = "postponed_consumes_team", nullable = false)
    private boolean postponedConsumesTeam = true;

    @Column(name = "pass_fee_to_participant", nullable = false)
    private boolean passFeeToParticipant = false;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_mode", nullable = false)
    private PaymentMode paymentMode = PaymentMode.FREE;

    @Enumerated(EnumType.STRING)
    @Column(name = "manual_payment_policy", nullable = false)
    private ManualPaymentPolicy manualPaymentPolicy = ManualPaymentPolicy.STRICT;

    @Enumerated(EnumType.STRING)
    @Column(name = "visibility", nullable = false)
    private CompetitionVisibility visibility = CompetitionVisibility.PUBLIC;

    @Column(name = "join_code", unique = true, length = 12)
    private String joinCode;

    @Column(name = "prize_pool", precision = 10, scale = 2)
    private BigDecimal prizePool;

    @Column(name = "start_date")
    private LocalDate startDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "club_id")
    private Club club;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public Competition() {
    }

    public Competition(String name, String description, BigDecimal entryFee,
                       CompetitionStatus status, MissedPickMode missedPickMode,
                       boolean postponedConsumesTeam, LocalDate startDate, User createdBy) {
        this.name = name;
        this.description = description;
        this.entryFee = entryFee;
        this.status = status;
        this.missedPickMode = missedPickMode;
        this.postponedConsumesTeam = postponedConsumesTeam;
        this.startDate = startDate;
        this.createdBy = createdBy;
    }

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public BigDecimal getEntryFee() {
        return entryFee;
    }

    public void setEntryFee(BigDecimal entryFee) {
        this.entryFee = entryFee;
    }

    public CompetitionStatus getStatus() {
        return status;
    }

    public void setStatus(CompetitionStatus status) {
        this.status = status;
    }

    public MissedPickMode getMissedPickMode() {
        return missedPickMode;
    }

    public void setMissedPickMode(MissedPickMode missedPickMode) {
        this.missedPickMode = missedPickMode;
    }

    public boolean isPostponedConsumesTeam() {
        return postponedConsumesTeam;
    }

    public void setPostponedConsumesTeam(boolean postponedConsumesTeam) {
        this.postponedConsumesTeam = postponedConsumesTeam;
    }

    public boolean isPassFeeToParticipant() {
        return passFeeToParticipant;
    }

    public void setPassFeeToParticipant(boolean passFeeToParticipant) {
        this.passFeeToParticipant = passFeeToParticipant;
    }

    public PaymentMode getPaymentMode() {
        return paymentMode;
    }

    public void setPaymentMode(PaymentMode paymentMode) {
        this.paymentMode = paymentMode;
    }

    public ManualPaymentPolicy getManualPaymentPolicy() {
        return manualPaymentPolicy;
    }

    public void setManualPaymentPolicy(ManualPaymentPolicy manualPaymentPolicy) {
        this.manualPaymentPolicy = manualPaymentPolicy;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public void setStartDate(LocalDate startDate) {
        this.startDate = startDate;
    }

    public User getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(User createdBy) {
        this.createdBy = createdBy;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Club getClub() {
        return club;
    }

    public void setClub(Club club) {
        this.club = club;
    }

    public BigDecimal getPrizePool() {
        return prizePool;
    }

    public void setPrizePool(BigDecimal prizePool) {
        this.prizePool = prizePool;
    }

    public CompetitionVisibility getVisibility() {
        return visibility;
    }

    public void setVisibility(CompetitionVisibility visibility) {
        this.visibility = visibility;
    }

    public String getJoinCode() {
        return joinCode;
    }

    public void setJoinCode(String joinCode) {
        this.joinCode = joinCode;
    }
}
