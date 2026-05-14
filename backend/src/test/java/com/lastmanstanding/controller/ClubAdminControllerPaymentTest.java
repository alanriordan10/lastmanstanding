package com.lastmanstanding.controller;

import com.lastmanstanding.entity.Club;
import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionParticipant;
import com.lastmanstanding.entity.ManualPaymentPolicy;
import com.lastmanstanding.entity.ParticipantStatus;
import com.lastmanstanding.entity.AuditLog;
import com.lastmanstanding.entity.Payment;
import com.lastmanstanding.entity.PaymentMode;
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
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.atLeastOnce;

@ExtendWith(MockitoExtension.class)
class ClubAdminControllerPaymentTest {

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
    void markPaid_targetsSpecificParticipantEntry_notAllUserEntries() {
        long clubId = 10L;
        long compId = 20L;
        long adminId = 30L;
        long userId = 40L;
        long participantId = 101L;

        User admin = new User("admin@example.com", "clubadmin", "x", Role.CLUB_ADMIN);
        admin.setId(adminId);
        User participantUser = new User("u@example.com", "player", "x", Role.USER);
        participantUser.setId(userId);

        Club club = new Club();
        club.setId(clubId);
        club.setClubAdmin(admin);

        Competition competition = new Competition();
        competition.setId(compId);
        competition.setClub(club);
        competition.setName("Comp");
        competition.setPaymentMode(PaymentMode.MANUAL);
        competition.setManualPaymentPolicy(ManualPaymentPolicy.STRICT);
        competition.setEntryFee(BigDecimal.valueOf(20));

        CompetitionParticipant participant = new CompetitionParticipant(competition, participantUser, ParticipantStatus.ACTIVE);
        participant.setId(participantId);

        UserDetailsImpl principal = new UserDetailsImpl(admin);

        when(clubRepository.findByClubAdminId(adminId)).thenReturn(List.of(club));
        when(competitionRepository.findById(compId)).thenReturn(Optional.of(competition));
        when(participantRepository.findByIdAndCompetitionId(participantId, compId)).thenReturn(Optional.of(participant));
        when(paymentRepository.existsByParticipantIdAndCompetitionIdAndStatus(participantId, compId, Payment.PaymentStatus.SUCCEEDED)).thenReturn(false);
        when(userRepository.findById(adminId)).thenReturn(Optional.of(admin));

        controller.markManualPayment(compId, participantId, principal);

        verify(paymentRepository).existsByParticipantIdAndCompetitionIdAndStatus(participantId, compId, Payment.PaymentStatus.SUCCEEDED);
        verify(paymentRepository, never()).existsByUserIdAndCompetitionIdAndStatus(any(), any(), any());

        ArgumentCaptor<Payment> paymentCaptor = ArgumentCaptor.forClass(Payment.class);
        verify(paymentRepository).save(paymentCaptor.capture());
        Payment saved = paymentCaptor.getValue();
        assertEquals(participantId, saved.getParticipant().getId());
        assertEquals(userId, saved.getUser().getId());
    }

    @Test
    void unmarkPaid_targetsSpecificParticipantEntry() {
        long clubId = 10L;
        long compId = 20L;
        long adminId = 30L;
        long participantId = 101L;

        User admin = new User("admin@example.com", "clubadmin", "x", Role.CLUB_ADMIN);
        admin.setId(adminId);

        Club club = new Club();
        club.setId(clubId);
        club.setClubAdmin(admin);

        Competition competition = new Competition();
        competition.setId(compId);
        competition.setClub(club);
        competition.setName("Comp");
        competition.setPaymentMode(PaymentMode.MANUAL);

        Payment payment = new Payment();
        ReflectionTestUtils.setField(payment, "id", 500L);
        payment.setStatus(Payment.PaymentStatus.SUCCEEDED);

        UserDetailsImpl principal = new UserDetailsImpl(admin);

        when(clubRepository.findByClubAdminId(adminId)).thenReturn(List.of(club));
        when(competitionRepository.findById(compId)).thenReturn(Optional.of(competition));
        when(paymentRepository.findSucceededByCompetitionAndParticipant(compId, participantId)).thenReturn(Optional.of(payment));
        when(userRepository.findById(adminId)).thenReturn(Optional.of(admin));

        controller.unmarkManualPayment(compId, participantId, principal);

        verify(paymentRepository).findSucceededByCompetitionAndParticipant(compId, participantId);
        verify(paymentRepository, never()).findSucceededByCompetitionAndUser(any(), any());
        verify(paymentRepository).updateStatus(eq(payment.getId()), eq(Payment.PaymentStatus.FAILED));
    }

    @Test
    void markPaidBatch_usesParticipantIds_notUserIds() {
        long clubId = 10L;
        long compId = 20L;
        long adminId = 30L;

        User admin = new User("admin@example.com", "clubadmin", "x", Role.CLUB_ADMIN);
        admin.setId(adminId);

        Club club = new Club();
        club.setId(clubId);
        club.setClubAdmin(admin);

        Competition competition = new Competition();
        competition.setId(compId);
        competition.setClub(club);
        competition.setPaymentMode(PaymentMode.MANUAL);
        competition.setEntryFee(BigDecimal.valueOf(20));

        UserDetailsImpl principal = new UserDetailsImpl(admin);
        ClubAdminController.MarkPaidBatchRequest request = new ClubAdminController.MarkPaidBatchRequest(List.of(101L, 102L, 103L));

        when(clubRepository.findByClubAdminId(adminId)).thenReturn(List.of(club));
        when(competitionRepository.findById(compId)).thenReturn(Optional.of(competition));
        when(participantRepository.findParticipantIdsByCompetitionId(compId)).thenReturn(List.of(101L, 102L, 103L));
        when(paymentRepository.findPaidParticipantIdsByCompetitionId(compId)).thenReturn(List.of(101L));
        when(paymentRepository.insertSucceededManualPaymentsForParticipants(eq(compId), eq(List.of(101L, 102L, 103L)), eq(2000), eq("eur"))).thenReturn(2);
        Payment p2 = new Payment(admin, competition, null, 2000, "eur");
        ReflectionTestUtils.setField(p2, "id", 602L);
        CompetitionParticipant cp2 = new CompetitionParticipant(competition, admin, ParticipantStatus.ACTIVE);
        cp2.setId(102L);
        p2.setParticipant(cp2);
        Payment p3 = new Payment(admin, competition, null, 2000, "eur");
        ReflectionTestUtils.setField(p3, "id", 603L);
        CompetitionParticipant cp3 = new CompetitionParticipant(competition, admin, ParticipantStatus.ACTIVE);
        cp3.setId(103L);
        p3.setParticipant(cp3);
        when(paymentRepository.findSucceededByCompetitionAndParticipantIdIn(compId, List.of(102L, 103L))).thenReturn(List.of(p2, p3));
        when(userRepository.findById(adminId)).thenReturn(Optional.of(admin));

        Map<String, Integer> body = controller.markManualPaymentBatch(compId, request, principal).getBody();

        assertEquals(3, body.get("requested"));
        assertEquals(2, body.get("created"));
        assertEquals(1, body.get("alreadyPaid"));
        assertEquals(0, body.get("invalid"));

        verify(paymentRepository).insertSucceededManualPaymentsForParticipants(compId, List.of(101L, 102L, 103L), 2000, "eur");
        verify(paymentRepository).findSucceededByCompetitionAndParticipantIdIn(compId, List.of(102L, 103L));
        verify(auditLogRepository, atLeastOnce()).save(any(AuditLog.class));
    }

    @Test
    void markPaid_rejectsWhenNotManualPaymentCompetition() {
        long clubId = 10L;
        long compId = 20L;
        long adminId = 30L;

        User admin = new User("admin@example.com", "clubadmin", "x", Role.CLUB_ADMIN);
        admin.setId(adminId);

        Club club = new Club();
        club.setId(clubId);
        club.setClubAdmin(admin);

        Competition competition = new Competition();
        competition.setId(compId);
        competition.setClub(club);
        competition.setPaymentMode(PaymentMode.STRIPE);

        UserDetailsImpl principal = new UserDetailsImpl(admin);

        when(clubRepository.findByClubAdminId(adminId)).thenReturn(List.of(club));
        when(competitionRepository.findById(compId)).thenReturn(Optional.of(competition));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.markManualPayment(compId, 101L, principal));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }
}
