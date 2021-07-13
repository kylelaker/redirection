import json
import logging
import os

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)


class Result:
    def __init__(self, status, body=None, base64=False, headers=None, cookies=None):
        self.status = status
        if body:
            self.body = body
        else:
            self.body = None
        self.base64 = base64
        if not headers:
            self.headers = {}
        else:
            self.headers = dict(headers)
        if not cookies:
            self.cookies = []
        else:
            self.cookies = list(cookies)
    
    def format_api_gateway(self):
        result = {
            'statusCode': self.status,
            'isBase64Encoded': self.base64,
        }
        if self.body:
            result['body'] = self.body
        if self.headers:
            result['headers'] = self.headers
        if self.cookies:
            result['cookies'] = self.cookies
        return result


class ErrorResult(Result):
    def __init__(self, status, message):
        body = {'errorMessage': message}
        super().__init__(status, json.dumps(body))


class RedirectResult(Result):
    def __init__(self, location):
        headers = {'Location': location}
        super().__init__(301, None, headers=headers)


def query(table, host):
    dynamodb = boto3.client('dynamodb')
    key={'host': {'S': host}}
    try:
        result = dynamodb.get_item(TableName=table, Key=key)
    except ClientError:
        return ErrorResult(500, "Unable to query for redirect")

    if location := result.get('Item', {}).get('location', {}).get('S', None):
        return RedirectResult(location)

    return ErrorResult(404, f"No destination for {host}")


def lambda_handler(event, context):
    host = event['headers']['host']
    logger.debug("Requested host: %s", host)
    table_name = os.environ.get('DYNAMODB_TABLE', 'redirection')
    logger.debug("Querying from DynamoDB table: %s", table_name)
    response = query(table_name, host).format_api_gateway()
    logger.debug("Response: %s", json.dumps(response))
    return response
