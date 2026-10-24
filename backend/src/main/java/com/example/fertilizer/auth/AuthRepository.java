package com.example.fertilizer.auth;

import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AuthRepository {
    private final JdbcTemplate jdbc;

    public AuthRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<AuthenticatedUser> findActiveUser(String username) {
        List<AuthenticatedUser> users = jdbc.query("""
                SELECT u.id, u.username, u.password_hash, u.full_name, u.dealer_id,
                       d.display_name AS dealer_name, d.state_code,
                       COALESCE((SELECT r.role_code
                                 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                                 WHERE ur.user_id = u.id
                                 ORDER BY CASE WHEN r.role_code = 'ADMIN' THEN 0 ELSE 1 END, r.id
                                 LIMIT 1), 'USER') AS role
                FROM app_users u
                JOIN dealers d ON d.id = u.dealer_id AND d.active = TRUE
                WHERE u.username = ? AND u.active = TRUE
                """, (rs, row) -> new AuthenticatedUser(
                rs.getLong("id"), rs.getString("username"), rs.getString("password_hash"), rs.getString("full_name"),
                rs.getString("role"), rs.getLong("dealer_id"), rs.getString("dealer_name"),
                rs.getString("state_code")), username);
        return users.stream().findFirst();
    }

    public boolean isActiveAdmin(long userId) {
        return findActiveSessionUser(userId).map(user -> "ADMIN".equals(user.role())).orElse(false);
    }

    public Optional<SessionUser> findActiveSessionUser(long userId) {
        List<SessionUser> users = jdbc.query("""
                SELECT u.id, u.dealer_id,
                       COALESCE((SELECT r.role_code
                                 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                                 WHERE ur.user_id = u.id
                                 ORDER BY CASE WHEN r.role_code = 'ADMIN' THEN 0 ELSE 1 END, r.id
                                 LIMIT 1), 'USER') AS role
                FROM app_users u
                JOIN dealers d ON d.id = u.dealer_id AND d.active = TRUE
                WHERE u.id = ? AND u.active = TRUE
                """, (rs, row) -> new SessionUser(rs.getLong("id"), rs.getLong("dealer_id"),
                rs.getString("role")), userId);
        return users.stream().findFirst();
    }

    public record AuthenticatedUser(Long id, String username, String passwordHash, String fullName,
                                    String role, Long dealerId, String dealerName, String stateCode) {}
    public record SessionUser(Long id, Long dealerId, String role) {}
}
