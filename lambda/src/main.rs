use aws_sdk_dynamodb::{model::AttributeValue, output::GetItemOutput, Client};
use lambda_http::{
    handler,
    lambda_runtime::{self, Context, Error as LambdaError},
    Body, IntoResponse, Request, Response,
};
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
    #[error("host was not found")]
    HostNotFound,
    #[error("location format is invalid")]
    InvalidFormat,
    #[error("request is invalid")]
    BadRequest,
}

impl IntoResponse for RedirectGetError {
    fn into_response(self) -> Response<Body> {
        let status = match self {
            RedirectGetError::HostNotFound => 404,
            _ => 500,
        };
        let response = RedirectGetErrorResponse {
            r#type: format!("{:#?}", self),
            message: format!("{:}", self),
        };
        Response::builder()
            .status(status)
            .body(Body::from(serde_json::to_string(&response).unwrap()))
            .expect("failed to render result")
    }
}

fn get_item_to_response(output: GetItemOutput) -> Response<Body> {
    let record = if let Some(item) = output.item {
        item
    } else {
        return RedirectGetError::HostNotFound.into_response();
    };
    let location_attr = record.get("location");
    let location_raw = if let Some(location_value) = location_attr {
        location_value.as_s()
    } else {
        return RedirectGetError::HostNotFound.into_response();
    };

    match location_raw {
        Ok(location) => Response::builder()
            .status(301)
            .header("Location", location)
            .body(Body::Empty)
            .expect("failed to render result"),
        Err(_) => RedirectGetError::InvalidFormat.into_response(),
    }
}

#[tokio::main]
async fn main() -> Result<(), LambdaError> {
    lambda_runtime::run(handler(func)).await?;
    Ok(())
}

async fn func(event: Request, _: Context) -> Result<impl IntoResponse, LambdaError> {
    let shared_config = aws_config::load_from_env().await;
    let client = Client::new(&shared_config);
    let host_header = event.headers().get("Host").unwrap().to_str();
    println!("Looking up: {:?}", host_header);
    let host = if let Ok(header) = host_header {
        header.to_string()
    } else {
        return Ok(RedirectGetError::BadRequest.into_response());
    };

    client
        .get_item()
        .table_name(std::env::var("REDIRECT_TABLE").unwrap())
        .key("host", AttributeValue::S(host))
        .send()
        .await
        .map(get_item_to_response)
        .map_err(|_| RedirectGetError::HostNotFound)
        .or_else(|e| Ok(e.into_response()))
}
