import boto3
import os
import datetime

secrets_client = boto3.client('secretsmanager')
s3 = boto3.client('s3')
athena = boto3.client('athena')

def build_second_part_query_string(lookback_minutes):

   now =  int(datetime.datetime.timestamp(datetime.datetime.now()))
   end_timestamp = datetime.datetime.fromtimestamp(now)
   start_timestamp = end_timestamp - datetime.timedelta(seconds=60*lookback_minutes)

   start_year = start_timestamp.year
   start_month = start_timestamp.month
   end_year = end_timestamp.year
   end_month = end_timestamp.month

    # same day query filter!
   if (start_timestamp.date() == end_timestamp.date()):
      query_string = f"""
            WHERE CAST(year AS INTEGER) = CAST(date_format(current_timestamp - interval '{lookback_minutes}' minute, '%Y') AS INTEGER)
               AND CAST(month AS INTEGER) = CAST(date_format(current_timestamp - interval '{lookback_minutes}' minute, '%m') AS INTEGER)
               AND CAST(day AS INTEGER) = CAST(date_format(current_timestamp - interval '{lookback_minutes}' minute, '%d') AS INTEGER)
               AND CAST(hour AS INTEGER) between
               CAST(date_format(current_timestamp - interval '{lookback_minutes}' minute, '%H') AS INTEGER) and CAST(date_format(current_timestamp, '%H') AS INTEGER) """

    # different days - cross days query filter!
   elif (start_year == end_year):
      if (start_month == end_month):  # year and month are the same, but days are different
         query_string = f"""
                     WHERE
                     CAST(year AS INTEGER) = CAST(date_format(current_timestamp - interval '{lookback_minutes}' minute, '%Y') AS INTEGER)
                     AND CAST(month AS INTEGER) = CAST(date_format(current_timestamp - interval '{lookback_minutes}' minute, '%m') AS INTEGER)
                     AND (
                     (
                        CAST(day AS INTEGER) = CAST(date_format(current_timestamp - interval '{lookback_minutes}' minute, '%d') AS INTEGER)
                        AND CAST(hour AS INTEGER) >= CAST(date_format(current_timestamp - interval '{lookback_minutes}' minute, '%H') AS INTEGER)
                     )
                     OR
                     (
                        CAST(day AS INTEGER) = CAST(date_format(current_timestamp, '%d') AS INTEGER)
                        AND CAST(hour AS INTEGER) <= CAST(date_format(current_timestamp, '%H') AS INTEGER)
                     )
                     )
                     """
      else:  # years are the same, but months and days are different
         query_string = f"""
                     WHERE
                     CAST(year AS INTEGER) = CAST(date_format(current_timestamp - interval '{lookback_minutes}' minute, '%Y') AS INTEGER)
                     AND (
                     (
                        CAST(month AS INTEGER) = CAST(date_format(current_timestamp - interval '{lookback_minutes}' minute, '%m') AS INTEGER)
                        AND CAST(day AS INTEGER) = CAST(date_format(current_timestamp - interval '{lookback_minutes}' minute, '%d') AS INTEGER)
                        AND CAST(hour AS INTEGER) >= CAST(date_format(current_timestamp - interval '{lookback_minutes}' minute, '%H') AS INTEGER)
                     )
                     OR
                     (
                        CAST(month AS INTEGER) = CAST(date_format(current_timestamp, '%m')AS INTEGER)
                        AND CAST(day AS INTEGER) = CAST(date_format(current_timestamp, '%d')AS INTEGER)
                        AND CAST(hour AS INTEGER) <= CAST(date_format(current_timestamp, '%H')AS INTEGER)
                     )
                     )
                     """

   else:  # years are different
      query_string = f"""
                  WHERE
                  (
                  (
                     CAST(year AS INTEGER) = CAST(date_format(current_timestamp - interval '{lookback_minutes}' minute, '%Y') AS INTEGER)
                     AND CAST(month AS INTEGER) = CAST(date_format(current_timestamp - interval '{lookback_minutes}' minute, '%m') AS INTEGER)
                     AND CAST(day AS INTEGER) = CAST(date_format(current_timestamp - interval '{lookback_minutes}' minute, '%d') AS INTEGER)
                     AND CAST(hour AS INTEGER) >= CAST(date_format(current_timestamp - interval '{lookback_minutes}' minute, '%H') AS INTEGER)
                  )
                  OR
                  (
                     CAST(year AS INTEGER) = CAST(date_format(current_timestamp, '%Y') AS INTEGER)
                     AND CAST(month AS INTEGER) = CAST(date_format(current_timestamp, '%m') AS INTEGER)
                     AND CAST(day AS INTEGER) = CAST(date_format(current_timestamp, '%d') AS INTEGER)
                     AND CAST(hour AS INTEGER) <= CAST(date_format(current_timestamp, '%H') AS INTEGER)
                  )
                  )
                  """


   return query_string

def generate_athena_query(query_param):

   query_string_first_part = f"""
      WITH Q1 AS (
         SELECT
               split(split_part(uri, '/',2),'.') AS path_first_part_array,
               {query_param['uri_column_name']} AS uri,
               {query_param['referer_column_name']} AS referer,
               {query_param['ua_column_name']} AS user_agent,
               {query_param['request_ip_column']} AS viewer_ip,
               CAST((CAST({query_param['date_column_name']} AS VARCHAR) || ' ' || {query_param['time_column_name']}) AS TIMESTAMP) AS time_point
         FROM \"{query_param['db_name']}\".\"{query_param['table_name']}\" """

   if query_param['partitioned']==1:
      query_string_second_part = build_second_part_query_string(query_param['lookback_period'])#st, et)
      third_part_preamble = 'AND '
   else:
      query_string_second_part = ''
      third_part_preamble = 'WHERE '


   query_string_third_part = f"""
      {third_part_preamble}CAST({query_param['status_column_name']} AS INTEGER) IN (200, 206)
      AND CAST({query_param['response_bytes_column_name']} AS INTEGER) > 1024

   ),
   Q2 AS (
      SELECT
         path_first_part_array[1] as session_id,
         COUNT(*) AS request_cnt,
         date_diff(
               'second',
               MIN(time_point),
               MAX(time_point)
         ) AS time_range,
         MAX(time_point) as max_time_point,
         COUNT(DISTINCT referer) AS referer_cnt,
         COUNT(DISTINCT viewer_ip) AS IP_cnt,
         COUNT(DISTINCT user_agent) as UA_cnt
      FROM Q1
      WHERE
         time_point >= (now() - interval '{query_param['lookback_period']}' minute)
         AND cardinality(path_first_part_array) = 4
      GROUP BY 1
   ),
   Q3 AS (
      SELECT
         session_id,
         ({query_param['ip_rate']}*(Q2.request_cnt * 1.0 / Q2.time_range) /(SELECT approx_percentile((Q2.request_cnt * 1.0 / Q2.time_range), 0.50) FROM Q2)) as ip_rate,
         IF(Q2.IP_cnt > 1, {query_param['ip_penalty']}, 0) as ip_penalty,
         IF(Q2.referer_cnt > 1, {query_param['referer_penalty']}, 0) as referer_penalty,
         IF(Q2.UA_cnt > 1, {query_param['ua_penalty']}, 0) as ua_penalty,
         max_time_point
         FROM Q2
         WHERE
               (SELECT COUNT(*) FROM Q2) > {query_param['min_sessions_number']}
               AND time_range > {query_param['min_session_duration']}
   )
   SELECT
      session_id,
      (ip_rate + ip_penalty + referer_penalty + ua_penalty) as Score,
      ip_rate,
      ip_penalty,
      referer_penalty,
      ua_penalty,
      TO_UNIXTIME(max_time_point) as time_point
   FROM Q3
   WHERE
      (ip_rate + ip_penalty + referer_penalty + ua_penalty) > {query_param['score_threshold']}
   """

   final_query_string = query_string_first_part + query_string_second_part + query_string_third_part
   return final_query_string



def handler(event, context):

   params = {
            'ip_penalty': int(os.environ['ip_penalty']),
            'referer_penalty': int(os.environ['referer_penalty']),
            'ua_penalty': int(os.environ['ua_penalty']),
            'ip_rate': int(os.environ['ip_rate']),
            'uri_column_name': os.environ['uri_column_name'],
            'referer_column_name': os.environ['referer_column_name'],
            'ua_column_name': os.environ['ua_column_name'],
            'request_ip_column': os.environ['request_ip_column'],
            'status_column_name': os.environ['status_column_name'],
            'response_bytes_column_name': os.environ['response_bytes_column_name'],
            'date_column_name': os.environ['date_column_name'],
            'time_column_name': os.environ['time_column_name'],
            'db_name': os.environ['db_name'],
            'table_name': os.environ['table_name'],
            'min_sessions_number': int(os.environ['min_sessions_number']),
            'min_session_duration': int(os.environ['min_session_duration']),
            'score_threshold': float(os.environ['score_threshold']),
            'partitioned': int(os.environ['partitioned']),
            'lookback_period': int(os.environ['lookback_period'])
   }
   query = generate_athena_query(params).replace('\n', '')
   return query
