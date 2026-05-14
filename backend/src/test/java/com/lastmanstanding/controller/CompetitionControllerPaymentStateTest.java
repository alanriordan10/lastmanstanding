package com.lastmanstanding.controller;

import com.lastmanstanding.dto.CompetitionDtos.MyCompetitionResponse;
import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionParticipant;
import com.lastmanstanding.entity.CompetitionStatus;
import com.lastmanstanding.entity.MissedPickMode;
import com.lastmanstanding.entity.Payment;
import com.lastmanstanding.entity.PaymentMode;
import com.lastmanstanding.entity.ParticipantStatus;
import com.lastmanstanding.entity.Role;
import com.lastmanstanding.entity.User;
import com.lastmanstanding.repository.ClubRepository;
import com.lastmanstanding.repository.CompetitionParticipantRepository;
import com.lastmanstanding.repository.CompetitionRepository;
import com.lastmanstanding.repository.FixtureRepository;
import com.lastmanstanding.repository.GameweekRepository;
import com.lastmanstanding.repository.PaymentRepository;
import com.lastmanstanding.repository.PickRepository;
import com.lastmanstanding.repository.PickResultRepository;
import com.lastmanstanding.repository.TeamRepository;
import com.lastmanstanding.security.UserDetailsImpl;
import com.lastmanstanding.service.CompetitionService;
import com.lastmanstanding.service.PickService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CompetitionControllerPaymentStateTest {

    @Mock private CompetitionService competitionService;
    @Mock private PickService pickService;
    @Mock private CompetitionRepository competitionRepository;
    @Mock private GameweekRepository gameweekRepository;
    @Mock private FixtureRepository fixtureRepository;
    @Mock private PickRepository pickRepository;
    @Mock private PickResultRepository pickResultRepository;
    @Mock private CompetitionParticipantRepository participantRepository;
    @Mock private TeamRepository teamRepository;
    @Mock private ClubRepository clubRepository;
    @Mock private PaymentRepository paymentRepository;

    private CompetitionController controller;

    @BeforeEach
    void setUp() {
        controller = new CompetitionController(
                competitionService,
                pickService,
                competitionRepository,
                gameweekRepository,
                fixtureRepository,
                pickRepository,
                pickResultRepository,
                participantRepository,
                teamRepository,
                clubRepository,
                paymentRepository
        );
    }

    @Test
    void myDetails_doesNotFallbackToUserLevelWhenParticipantScopedStripePaymentsExist() {
        long userId = 309L;
        long competitionId = 77L;
        long paidParticipantId = 1001L;
        long unpaidParticipantId = 1002L;

        User user = new User("u@example.com", "player", "x", Role.USER);
        user.setId(userId);
        UserDetailsImpl principal = new UserDetailsImpl(user);

        Competition competition = new Competition();
        competition.setId(competitionId);
        competition.setName("Stripe Comp");
        competition.setStatus(CompetitionStatus.UPCOMING);
        competition.setMissedPickMode(MissedPickMode.ELIMINATE);
        competition.setCreatedBy(user);
        competition.setPaymentMode(PaymentMode.STRIPE);

        CompetitionParticipant paidEntry = new CompetitionParticipant(competition, user, ParticipantStatus.ACTIVE);
        paidEntry.setId(paidParticipantId);
        paidEntry.setEntryNumber(1);

        CompetitionParticipant unpaidEntry = new CompetitionParticipant(competition, user, ParticipantStatus.ACTIVE);
        unpaidEntry.setId(unpaidParticipantId);
        unpaidEntry.setEntryNumber(2);

        when(participantRepository.findByUserId(userId)).thenReturn(List.of(paidEntry, unpaidEntry));
        when(participantRepository.countParticipantsGroupedByCompetition())
                .thenReturn(java.util.Collections.singletonList(new Object[]{competitionId, 2L, 2L}));
        when(participantRepository.findByStatus(ParticipantStatus.WINNER)).thenReturn(List.of());
        when(gameweekRepository.findFirstActiveGameweekDates(anyList())).thenReturn(List.<Object[]>of());
        when(paymentRepository.findCompetitionIdsWithParticipantScopedPaymentsForUser(userId, List.of(competitionId)))
                .thenReturn(List.of(competitionId));
        when(paymentRepository.findStatusesByParticipantAndCompetition(paidParticipantId, competitionId))
                .thenReturn(List.of(Payment.PaymentStatus.SUCCEEDED));
        when(paymentRepository.findStatusesByParticipantAndCompetition(unpaidParticipantId, competitionId))
                .thenReturn(List.of());

        List<MyCompetitionResponse> response = controller.getMyCompetitions(principal);
        Map<Long, String> paymentStateByParticipant = response.stream()
                .collect(java.util.stream.Collectors.toMap(MyCompetitionResponse::participantId, MyCompetitionResponse::paymentState));

        assertEquals("PAID", paymentStateByParticipant.get(paidParticipantId));
        assertEquals("AWAITING_PAYMENT", paymentStateByParticipant.get(unpaidParticipantId));
    }
}
