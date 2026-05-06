package com.lastmanstanding.controller;

import com.lastmanstanding.entity.User;
import com.lastmanstanding.repository.UserRepository;
import com.lastmanstanding.security.UserDetailsImpl;
import com.lastmanstanding.service.SupportService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/support")
public class SupportController {

    private final UserRepository userRepository;
    private final SupportService supportService;

    public SupportController(UserRepository userRepository, SupportService supportService) {
        this.userRepository = userRepository;
        this.supportService = supportService;
    }

    public record CreateTicketResponse(String status) {}

    @PostMapping("/tickets")
    public ResponseEntity<CreateTicketResponse> createTicket(
            @RequestParam("issueType") String issueType,
            @RequestParam("subject") String subject,
            @RequestParam("message") String message,
            @RequestParam(value = "competitionName", required = false) String competitionName,
            @RequestParam(value = "pageUrl", required = false) String pageUrl,
            @RequestParam(value = "screenshot", required = false) MultipartFile screenshot,
            @AuthenticationPrincipal UserDetailsImpl principal
    ) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
        }
        if (issueType == null || issueType.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "issueType is required");
        }
        if (subject == null || subject.isBlank() || subject.length() > 180) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "subject is required and must be <= 180 chars");
        }
        if (message == null || message.isBlank() || message.length() > 5000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "message is required and must be <= 5000 chars");
        }
        if (screenshot != null && !screenshot.isEmpty()) {
            String contentType = screenshot.getContentType() != null ? screenshot.getContentType() : "";
            if (!contentType.startsWith("image/")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "screenshot must be an image file");
            }
            if (screenshot.getSize() > 5 * 1024 * 1024) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "screenshot must be <= 5MB");
            }
        }

        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));

        supportService.sendSupportTicket(
                user,
                issueType,
                subject,
                message,
                competitionName,
                pageUrl,
                screenshot
        );

        return ResponseEntity.ok(new CreateTicketResponse("submitted"));
    }
}
