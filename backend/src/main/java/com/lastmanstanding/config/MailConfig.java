package com.lastmanstanding.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import java.util.Properties;

/**
 * Legacy mail configuration — no longer used (using Resend REST API instead).
 * Kept for backward compatibility but disabled.
 *
 * @deprecated Use ResendConfig instead
 */
@Configuration
public class MailConfig {

    @Value("${spring.mail.protocol:smtp}")
    private String protocol;

    @Value("${spring.mail.host:smtp.gmail.com}")
    private String host;

    @Value("${spring.mail.port:587}")
    private int port;

    @Value("${spring.mail.username:}")
    private String username;

    @Value("${spring.mail.password:}")
    private String password;

    @Bean
    public JavaMailSender javaMailSender() {
        JavaMailSenderImpl mailSender = new JavaMailSenderImpl();

        // Set basic connection properties
        mailSender.setProtocol(protocol);
        mailSender.setHost(host);
        mailSender.setPort(port);
        mailSender.setUsername(username);
        mailSender.setPassword(password);

        // Configure JakartaMail session properties for STARTTLS on port 587
        Properties props = new Properties();

        // Authentication
        props.setProperty("mail.smtp.auth", "true");

        // STARTTLS configuration (port 587)
        props.setProperty("mail.smtp.starttls.enable", "true");
        props.setProperty("mail.smtp.starttls.required", "true");

        // Disable implicit SSL-on-connect (critical for port 587)
        props.setProperty("mail.smtp.ssl.enable", "false");

        // Specify modern TLS protocols
        props.setProperty("mail.smtp.ssl.protocols", "TLSv1.2 TLSv1.3");

        // Connection timeouts
        props.setProperty("mail.smtp.connectiontimeout", "15000");
        props.setProperty("mail.smtp.timeout", "15000");
        props.setProperty("mail.smtp.writetimeout", "15000");

        mailSender.setJavaMailProperties(props);

        return mailSender;
    }
}
