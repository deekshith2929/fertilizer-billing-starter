package com.example.fertilizer.auth;

import com.example.fertilizer.auth.AuthRepository.SessionUser;
import jakarta.servlet.http.HttpSession;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthorizationService {
    private final AuthRepository authRepository;

    public AuthorizationService(AuthRepository authRepository) {
        this.authRepository = authRepository;
    }

    public SessionUser requireUser(HttpSession session) {
        Object sessionUserId = session.getAttribute("userId");
        if (!(sessionUserId instanceof Long userId))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please log in to continue.");
        return authRepository.findActiveSessionUser(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "Please log in to continue."));
    }

    public SessionUser requirePermission(HttpSession session, String permissionCode) {
        SessionUser user = requireUser(session);
        if (!user.hasPermission(permissionCode))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "The " + permissionCode + " permission is required.");
        return user;
    }

    public long resolveDealerId(SessionUser user, Long requestedDealerId) {
        if (user.hasPermission("DEALER_MANAGE")) {
            long dealerId = requestedDealerId == null
                    ? Objects.requireNonNullElse(user.dealerId(), 0L) : requestedDealerId;
            if (dealerId <= 0 || !authRepository.dealerExists(dealerId))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select an active dealer.");
            return dealerId;
        }
        if (user.dealerId() == null)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This account is not assigned to a dealer.");
        if (requestedDealerId != null && !requestedDealerId.equals(user.dealerId()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only access your own dealer.");
        return user.dealerId();
    }
}
