import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { Logger } from "@aws-lambda-powertools/logger";

const logger = new Logger({ serviceName: "redirectHandler" });
const tracer = new Tracer({ serviceName: "redirectHandler" });
tracer.provider.setLogger(logger);

const dynamodbRaw = tracer.captureAWSv3Client(new DynamoDB({ useFipsEndpoint: true }));
const dynamodb = tracer.captureAWSv3Client(DynamoDBDocument.from(dynamodbRaw));

const table = process.env.REDIRECT_TABLE!;

const unknownHost: APIGatewayProxyResultV2 = {
  statusCode: 404,
  body: "No redirect location was found for the given host",
};
const badRequest: APIGatewayProxyResultV2 = {
  statusCode: 400,
  body: "The request was invalid",
};
const unexpectedError: APIGatewayProxyResultV2 = {
  statusCode: 500,
  body: "An unexpected error occurred",
};

export async function handler(event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyResultV2> {
  logger.addContext(context);
  if (logger.isColdStart()) {
    console.info("This event is a cold start");
  }

  const host = event.headers.host;
  if (!host) {
    logger.error("Invalid request received", { data: event.headers });
    return badRequest;
  }

  try {
    const record = await dynamodb.get({ TableName: table, Key: { host }, AttributesToGet: ["location"] });
    if (!record.Item) {
      logger.error("Unknown host", { data: event.headers });
      return unknownHost;
    }
    if (!record.Item.location) {
      logger.error("Unexpected record format", { data: record.Item });
      return unexpectedError;
    }
    return {
      statusCode: 301,
      headers: {
        Location: record.Item.location,
      },
    };
  } catch (err) {
    logger.error("Unexpected DynamoDB service error", err as Error);
    return unexpectedError;
  }
}
