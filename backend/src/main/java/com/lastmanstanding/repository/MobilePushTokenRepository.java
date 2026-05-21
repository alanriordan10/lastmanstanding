package com.lastmanstanding.repository;

import com.lastmanstanding.entity.MobilePushToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MobilePushTokenRepository extends JpaRepository<MobilePushToken, Long> {
    Optional<MobilePushToken> findByToken(String token);
    List<MobilePushToken> findByUserId(Long userId);
    void deleteByUserIdAndToken(Long userId, String token);
    void deleteByUserId(Long userId);
    void deleteByToken(String token);
}
