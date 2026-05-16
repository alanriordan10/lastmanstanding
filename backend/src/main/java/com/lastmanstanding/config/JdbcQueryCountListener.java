package com.lastmanstanding.config;

import java.util.List;
import net.ttddyy.dsproxy.ExecutionInfo;
import net.ttddyy.dsproxy.QueryInfo;
import net.ttddyy.dsproxy.listener.QueryExecutionListener;
import org.springframework.stereotype.Component;

@Component
public class JdbcQueryCountListener implements QueryExecutionListener {

    @Override
    public void beforeQuery(ExecutionInfo execInfo, List<QueryInfo> queryInfoList) {
        // no-op
    }

    @Override
    public void afterQuery(ExecutionInfo execInfo, List<QueryInfo> queryInfoList) {
        long count;
        if (execInfo.isBatch()) {
            count = Math.max(execInfo.getBatchSize(), 1);
        } else {
            count = Math.max(queryInfoList != null ? queryInfoList.size() : 0, 1);
        }
        JdbcQueryCountContext.increment(count);
    }
}

