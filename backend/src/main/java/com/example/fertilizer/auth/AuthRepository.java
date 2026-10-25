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
                       d.display_name AS dealer_name, d.state_code, d.agl_no, d.pl_no,
                       COALESCE((SELECT r.role_code
                                 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                                 WHERE ur.user_id = u.id
                                 ORDER BY CASE WHEN r.role_code = 'ADMIN' THEN 0 ELSE 1 END, r.id
                                 LIMIT 1), 'USER') AS role
                FROM app_users u
                LEFT JOIN dealers d ON d.id = u.dealer_id
                WHERE u.username = ? AND u.active = TRUE
                  AND (d.active = TRUE OR (u.dealer_id IS NULL AND EXISTS (
                      SELECT 1
                      FROM user_roles ur
                      JOIN role_permissions rp ON rp.role_id = ur.role_id
                      JOIN permissions p ON p.id = rp.permission_id
                      WHERE ur.user_id = u.id AND p.permission_code = 'DEALER_MANAGE'
                  )))
                """, (rs, row) -> new AuthenticatedUser(
                rs.getLong("id"), rs.getString("username"), rs.getString("password_hash"), rs.getString("full_name"),
                rs.getString("role"), rs.getObject("dealer_id", Long.class), rs.getString("dealer_name"),
                rs.getString("state_code"), rs.getString("agl_no"), rs.getString("pl_no"), List.of()), username);
        return users.stream().findFirst().map(user -> new AuthenticatedUser(
                user.id(), user.username(), user.passwordHash(), user.fullName(), user.role(),
                user.dealerId(), user.dealerName(), user.stateCode(), user.aglNo(), user.plNo(),
                findPermissionsForUser(user.id())));
    }

    public boolean dealerExists(long dealerId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM dealers WHERE id = ? AND active = TRUE)
                """, Boolean.class, dealerId));
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
                LEFT JOIN dealers d ON d.id = u.dealer_id
                WHERE u.id = ? AND u.active = TRUE
                  AND (d.active = TRUE OR (u.dealer_id IS NULL AND EXISTS (
                      SELECT 1
                      FROM user_roles ur
                      JOIN role_permissions rp ON rp.role_id = ur.role_id
                      JOIN permissions p ON p.id = rp.permission_id
                      WHERE ur.user_id = u.id AND p.permission_code = 'DEALER_MANAGE'
                  )))
                """, (rs, row) -> new SessionUser(rs.getLong("id"), rs.getObject("dealer_id", Long.class),
                rs.getString("role"), List.of()), userId);
        return users.stream().findFirst().map(user -> new SessionUser(
                user.id(), user.dealerId(), user.role(), findPermissionsForUser(user.id())));
    }

    private List<String> findPermissionsForUser(long userId) {
        return jdbc.queryForList("""
                SELECT DISTINCT p.permission_code
                FROM user_roles ur
                JOIN role_permissions rp ON rp.role_id = ur.role_id
                JOIN permissions p ON p.id = rp.permission_id
                WHERE ur.user_id = ?
                ORDER BY p.permission_code
                """, String.class, userId);
    }

    public record AuthenticatedUser(Long id, String username, String passwordHash, String fullName,
                                    String role, Long dealerId, String dealerName, String stateCode,
                                    String aglNo, String plNo, List<String> permissions) {}
    public record SessionUser(Long id, Long dealerId, String role, List<String> permissions) {
        public boolean hasPermission(String permissionCode) {
            return permissions.contains(permissionCode);
        }
    }
}
