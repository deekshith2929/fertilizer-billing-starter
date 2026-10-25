package com.example.fertilizer.admin;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AdminRepository {
    private final JdbcTemplate jdbc;

    public AdminRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<DealerSummary> findActiveDealers() {
        return jdbc.query("""
                SELECT id, dealer_code, display_name, state_name, state_code, agl_no, pl_no
                FROM dealers
                WHERE active = TRUE
                ORDER BY display_name
                """, (rs, row) -> new DealerSummary(rs.getLong("id"), rs.getString("dealer_code"),
                rs.getString("display_name"), rs.getString("state_name"), rs.getString("state_code"),
                rs.getString("agl_no"), rs.getString("pl_no")));
    }

    public List<UserSummary> findUsers() {
        return findUsers(null);
    }

    public List<UserSummary> findUsersForDealer(long dealerId) {
        return findUsers(dealerId);
    }

    private List<UserSummary> findUsers(Long dealerId) {
        return jdbc.query("""
                SELECT u.id, u.username, u.full_name, u.active, u.dealer_id,
                       d.display_name AS dealer_name,
                       COALESCE((SELECT string_agg(r.role_code, ', ' ORDER BY r.role_code)
                                 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                                 WHERE ur.user_id = u.id), 'USER') AS role
                FROM app_users u
                LEFT JOIN dealers d ON d.id = u.dealer_id
                WHERE (?::BIGINT IS NULL OR u.dealer_id = ?)
                ORDER BY u.active DESC, u.username
                """, (rs, row) -> new UserSummary(rs.getLong("id"), rs.getString("username"),
                rs.getString("full_name"), rs.getString("role"), rs.getObject("dealer_id", Long.class),
                rs.getString("dealer_name"), rs.getBoolean("active")), dealerId, dealerId);
    }

    public UserSummary findUser(long userId) {
        return jdbc.queryForObject("""
                SELECT u.id, u.username, u.full_name, u.active, u.dealer_id,
                       d.display_name AS dealer_name,
                       COALESCE((SELECT string_agg(r.role_code, ', ' ORDER BY r.role_code)
                                 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                                 WHERE ur.user_id = u.id), 'USER') AS role
                FROM app_users u
                LEFT JOIN dealers d ON d.id = u.dealer_id
                WHERE u.id = ?
                """, (rs, row) -> new UserSummary(rs.getLong("id"), rs.getString("username"),
                rs.getString("full_name"), rs.getString("role"), rs.getObject("dealer_id", Long.class),
                rs.getString("dealer_name"), rs.getBoolean("active")), userId);
    }

    public long createDealer(AdminController.CreateDealerRequest request) {
        Long id = jdbc.queryForObject("""
                INSERT INTO dealers
                    (dealer_code, legal_name, display_name, address_line1, address_line2,
                     city, state_name, state_code, pincode, gstin, phone, agl_no, pl_no)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, Long.class, request.dealerCode().trim(), request.legalName().trim(),
                request.displayName().trim(), request.addressLine1().trim(), blankToNull(request.addressLine2()),
                request.city().trim(), request.stateName().trim(), request.stateCode().trim(),
                blankToNull(request.pincode()), blankToNull(request.gstin()), blankToNull(request.phone()),
                blankToNull(request.aglNo()), blankToNull(request.plNo()));
        return id;
    }

    public boolean dealerExists(long dealerId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM dealers WHERE id = ? AND active = TRUE)",
                Boolean.class, dealerId));
    }

    public boolean roleExists(String roleCode) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM roles WHERE role_code = ?)",
                Boolean.class, roleCode));
    }

    public List<RoleSummary> findRoles(boolean dealerScoped) {
        return jdbc.query("""
                SELECT role_code, display_name
                FROM roles
                WHERE (? = FALSE OR role_code = 'EMPLOYEE')
                ORDER BY display_name
                """, (rs, row) -> new RoleSummary(
                rs.getString("role_code"), rs.getString("display_name")), dealerScoped);
    }

    public long createUser(AdminController.CreateUserRequest request, String passwordHash) {
        Long userId = jdbc.queryForObject("""
                INSERT INTO app_users (username, password_hash, full_name, dealer_id)
                VALUES (?, ?, ?, ?)
                RETURNING id
                """, Long.class, request.username().trim(), passwordHash,
                request.fullName().trim(), request.dealerId());
        jdbc.update("""
                INSERT INTO user_roles (user_id, role_id)
                SELECT ?, id FROM roles WHERE role_code = ?
                """, userId, request.roleCode());
        return userId;
    }

    public boolean updatePassword(long userId, String passwordHash) {
        return jdbc.update("""
                UPDATE app_users
                SET password_hash = ?
                WHERE id = ? AND active = TRUE
                """, passwordHash, userId) == 1;
    }

    public boolean userBelongsToDealer(long userId, long dealerId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM app_users
                    WHERE id = ? AND dealer_id = ? AND active = TRUE
                )
                """, Boolean.class, userId, dealerId));
    }

    public boolean userIsEmployee(long userId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM user_roles ur
                    JOIN roles r ON r.id = ur.role_id
                    WHERE ur.user_id = ? AND r.role_code = 'EMPLOYEE'
                )
                AND NOT EXISTS (
                    SELECT 1
                    FROM user_roles ur
                    JOIN roles r ON r.id = ur.role_id
                    WHERE ur.user_id = ? AND r.role_code <> 'EMPLOYEE'
                )
                """, Boolean.class, userId, userId));
    }

    public boolean updateUser(long userId, String fullName, String roleCode) {
        if (jdbc.update("""
                UPDATE app_users SET full_name = ?
                WHERE id = ? AND active = TRUE
                """, fullName.trim(), userId) != 1) return false;
        jdbc.update("DELETE FROM user_roles WHERE user_id = ?", userId);
        jdbc.update("""
                INSERT INTO user_roles (user_id, role_id)
                SELECT ?, id FROM roles WHERE role_code = ?
                """, userId, roleCode);
        return true;
    }

    public boolean deactivateUser(long userId) {
        return jdbc.update("""
                UPDATE app_users
                SET active = FALSE
                WHERE id = ? AND active = TRUE
                """, userId) == 1;
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public record DealerSummary(Long id, String dealerCode, String displayName,
                                String stateName, String stateCode, String aglNo, String plNo) {}
    public record RoleSummary(String roleCode, String displayName) {}
    public record UserSummary(Long id, String username, String fullName, String role,
                              Long dealerId, String dealerName, boolean active) {}
}
