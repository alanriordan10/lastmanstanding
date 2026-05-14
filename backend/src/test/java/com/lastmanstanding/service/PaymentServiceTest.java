package com.lastmanstanding.service;

import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionParticipant;
import com.lastmanstanding.entity.CompetitionStatus;
import com.lastmanstanding.entity.PaymentMode;
import com.lastmanstanding.entity.ParticipantStatus;
import com.lastmanstanding.entity.Payment;
import com.lastmanstanding.entity.Role;
import com.lastmanstanding.entity.User;
import com.lastmanstanding.repository.ClubRepository;
import com.lastmanstanding.repository.CompetitionParticipantRepository;
import com.lastmanstanding.repository.CompetitionRepository;
import com.lastmanstanding.repository.PaymentRepository;
import com.lastmanstanding.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    @Mock private PaymentRepository paymentRepository;
    @Mock private CompetitionRepository competitionRepository;
    @Mock private CompetitionParticipantRepository participantRepository;
    @Mock private UserRepository userRepository;
    @Mock private ClubRepository clubRepository;
    @Mock private CompetitionService competitionService;

    private PaymentService paymentService;

    @BeforeEach
    void setUp() {
        paymentService = new PaymentService(
                paymentRepository,
                competitionRepository,
                participantRepository,
                userRepository,
                clubRepository,
                competitionService
        );

        // Make ensureConfigured() pass without requiring real Stripe keys.
        ReflectionTestUtils.setField(paymentService, "stripeSecretKey", "sk_test_realistic_value");
    }

    @Test
    void createPaymentIntent_whenMaxEntriesReached_throwsConflict() {
        long competitionId = 10L;
        long userId = 55L;

        Competition comp = new Competition();
        comp.setStatus(CompetitionStatus.UPCOMING);
        comp.setPaymentMode(PaymentMode.STRIPE);
        comp.setStripeDestinationAccountId("acct_123");
        comp.setEntryFee(BigDecimal.valueOf(20));
        comp.setMaxEntriesPerUser(2);

        User user = new User();

        when(competitionRepository.findById(competitionId)).thenReturn(Optional.of(comp));
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(participantRepository.countByCompetitionIdAndUserId(competitionId, userId)).thenReturn(2L);

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> paymentService.createPaymentIntent(competitionId, userId)
        );

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertEquals("You have reached the maximum entries for this competition", ex.getReason());
        verify(paymentRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void createPaymentIntent_whenMaxEntriesDefaultsToOne_andOneEntryExists_throwsConflict() {
        long competitionId = 11L;
        long userId = 77L;

        Competition comp = new Competition();
        comp.setStatus(CompetitionStatus.UPCOMING);
        comp.setPaymentMode(PaymentMode.STRIPE);
        comp.setStripeDestinationAccountId("acct_123");
        comp.setEntryFee(BigDecimal.valueOf(15));
        comp.setMaxEntriesPerUser(null); // default should be treated as 1

        User user = new User();

        when(competitionRepository.findById(competitionId)).thenReturn(Optional.of(comp));
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(participantRepository.countByCompetitionIdAndUserId(competitionId, userId)).thenReturn(1L);

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> paymentService.createPaymentIntent(competitionId, userId)
        );

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertEquals("You have reached the maximum entries for this competition", ex.getReason());
        verify(paymentRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void linkPaymentToParticipantEntryIfMissing_whenAlreadyLinked_doesNothing() {
        Competition comp = new Competition();
        comp.setId(20L);
        User user = new User("a@b.com", "user", "x", Role.USER);
        user.setId(9L);
        Payment payment = new Payment(user, comp, "pi_1", 2000, "eur");

        CompetitionParticipant existing = new CompetitionParticipant(comp, user, ParticipantStatus.ACTIVE);
        existing.setId(33L);
        payment.setParticipant(existing);

        paymentService.linkPaymentToParticipantEntryIfMissing(payment);

        assertEquals(33L, payment.getParticipant().getId());
        verify(competitionService, never()).joinCompetition(org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void linkPaymentToParticipantEntryIfMissing_whenJoinSucceeds_linksCreatedEntry() {
        Competition comp = new Competition();
        comp.setId(21L);
        User user = new User("a@b.com", "user", "x", Role.USER);
        user.setId(10L);
        Payment payment = new Payment(user, comp, "pi_2", 2000, "eur");

        CompetitionParticipant joined = new CompetitionParticipant(comp, user, ParticipantStatus.ACTIVE);
        joined.setId(44L);
        when(competitionService.joinCompetition(21L, 10L)).thenReturn(joined);

        paymentService.linkPaymentToParticipantEntryIfMissing(payment);

        assertEquals(44L, payment.getParticipant().getId());
    }

    @Test
    void linkPaymentToParticipantEntryIfMissing_whenJoinConflicts_linksLatestExistingEntry() {
        Competition comp = new Competition();
        comp.setId(22L);
        User user = new User("a@b.com", "user", "x", Role.USER);
        user.setId(11L);
        Payment payment = new Payment(user, comp, "pi_3", 2000, "eur");

        when(competitionService.joinCompetition(22L, 11L))
                .thenThrow(new ResponseStatusException(HttpStatus.CONFLICT, "already joined"));

        CompetitionParticipant entry1 = new CompetitionParticipant(comp, user, ParticipantStatus.ACTIVE);
        entry1.setId(55L);
        entry1.setEntryNumber(1);
        CompetitionParticipant entry2 = new CompetitionParticipant(comp, user, ParticipantStatus.ACTIVE);
        entry2.setId(56L);
        entry2.setEntryNumber(2);
        when(participantRepository.findByCompetitionIdAndUserIdOrderByEntryNumberAsc(22L, 11L))
                .thenReturn(List.of(entry1, entry2));

        paymentService.linkPaymentToParticipantEntryIfMissing(payment);

        assertEquals(56L, payment.getParticipant().getId());
    }
}
