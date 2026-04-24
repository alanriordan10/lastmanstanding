package com.lastmanstanding.repository;

import com.lastmanstanding.entity.User;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    Optional<User> findByUsername(String username);

    boolean existsByEmail(String email);

    boolean existsByUsername(String username);

    List<User> findAllByOrderByUsernameAsc();

    List<User> findByUsernameLike(String pattern);

    Optional<User> findByOauthProviderAndOauthProviderId(String provider, String providerId);

    /** DB-level search — avoids loading all users into memory */
    @Query("SELECT u FROM User u WHERE LOWER(u.username) LIKE LOWER(CONCAT('%',:q,'%')) OR LOWER(u.email) LIKE LOWER(CONCAT('%',:q,'%')) ORDER BY u.username ASC")
    List<User> searchByUsernameOrEmail(@Param("q") String q);
}
