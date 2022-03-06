use aws_sdk_dynamodb::{model::AttributeValue, output::GetItemOutput, Client};
use lambda_http::{service_fn, Body, Error as LambdaError, IntoResponse, Request, Response};
use serde::Serialize;
use thiserror::Error;

#[derive(Serialize)]
struct Redirect {
    host: String,
    location: String,
}

#[derive(Serialize)]
struct RedirectGetResponse {
    redirect: Redirect,
}

#[derive(Serialize)]
struct RedirectGetErrorResponse {
    r#type: String,
    message: String,
}

#[derive(Debug, Error)]
enum RedirectGetError {
    #[error("No redirect location found for the given host")]
    HostNotFound,
    #[error("The request was invalid")]
    BadRequest,
    #[error("The redirect record is invalid")]
    InvalidFormat,
    #[error("An unknown error condition occurred")]
    UnknownError,
}

impl IntoResponse for RedirectGetError {
    fn into_response(self) -> Response<Body> {
        let status = match self {
            RedirectGetError::BadRequest => 400,
            RedirectGetError::HostNotFound => 404,
            _ => 500,
        };
        let response = RedirectGetErrorResponse {
            r#type: format!("{:#?}", self),
            message: format!("{:}", self),
        };
        Response::builder()
            .status(status)
            .header("Content-Type", "application/json")
            .body(Body::from(serde_json::to_string(&response).unwrap()))
            .expect("failed to render result")
    }
}

impl IntoResponse for RedirectGetResponse {
    fn into_response(self) -> Response<Body> {
        Response::builder()
            .status(301)
            .header("Location", self.redirect.location)
            .body(Body::Empty)
            .expect("faied to render response")
    }
}

fn get_item_to_response(
    host: &str,
    output: GetItemOutput,
) -> Result<RedirectGetResponse, RedirectGetError> {
    let record = if let Some(item) = output.item {
        item
    } else {
        return Err(RedirectGetError::HostNotFound);
    };

    let location_raw = if let Some(location_value) = record.get("location") {
        location_value.as_s()
    } else {
        return Err(RedirectGetError::HostNotFound);
    };

    if let Ok(location) = location_raw {
        Ok(RedirectGetResponse {
            redirect: Redirect {
                host: host.to_string(),
                location: location.to_string(),
            },
        })
    } else {
        Err(RedirectGetError::InvalidFormat)
    }
}

async fn perform_query(client: Client, host: &str) -> Result<GetItemOutput, RedirectGetError> {
    client
        .get_item()
        .table_name(std::env::var("REDIRECT_TABLE").unwrap())
        .key("host", AttributeValue::S(host.to_string()))
        .send()
        .await
        .map_err(|_| RedirectGetError::UnknownError)
}

fn get_request_header(event: Request, header: &str) -> Result<String, RedirectGetError> {
    event.headers().get(header).map_or_else(
        || Err(RedirectGetError::BadRequest),
        |v| {
            v.to_str()
                .map(|op| op.to_string())
                .map_err(|_| RedirectGetError::BadRequest)
        },
    )
}

async fn func(event: Request) -> Result<impl IntoResponse, LambdaError> {
    let shared_config = aws_config::load_from_env().await;
    let client = Client::new(&shared_config);

    let host = match get_request_header(event, "Host") {
        Ok(header) => header,
        Err(e) => return Ok(e.into_response()),
    };

    let output = match perform_query(client, host.as_str()).await {
        Ok(output) => output,
        Err(e) => return Ok(e.into_response()),
    };

    Ok(match get_item_to_response(host.as_str(), output) {
        Ok(response) => response.into_response(),
        Err(e) => e.into_response(),
    })
}

#[tokio::main]
async fn main() -> Result<(), LambdaError> {
    lambda_http::run(service_fn(func)).await?;
    Ok(())
}
