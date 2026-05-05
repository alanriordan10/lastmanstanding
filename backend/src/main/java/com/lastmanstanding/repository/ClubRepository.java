package com.lastmanstanding.repository;

import com.lastmanstanding.entity.Club;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ClubRepository extends JpaRepository<Club, Long> {

    List<Club> findAllByOrderByNameAsc();

    boolean existsByName(String name);

    List<Club> findByClubAdminId(Long userId);

    Optional<Club> findByIdAndClubAdminId(Long id, Long userId);

    Optional<Club> findByStripeAccountId(String stripeAccountId);
}
