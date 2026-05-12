package com.lastmanstanding.repository;

import com.lastmanstanding.entity.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, Long> {
    Optional<Payment> findByStripePaymentIntentId(String intentId);
    boolean existsByUserIdAndCompetitionIdAndStatus(Long userId, Long competitionId, Payment.PaymentStatus status);

    @Query("SELECT p.user.id FROM Payment p WHERE p.competition.id = :competitionId AND p.status = 'SUCCEEDED'")
    List<Long> findPaidUserIdsByCompetitionId(Long competitionId);

    @Query("SELECT p.user.id FROM Payment p WHERE p.competition.id = :competitionId AND p.status = 'SUCCEEDED' AND p.user.id IN :userIds")
    List<Long> findPaidUserIdsByCompetitionIdAndUserIdIn(@Param("competitionId") Long competitionId, @Param("userIds") List<Long> userIds);

    @Query("SELECT p FROM Payment p WHERE p.competition.id = :competitionId AND p.user.id = :userId AND p.status = 'SUCCEEDED'")
    Optional<Payment> findSucceededByCompetitionAndUser(@Param("competitionId") Long competitionId, @Param("userId") Long userId);

    @Query("SELECT p.competition.id, p.status FROM Payment p WHERE p.user.id = :userId AND p.competition.id IN :competitionIds")
    List<Object[]> findStatusesByUserAndCompetitionIds(@Param("userId") Long userId, @Param("competitionIds") List<Long> competitionIds);

    @Query("SELECT p.status FROM Payment p WHERE p.user.id = :userId AND p.competition.id = :competitionId")
    List<Payment.PaymentStatus> findStatusesByUserAndCompetition(@Param("userId") Long userId, @Param("competitionId") Long competitionId);

    @Modifying
    @Query("DELETE FROM Payment p WHERE p.competition.id = :competitionId")
    void deleteByCompetitionId(@Param("competitionId") Long competitionId);

    @Modifying
    @Query("UPDATE Payment p SET p.status = :status WHERE p.id = :paymentId")
    void updateStatus(@Param("paymentId") Long paymentId, @Param("status") Payment.PaymentStatus status);

    @Modifying
    @Query(value = "INSERT INTO payments (" +
            "user_id, competition_id, stripe_payment_intent_id, amount_cents, currency, status, webhook_confirmed, created_at, updated_at" +
            ") SELECT " +
            "u.id, :competitionId, NULL, :amountCents, :currency, 'SUCCEEDED', FALSE, NOW(), NOW() " +
            "FROM users u " +
            "JOIN competition_participants cp ON cp.user_id = u.id AND cp.competition_id = :competitionId " +
            "LEFT JOIN payments p ON p.user_id = u.id AND p.competition_id = :competitionId AND p.status = 'SUCCEEDED' " +
            "WHERE u.id IN (:userIds) AND p.id IS NULL", nativeQuery = true)
    int insertSucceededManualPaymentsForUsers(@Param("competitionId") Long competitionId,
                                              @Param("userIds") List<Long> userIds,
                                              @Param("amountCents") int amountCents,
                                              @Param("currency") String currency);
}
