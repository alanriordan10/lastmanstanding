package com.lastmanstanding.config;

import com.lastmanstanding.repository.UserRepository;
import com.lastmanstanding.security.CspHeaderFilter;
import com.lastmanstanding.security.CsrfFilter;
import com.lastmanstanding.security.OAuth2AuthenticationSuccessHandler;
import com.lastmanstanding.security.HttpCookieOAuth2AuthorizationRequestRepository;
import com.lastmanstanding.security.OAuth2AuthenticationFailureRedirectHandler;
import com.lastmanstanding.security.JwtAuthenticationFilter;
import com.lastmanstanding.security.UserDetailsImpl;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.ArrayList;
import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final CsrfFilter csrfFilter;
    private final CspHeaderFilter cspHeaderFilter;
    private final UserRepository userRepository;
    private final OAuth2AuthenticationSuccessHandler oAuth2AuthenticationSuccessHandler;
    private final OAuth2AuthenticationFailureRedirectHandler oAuth2AuthenticationFailureRedirectHandler;
    private final HttpCookieOAuth2AuthorizationRequestRepository oAuth2AuthorizationRequestRepository;
    private final String frontendUrl;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
                          CsrfFilter csrfFilter,
                          CspHeaderFilter cspHeaderFilter,
                          UserRepository userRepository,
                          OAuth2AuthenticationSuccessHandler oAuth2AuthenticationSuccessHandler,
                          OAuth2AuthenticationFailureRedirectHandler oAuth2AuthenticationFailureRedirectHandler,
                          HttpCookieOAuth2AuthorizationRequestRepository oAuth2AuthorizationRequestRepository,
                          @Value("${app.frontend-url:http://localhost:5173}") String frontendUrl) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.csrfFilter = csrfFilter;
        this.cspHeaderFilter = cspHeaderFilter;
        this.userRepository = userRepository;
        this.oAuth2AuthenticationSuccessHandler = oAuth2AuthenticationSuccessHandler;
        this.oAuth2AuthenticationFailureRedirectHandler = oAuth2AuthenticationFailureRedirectHandler;
        this.oAuth2AuthorizationRequestRepository = oAuth2AuthorizationRequestRepository;
        this.frontendUrl = frontendUrl;
    }

    // ── Security filter chain ───────────────────────────────────────────

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(csrf -> csrf.disable())
                .headers(headers -> {
                    headers.frameOptions(frame -> frame.deny());
                    headers.contentTypeOptions(Customizer.withDefaults());
                    headers.referrerPolicy(referrer -> referrer.policy(
                            org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN));
                    headers.httpStrictTransportSecurity(hsts -> hsts
                            .includeSubDomains(true)
                            .maxAgeInSeconds(31_536_000)
                            .preload(true));
                    headers.permissionsPolicy(perms -> perms.policy(
                            "accelerometer=(), ambient-light-sensor=(), autoplay=(), " +
                            "battery=(), camera=(), display-capture=(), document-domain=(), " +
                            "encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), " +
                            "magnetometer=(), microphone=(), midi=(), payment=(self \"https://js.stripe.com\"), " +
                            "picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), " +
                            "sync-xhr=(), usb=(), xr-spatial-tracking=()"));
                })
                .addFilterBefore(cspHeaderFilter, org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter.class)
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/healthz").permitAll()
                        .requestMatchers("/client-errors").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/oauth2/**", "/login/oauth2/**").permitAll()
                        .requestMatchers("/competitions/my", "/competitions/my/**", "/competitions/*/me").authenticated()
                        .requestMatchers(HttpMethod.GET, "/competitions/code/*").permitAll()
                        .requestMatchers(HttpMethod.GET, "/competitions/upcoming").permitAll()
                        .requestMatchers(HttpMethod.GET, "/competitions/clubs").permitAll()
                        .requestMatchers(HttpMethod.GET, "/competitions/*").permitAll()
                        .requestMatchers(HttpMethod.GET, "/competitions/*/fixtures").permitAll()
                        .requestMatchers(HttpMethod.GET, "/competitions/*/participants").permitAll()
                        .requestMatchers(HttpMethod.GET, "/competitions/*/gameweeks/current").permitAll()
                        .requestMatchers(HttpMethod.GET, "/competitions/*/survivor-table").permitAll()
                        .requestMatchers(HttpMethod.GET, "/competitions/*/gameweeks/*/selections").permitAll()
                        .requestMatchers(
                                "/competitions/*/join",
                                "/competitions/*/gameweeks/*/pick",
                                "/competitions/*/picks/open",
                                "/competitions/*/picks/history",
                                "/competitions/*/gameweeks/*/my-pick"
                        ).authenticated()
                        .requestMatchers("/auth/me", "/auth/email-preferences", "/notifications/**").authenticated()
                        .requestMatchers("/auth/**").permitAll()
                        .requestMatchers("/admin/**").hasRole("ADMIN")
                        .requestMatchers("/club-admin/**").hasAnyRole("ADMIN", "CLUB_ADMIN")
                        .requestMatchers("/payments/webhook", "/payments/config", "/payments/demo-checkout").permitAll()
                        .requestMatchers("/payments/**").authenticated()
                        .anyRequest().authenticated())
                .oauth2Login(oauth2 -> oauth2
                        .authorizationEndpoint(authorization -> authorization
                                .authorizationRequestRepository(oAuth2AuthorizationRequestRepository))
                        .successHandler(oAuth2AuthenticationSuccessHandler)
                        .failureHandler(oAuth2AuthenticationFailureRedirectHandler))
                .exceptionHandling(ex -> ex
                        // For API calls, return 401 instead of redirecting to OAuth provider.
                        .authenticationEntryPoint(new HttpStatusEntryPoint(org.springframework.http.HttpStatus.UNAUTHORIZED)))
                .authenticationProvider(authenticationProvider())
                .addFilterBefore(csrfFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(jwtAuthenticationFilter,
                        UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    // ── CORS ────────────────────────────────────────────────────────────

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        List<String> allowedOrigins = new ArrayList<>(List.of(
                "http://localhost:5173",
                "http://localhost:5174",
                "http://localhost:3000"
        ));
        if (frontendUrl != null && !frontendUrl.isBlank()) {
            allowedOrigins.add(frontendUrl);
        }

        config.setAllowedOrigins(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    // ── Authentication beans ────────────────────────────────────────────

    @Bean
    public UserDetailsService userDetailsService() {
        return email -> {
            var user = userRepository.findByEmail(email)
                    .orElseThrow(() -> new UsernameNotFoundException(
                            "User not found with email: " + email));
            return new UserDetailsImpl(user);
        };
    }

    @Bean
    public AuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService());
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
