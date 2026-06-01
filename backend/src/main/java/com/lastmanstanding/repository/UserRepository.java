package com.lastmanstanding.repository;

import com.lastmanstanding.entity.User;
import com.lastmanstanding.entity.Role;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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

    boolean existsByUsernameIgnoreCase(String username);

    List<User> findAllByOrderByUsernameAsc();

    Page<User> findAllByOrderByUsernameAsc(Pageable pageable);

    Page<User> findByRoleOrderByUsernameAsc(Role role, Pageable pageable);

    List<User> findByUsernameLike(String pattern);

    Optional<User> findByOauthProviderAndOauthProviderId(String provider, String providerId);

    /** DB-level search — avoids loading all users into memory */
    @Query("SELECT u FROM User u WHERE LOWER(u.username) LIKE LOWER(CONCAT('%',:q,'%')) OR LOWER(u.email) LIKE LOWER(CONCAT('%',:q,'%')) ORDER BY u.username ASC")
    List<User> searchByUsernameOrEmail(@Param("q") String q);

    @Query("""
            SELECT u FROM User u
            WHERE LOWER(u.username) LIKE LOWER(CONCAT('%', :q, '%'))
               OR LOWER(u.email) LIKE LOWER(CONCAT('%', :q, '%'))
            ORDER BY u.username ASC
            """)
    Page<User> searchAdminUsers(@Param("q") String q, Pageable pageable);

    @Query("""
            SELECT u FROM User u
            WHERE u.role = :role
              AND (LOWER(u.username) LIKE LOWER(CONCAT('%', :q, '%'))
                   OR LOWER(u.email) LIKE LOWER(CONCAT('%', :q, '%')))
            ORDER BY u.username ASC
            """)
    Page<User> searchAdminUsersByRole(@Param("q") String q, @Param("role") Role role, Pageable pageable);
}
