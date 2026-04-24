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

    @Query("SELECT p FROM Payment p WHERE p.competition.id = :competitionId AND p.user.id = :userId AND p.status = 'SUCCEEDED'")
    Optional<Payment> findSucceededByCompetitionAndUser(@Param("competitionId") Long competitionId, @Param("userId") Long userId);

    @Modifying
    @Query("UPDATE Payment p SET p.status = :status WHERE p.id = :paymentId")
    void updateStatus(@Param("paymentId") Long paymentId, @Param("status") Payment.PaymentStatus status);
}
