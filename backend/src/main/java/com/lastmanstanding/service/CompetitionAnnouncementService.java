package com.lastmanstanding.service;

import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionAnnouncement;
import com.lastmanstanding.entity.CompetitionAnnouncementRead;
import com.lastmanstanding.entity.CompetitionAnnouncementReadId;
import com.lastmanstanding.entity.CompetitionParticipant;
import com.lastmanstanding.entity.User;
import com.lastmanstanding.repository.CompetitionAnnouncementReadRepository;
import com.lastmanstanding.repository.CompetitionAnnouncementRepository;
import com.lastmanstanding.repository.CompetitionParticipantRepository;
import com.lastmanstanding.repository.CompetitionRepository;
import com.lastmanstanding.repository.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class CompetitionAnnouncementService {

    private final CompetitionAnnouncementRepository announcementRepository;
    private final CompetitionAnnouncementReadRepository readRepository;
    private final CompetitionParticipantRepository participantRepository;
    private final CompetitionRepository competitionRepository;
    private final UserRepository userRepository;
    private final WebPushService webPushService;

    public CompetitionAnnouncementService(CompetitionAnnouncementRepository announcementRepository,
                                          CompetitionAnnouncementReadRepository readRepository,
                                          CompetitionParticipantRepository participantRepository,
                                          CompetitionRepository competitionRepository,
                                          UserRepository userRepository,
                                          WebPushService webPushService) {
        this.announcementRepository = announcementRepository;
        this.readRepository = readRepository;
        this.participantRepository = participantRepository;
        this.competitionRepository = competitionRepository;
        this.userRepository = userRepository;
        this.webPushService = webPushService;
    }

    @Transactional
    public AnnouncementResponse create(Long competitionId, Long actorId, String title, String message) {
        Competition competition = competitionRepository.findById(competitionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));
        User actor = userRepository.findById(actorId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        String cleanTitle = requireText(title, "Announcement title", 120);
        String cleanMessage = requireText(message, "Announcement message", 2000);

        CompetitionAnnouncement announcement = announcementRepository.save(
                new CompetitionAnnouncement(competition, actor, cleanTitle, cleanMessage));

        Map<Long, User> recipients = new LinkedHashMap<>();
        for (CompetitionParticipant participant : participantRepository.findByCompetitionId(competitionId)) {
            User user = participant.getUser();
            if (user != null) recipients.putIfAbsent(user.getId(), user);
        }
        webPushService.sendCompetitionAnnouncement(competition, announcement, List.copyOf(recipients.values()));
        return AnnouncementResponse.from(announcement, false);
    }

    @Transactional(readOnly = true)
    public List<AnnouncementResponse> getForUser(Long userId) {
        Set<Long> readIds = readRepository.findReadAnnouncementIds(userId);
        return announcementRepository.findVisibleToUser(userId, PageRequest.of(0, 50)).stream()
                .map(announcement -> AnnouncementResponse.from(announcement, readIds.contains(announcement.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<AnnouncementResponse> getForCompetition(Long competitionId) {
        return announcementRepository.findByCompetitionIdOrderByCreatedAtDesc(competitionId, PageRequest.of(0, 20)).stream()
                .map(announcement -> AnnouncementResponse.from(announcement, false))
                .toList();
    }

    @Transactional
    public void markRead(Long announcementId, Long userId) {
        CompetitionAnnouncement announcement = announcementRepository.findById(announcementId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Announcement not found"));
        boolean isRecipient = participantRepository.existsByCompetitionIdAndUserId(
                announcement.getCompetition().getId(), userId);
        boolean isSender = announcement.getCreatedBy() != null
                && announcement.getCreatedBy().getId().equals(userId);
        if (!isRecipient && !isSender) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Announcement is not available to this user");
        }
        CompetitionAnnouncementReadId id = new CompetitionAnnouncementReadId(announcementId, userId);
        if (readRepository.existsById(id)) return;
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        readRepository.save(new CompetitionAnnouncementRead(announcement, user));
    }

    private String requireText(String value, String label, int maxLength) {
        String clean = value == null ? "" : value.trim();
        if (clean.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + " is required");
        if (clean.length() > maxLength) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + " must be " + maxLength + " characters or fewer");
        }
        return clean;
    }

    public record AnnouncementResponse(
            Long id,
            Long competitionId,
            String competitionName,
            String clubName,
            String title,
            String message,
            String createdByUsername,
            LocalDateTime createdAt,
            boolean read
    ) {
        static AnnouncementResponse from(CompetitionAnnouncement announcement, boolean read) {
            Competition competition = announcement.getCompetition();
            return new AnnouncementResponse(
                    announcement.getId(),
                    competition.getId(),
                    competition.getName(),
                    competition.getClub() != null ? competition.getClub().getName() : null,
                    announcement.getTitle(),
                    announcement.getMessage(),
                    announcement.getCreatedBy() != null ? announcement.getCreatedBy().getUsername() : "Club admin",
                    announcement.getCreatedAt(),
                    read
            );
        }
    }
}
