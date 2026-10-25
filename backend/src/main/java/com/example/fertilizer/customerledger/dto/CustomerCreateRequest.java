package com.example.fertilizer.customerledger.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CustomerCreateRequest(
        @NotBlank @Size(max = 200) String customerName,
        @Size(max = 30) String phone,
        @Email @Size(max = 200) String email,
        @Size(max = 2000) String address,
        @Pattern(regexp = "^$|[A-Za-z0-9]{15}", message = "GSTIN must contain 15 letters or digits")
        String gstin,
        @Pattern(regexp = "^$|\\d{2}", message = "State code must contain two digits")
        String stateCode) {}
