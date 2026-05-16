package com.lastmanstanding.config;

import javax.sql.DataSource;
import net.ttddyy.dsproxy.listener.QueryExecutionListener;
import net.ttddyy.dsproxy.support.ProxyDataSourceBuilder;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnProperty(name = "app.perf.endpoint-metrics-enabled", havingValue = "true", matchIfMissing = true)
public class DataSourceProxyConfig {

    @Bean
    public BeanPostProcessor dataSourceProxyBeanPostProcessor(QueryExecutionListener jdbcQueryCountListener) {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException {
                if (!(bean instanceof DataSource dataSource)) {
                    return bean;
                }
                if (bean.getClass().getName().contains("ProxyDataSource")) {
                    return bean;
                }
                return ProxyDataSourceBuilder.create(dataSource)
                        .name(beanName)
                        .listener(jdbcQueryCountListener)
                        .build();
            }
        };
    }
}

