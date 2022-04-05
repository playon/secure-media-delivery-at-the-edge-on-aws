WITH Q1 AS (
	SELECT split_part(split_part(uri, '/',2),'.',1) AS session_id,
		COUNT(*) AS request_cnt,
		date_diff(
			'second',
			MIN(CAST((CAST(date AS VARCHAR) || ' ' || time) AS TIMESTAMP)),
			MAX(CAST((CAST(date AS VARCHAR) || ' ' || time) AS TIMESTAMP))
		) AS time_range,
		MAX(CAST((CAST(date AS VARCHAR) || ' ' || time) AS TIMESTAMP)) AS time_point,
		COUNT(DISTINCT referrer) AS referer_cnt,
		COUNT(DISTINCT request_ip) AS IP_cnt,
		COUNT(DISTINCT user_agent) as UA_cnt
	FROM "${db_name}"."${table_name}"
	WHERE
	    CAST((CAST(date AS VARCHAR) || ' ' || time) AS TIMESTAMP) >= (now() - interval '${lookback_period}' minute)
		AND status < 300
	GROUP BY 1
),
Q2 AS (
    SELECT session_id,
    ((Q1.request_cnt * 1.0 / Q1.time_range) /(SELECT approx_percentile((Q1.request_cnt * 1.0 / Q1.time_range), 0.50)	FROM Q1	)) as IP_rate,
    IF(Q1.IP_cnt > 1, {IP_penalty}, 0) as IP_penalty,
    IF(Q1.referer_cnt > 1, {referer_penalty}, 0) as referer_penalty,
    IF(Q1.UA_cnt > 1, {UA_penalty}, 0) as UA_penalty,
    time_point
    FROM Q1
    WHERE
        (SELECT COUNT(*) FROM Q1)	> ${minimum_sessions_number}
        AND time_range > ${min_session_duration}
)
SELECT
session_id,
(IP_rate + IP_penalty + referer_penalty + UA_penalty) as Score,
IP_rate,
IP_penalty,
referer_penalty,
UA_penalty,
TO_UNIXTIME(time_point) as time_point
FROM Q2
WHERE
(IP_rate + IP_penalty + referer_penalty + UA_penalty) > {score_threshold}