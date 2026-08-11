package com.lastmanstanding.repository;

import com.lastmanstanding.entity.ClubSlotPurchase;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ClubSlotPurchaseRepository extends JpaRepository<ClubSlotPurchase, Long> {

    Optional<ClubSlotPurchase> findByStripeSessionId(String stripeSessionId);

    boolean existsByStripeSessionId(String stripeSessionId);
}
