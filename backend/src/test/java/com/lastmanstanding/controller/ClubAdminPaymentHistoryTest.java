package com.lastmanstanding.controller;

import com.lastmanstanding.entity.AuditLog;
import com.lastmanstanding.entity.Club;
import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionParticipant;
import com.lastmanstanding.entity.ParticipantStatus;
import com.lastmanstanding.entity.Payment;
import com.lastmanstanding.entity.Role;
import com.lastmanstanding.entity.User;
import com.lastmanstanding.repository.AuditLogRepository;
import com.lastmanstanding.repository.ClubRepository;
import com.lastmanstanding.repository.CompetitionParticipantRepository;
import com.lastmanstanding.repository.CompetitionRepository;
import com.lastmanstanding.repository.PaymentRepository;
import com.lastmanstanding.repository.UserRepository;
import com.lastmanstanding.security.UserDetailsImpl;
import com.lastmanstanding.service.CompetitionService;
import com.lastmanstanding.service.FixtureSyncService;
import com.lastmanstanding.service.GameweekEmailService;
import com.lastmanstanding.service.PaymentService;
import com.lastmanstanding.service.WebPushService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ClubAdminPaymentHistoryTest {

    @Mock private ClubRepository clubRepository;
    @Mock private CompetitionRepository competitionRepository;
    @Mock private CompetitionParticipantRepository participantRepository;
    @Mock private CompetitionService competitionService;
    @Mock private FixtureSyncService fixtureSyncService;
    @Mock private UserRepository userRepository;
    @Mock private org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;
    @Mock private PaymentRepository paymentRepository;
    @Mock private PaymentService paymentService;
    @Mock private AuditLogRepository auditLogRepository;
    @Mock private WebPushService webPushService;
    @Mock private GameweekEmailService gameweekEmailService;

    private ClubAdminController controller;

    @BeforeEach
    void setUp() {
        controller = new ClubAdminController(
                clubRepository,
                competitionRepository,
                participantRepository,
                competitionService,
                fixtureSyncService,
                userRepository,
                passwordEncoder,
                paymentRepository,
                paymentService,
                auditLogRepository,
                webPushService,
                gameweekEmailService
        );
    }

    @Test
    void paymentHistory_returnsLogsForParticipantPaymentsOnly() {
        long adminId = 1L;
        long clubId = 10L;
        long compId = 100L;
        long participantId = 1000L;

        User admin = new User("admin@example.com", "admin", "x", Role.CLUB_ADMIN);
        admin.setId(adminId);
        User player = new User("player@example.com", "player", "x", Role.USER);
        player.setId(2L);

        Club club = new Club();
        club.setId(clubId);
        club.setClubAdmin(admin);

        Competition comp = new Competition();
        comp.setId(compId);
        comp.setClub(club);

        CompetitionParticipant cp = new CompetitionParticipant(comp, player, ParticipantStatus.ACTIVE);
        cp.setId(participantId);

        Payment payment = new Payment(player, comp, "pi_1", 2000, "eur");
        ReflectionTestUtils.setField(payment, "id", 501L);

        AuditLog log = new AuditLog(admin, "Payment", 501L, "status", "PENDING", "SUCCEEDED", "MARK_PAID");
        ReflectionTestUtils.setField(log, "id", 9001L);

        when(clubRepository.findByClubAdminId(adminId)).thenReturn(List.of(club));
        when(competitionRepository.findById(compId)).thenReturn(Optional.of(comp));
        when(participantRepository.findByIdAndCompetitionId(participantId, compId)).thenReturn(Optional.of(cp));
        when(paymentRepository.findByCompetitionIdAndParticipantIdOrderByCreatedAtDesc(compId, participantId)).thenReturn(List.of(payment));
        when(auditLogRepository.findByEntityTypeAndEntityIdInOrderByCreatedAtDesc("Payment", List.of(501L))).thenReturn(List.of(log));

        ResponseEntity<List<com.lastmanstanding.dto.CompetitionDtos.AuditLogResponse>> response =
                controller.getParticipantPaymentHistory(compId, participantId, new UserDetailsImpl(admin));

        assertEquals(1, response.getBody().size());
        assertEquals("MARK_PAID", response.getBody().get(0).action());
        verify(auditLogRepository).findByEntityTypeAndEntityIdInOrderByCreatedAtDesc("Payment", List.of(501L));
    }

    @Test
    void paymentHistory_returnsEmpty_whenNoPaymentsForEntry() {
        long adminId = 1L;
        long clubId = 10L;
        long compId = 100L;
        long participantId = 1000L;

        User admin = new User("admin@example.com", "admin", "x", Role.CLUB_ADMIN);
        admin.setId(adminId);
        User player = new User("player@example.com", "player", "x", Role.USER);

        Club club = new Club();
        club.setId(clubId);
        club.setClubAdmin(admin);

        Competition comp = new Competition();
        comp.setId(compId);
        comp.setClub(club);

        CompetitionParticipant cp = new CompetitionParticipant(comp, player, ParticipantStatus.ACTIVE);
        cp.setId(participantId);

        when(clubRepository.findByClubAdminId(adminId)).thenReturn(List.of(club));
        when(competitionRepository.findById(compId)).thenReturn(Optional.of(comp));
        when(participantRepository.findByIdAndCompetitionId(participantId, compId)).thenReturn(Optional.of(cp));
        when(paymentRepository.findByCompetitionIdAndParticipantIdOrderByCreatedAtDesc(compId, participantId)).thenReturn(List.of());

        ResponseEntity<List<com.lastmanstanding.dto.CompetitionDtos.AuditLogResponse>> response =
                controller.getParticipantPaymentHistory(compId, participantId, new UserDetailsImpl(admin));

        assertEquals(0, response.getBody().size());
        verify(auditLogRepository, never()).findByEntityTypeAndEntityIdInOrderByCreatedAtDesc(any(), any());
    }

    @Test
    void paymentHistory_rejectsWhenParticipantNotFound() {
        long adminId = 1L;
        long clubId = 10L;
        long compId = 100L;
        long participantId = 1000L;

        User admin = new User("admin@example.com", "admin", "x", Role.CLUB_ADMIN);
        admin.setId(adminId);

        Club club = new Club();
        club.setId(clubId);
        club.setClubAdmin(admin);

        Competition comp = new Competition();
        comp.setId(compId);
        comp.setClub(club);

        when(clubRepository.findByClubAdminId(adminId)).thenReturn(List.of(club));
        when(competitionRepository.findById(compId)).thenReturn(Optional.of(comp));
        when(participantRepository.findByIdAndCompetitionId(participantId, compId)).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.getParticipantPaymentHistory(compId, participantId, new UserDetailsImpl(admin)));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }
}
