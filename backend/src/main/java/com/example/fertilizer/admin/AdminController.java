package com.example.fertilizer.admin;

import com.example.fertilizer.auth.AuthorizationService;
import com.example.fertilizer.auth.AuthRepository.SessionUser;
import com.example.fertilizer.auth.PasswordHasher;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin")
@CrossOrigin(origins = "${FRONTEND_ORIGIN:http://localhost:5173}", allowCredentials = "true")
public class AdminController {
    private static final Logger log = LoggerFactory.getLogger(AdminController.class);
    private final AdminRepository repository;
    private final AuthorizationService authorizationService;
    private final PasswordHasher passwordHasher;

    public AdminController(AdminRepository repository, AuthorizationService authorizationService,
                           PasswordHasher passwordHasher) {
        this.repository = repository;
        this.authorizationService = authorizationService;
        this.passwordHasher = passwordHasher;
    }

    @GetMapping("/dealers")
    public List<AdminRepository.DealerSummary> getDealers(HttpSession session) {
        authorizationService.requirePermission(session, "DEALER_MANAGE");
        return repository.findActiveDealers();
    }

    @PostMapping("/dealers")
    @Transactional
    public ResponseEntity<AdminRepository.DealerSummary> createDealer(
            @Valid @RequestBody CreateDealerRequest request, HttpSession session) {
        authorizationService.requirePermission(session, "DEALER_MANAGE");
        long id = repository.createDealer(request);
        AdminRepository.DealerSummary created = repository.findActiveDealers().stream()
                .filter(dealer -> dealer.id() == id)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Created dealer was not returned."));
        log.info("Admin created dealer id={} code={}", id, created.dealerCode());
        return ResponseEntity.created(URI.create("/api/admin/dealers/" + id)).body(created);
    }

    @GetMapping("/users")
    public List<AdminRepository.UserSummary> getUsers(HttpSession session) {
        SessionUser user = authorizationService.requirePermission(session, "USER_MANAGE");
        return user.hasPermission("DEALER_MANAGE")
                ? repository.findUsers()
                : repository.findUsersForDealer(authorizationService.resolveDealerId(user, null));
    }

    @GetMapping("/roles")
    public List<AdminRepository.RoleSummary> getRoles(HttpSession session) {
        SessionUser user = authorizationService.requirePermission(session, "USER_MANAGE");
        return repository.findRoles(!user.hasPermission("DEALER_MANAGE"));
    }

    @PostMapping("/users")
    @Transactional
    public ResponseEntity<AdminRepository.UserSummary> createUser(
            @Valid @RequestBody CreateUserRequest request, HttpSession session) {
        SessionUser user = authorizationService.requirePermission(session, "USER_MANAGE");
        if (!user.hasPermission("DEALER_MANAGE") && !"EMPLOYEE".equals(request.roleCode()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Dealer user managers can create employee accounts only.");
        if (!repository.roleExists(request.roleCode()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select a valid role.");
        Long dealerId = "ADMIN".equals(request.roleCode())
                ? null : authorizationService.resolveDealerId(user, request.dealerId());
        CreateUserRequest scopedRequest = new CreateUserRequest(request.username(), request.password(),
                request.fullName(), request.roleCode(), dealerId);
        long userId = repository.createUser(scopedRequest, passwordHasher.hash(request.password()));
        AdminRepository.UserSummary created = repository.findUser(userId);
        log.info("User manager userId={} created userId={} username={}", user.id(), userId, created.username());
        return ResponseEntity.created(URI.create("/api/admin/users/" + userId)).body(created);
    }

    @PutMapping("/users/{userId}")
    @Transactional
    public AdminRepository.UserSummary updateUser(@PathVariable long userId,
                                                   @Valid @RequestBody UpdateUserRequest request,
                                                   HttpSession session) {
        SessionUser editor = authorizationService.requirePermission(session, "USER_MANAGE");
        if (!editor.hasPermission("DEALER_MANAGE") && !"EMPLOYEE".equals(request.roleCode()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Dealer user managers can assign employee role only.");
        if (editor.id() == userId || !canManageTargetUser(editor, userId))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Managed user was not found.");
        if (!repository.roleExists(request.roleCode()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select a valid role.");
        if (!repository.updateUser(userId, request.fullName(), request.roleCode()))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active user was not found.");
        return repository.findUser(userId);
    }

    @PutMapping("/users/{userId}/password")
    public ResponseEntity<Void> updatePassword(@PathVariable long userId,
                                               @Valid @RequestBody UpdatePasswordRequest request,
                                               HttpSession session) {
        SessionUser editor = authorizationService.requirePermission(session, "USER_MANAGE");
        if (!canManageTargetUser(editor, userId))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Managed user was not found.");
        if (!repository.updatePassword(userId, passwordHasher.hash(request.password())))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active user was not found.");
        log.info("User manager userId={} updated password for userId={}", editor.id(), userId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/users/{userId}")
    public ResponseEntity<Void> deleteUser(@PathVariable long userId, HttpSession session) {
        SessionUser editor = authorizationService.requirePermission(session, "USER_MANAGE");
        if (editor.id() == userId)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot deactivate your own account.");
        if (!canManageTargetUser(editor, userId))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Managed user was not found.");
        if (!repository.deactivateUser(userId))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active user was not found.");
        log.info("User manager userId={} deactivated userId={}", editor.id(), userId);
        return ResponseEntity.noContent().build();
    }

    private boolean canManageTargetUser(SessionUser editor, long userId) {
        if (editor.hasPermission("DEALER_MANAGE")) return true;
        long dealerId = authorizationService.resolveDealerId(editor, null);
        return repository.userBelongsToDealer(userId, dealerId) && repository.userIsEmployee(userId);
    }

    public record CreateDealerRequest(
            @NotBlank @Size(max = 40) String dealerCode,
            @NotBlank @Size(max = 200) String legalName,
            @NotBlank @Size(max = 200) String displayName,
            @NotBlank @Size(max = 200) String addressLine1,
            @Size(max = 200) String addressLine2,
            @NotBlank @Size(max = 100) String city,
            @NotBlank @Size(max = 100) String stateName,
            @NotBlank @Pattern(regexp = "\\d{2}", message = "State code must be two digits") String stateCode,
            @Size(max = 10) String pincode,
            @Size(max = 15) String gstin,
            @Size(max = 20) String phone,
            @Size(max = 100) String aglNo,
            @Size(max = 100) String plNo) {}

    public record CreateUserRequest(
            @NotBlank @Size(max = 80) String username,
            @NotBlank @Size(min = 8, max = 256) String password,
            @NotBlank @Size(max = 200) String fullName,
            @NotBlank @Size(max = 40) String roleCode,
            Long dealerId) {}

    public record UpdateUserRequest(
            @NotBlank @Size(max = 200) String fullName,
            @NotBlank @Size(max = 40) String roleCode) {}

    public record UpdatePasswordRequest(@NotBlank @Size(min = 8, max = 256) String password) {}
}
